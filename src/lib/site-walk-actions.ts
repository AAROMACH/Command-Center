'use client';

import { useEffect, useMemo, useState } from 'react';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { usePricingSettings } from '@/hooks/use-billing';
import type { LaborRate } from './billing';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import { priceTotals, toQuoteLines, unitLabel, type PlanDiscount, type PriceLine } from './price-lines';
import { syncLeadOnQuoteCreated } from './crm-actions';
import { NotificationService } from './notification-service';
import {
  DEFAULT_ASSUMPTIONS, DEFAULT_SERVICES, buildWalkLines, resolveCatalog, emptyConditions, marginStatus, priceLine, quoteTermsText, walkScopeText, walkTotals,
  type CatalogService, type EstimatingSettings, type PricedLine, type SiteWalk,
} from './estimating';
import type { Lead, Quote } from './types';

const SETTINGS_DOC = () => doc(db, 'adminConfig', 'estimating');

/**
 * Catalog + assumptions (Assets & Materials → Service catalog). Defaults = the
 * v3 workbook. `services` / `catalog` have hourly items that are linked to a
 * labor rate priced at that rate; `rawServices` is the catalog as saved.
 */
export function useEstimatingSettings(): EstimatingSettings & {
  loading: boolean; exists: boolean; catalog: Map<string, CatalogService>; rawServices: CatalogService[]; laborRates: LaborRate[];
} {
  const { settings: pricing } = usePricingSettings();
  const [state, setState] = useState<EstimatingSettings & { loading: boolean; exists: boolean }>({
    assumptions: DEFAULT_ASSUMPTIONS, services: DEFAULT_SERVICES, loading: true, exists: false,
  });
  useEffect(() => onSnapshot(SETTINGS_DOC(), snap => {
    const d = snap.exists() ? (snap.data() as Partial<EstimatingSettings>) : {};
    setState({
      assumptions: { ...DEFAULT_ASSUMPTIONS, ...(d.assumptions || {}) },
      // A saved catalog plus any built-in codes added since it was saved
      // (e.g. FIB-01), so new site walk add-ons always have a price.
      services: d.services?.length
        ? [...d.services, ...DEFAULT_SERVICES.filter(x => !d.services!.some(y => y.code === x.code))]
        : DEFAULT_SERVICES,
      loading: false, exists: snap.exists(),
    });
  }, () => setState(s => ({ ...s, loading: false }))), []);
  const services = useMemo(() => resolveCatalog(state.services, pricing.laborRates), [state.services, pricing.laborRates]);
  const catalog = useMemo(() => new Map(services.map(s => [s.code, s])), [services]);
  return { ...state, services, rawServices: state.services, laborRates: pricing.laborRates, catalog };
}

export const saveEstimatingSettings = (s: EstimatingSettings) =>
  setDoc(SETTINGS_DOC(), JSON.parse(JSON.stringify({ ...s, updatedAt: new Date().toISOString() })));

export function newSiteWalk(by: { id: string; name: string }, prefill: Partial<SiteWalk> = {}): SiteWalk {
  const now = new Date().toISOString();
  return {
    id: '', status: 'draft', mode: 'on_site',
    customerCompany: '', contactName: '', contactPhone: '', contactEmail: '',
    siteName: '', siteAddress: '', siteState: DEFAULT_ASSUMPTIONS.homeState, walkDate: now.slice(0, 10),
    areas: [], conditions: emptyConditions(), drops: [], manualLines: [], skippedSuggestions: [],
    answers: {}, photos: [], scopeNotes: '', lines: [],
    leadId: null, clientId: null, assignedTechId: null, assignedTechName: null,
    createdBy: by.id, createdByName: by.name, createdAt: now, updatedAt: now,
    ...prefill,
  };
}

/** Save a walk (creates its id the first time). Returns the id. */
export async function saveSiteWalk(w: SiteWalk): Promise<string> {
  const id = w.id || await createDocId(ID_PREFIXES.SITE_WALK);
  await setDoc(doc(db, 'siteWalks', id), JSON.parse(JSON.stringify({ ...w, id, updatedAt: new Date().toISOString() })));
  return id;
}

/** Walker is done: snapshot the lines and send it to admin review. */
export async function submitSiteWalk(w: SiteWalk, settings: EstimatingSettings): Promise<string> {
  const lines = buildWalkLines(w, settings.assumptions);
  const id = await saveSiteWalk({ ...w, lines, status: 'submitted', submittedAt: new Date().toISOString(), returnNote: null });
  NotificationService.notifyAdmins('Site walk ready for review',
    `${w.createdByName} submitted a site walk for ${w.customerCompany || w.siteName || 'a customer'} (${lines.length} line${lines.length === 1 ? '' : 's'}).`).catch(() => {});
  return id;
}

export async function returnSiteWalk(w: SiteWalk, note: string, by: string): Promise<void> {
  await updateDoc(doc(db, 'siteWalks', w.id), { status: 'returned', returnNote: note, reviewedBy: by, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const to = w.assignedTechId || w.createdBy;
  if (to) NotificationService.notify(to, 'Site walk sent back', `${by} sent back the site walk for ${w.customerCompany || w.siteName}: ${note}`, undefined, { portal: 'tech' }).catch(() => {});
}

/** Quote lines for priced walk lines: one per catalog service, untaxed. */
export const walkQuoteLines = (priced: PricedLine[]): PriceLine[] => priced.filter(l => l.service && l.qty > 0).map(l => ({
  id: l.id.replace(/[^a-z0-9-]/gi, '') || Math.random().toString(36).slice(2, 10),
  name: l.service!.name, quantity: l.qty, unitPrice: l.sell, section: 'labor', taxable: false,
  itemRef: `svc:${l.code}`, required: true, sourceCategory: 'service', unit: unitLabel(l.service!.unit),
}));

/**
 * Totals with a client's service-plan discount. Catalog services are bundled
 * prices, so they sit in the quote's Labor section and take the plan's labor
 * discount — the same thing the quote editor shows when the quote is opened.
 * Margin is on what the client actually pays (after the discount).
 */
export function walkTotalsWithPlan(priced: PricedLine[], discount: PlanDiscount | null, a: EstimatingSettings['assumptions']) {
  const base = walkTotals(priced, a);
  const discountAmount = discount ? priceTotals(walkQuoteLines(priced), discount, 0).discountAmount : 0;
  const net = Math.round((base.subtotal - discountAmount) * 100) / 100;
  const gp = Math.round((net - base.cost) * 100) / 100;
  const gmPct = net > 0 ? Math.round((gp / net) * 1000) / 10 : null;
  const tax = Math.round(net * (a.taxPct || 0)) / 100;
  return { ...base, discountAmount, net, gp, gmPct, tax, total: Math.round((net + tax) * 100) / 100, status: marginStatus(gmPct, a) };
}

/**
 * Approve: the walk's priced lines become a draft quote (catalog target ×
 * price adjustment), with the walk's scope and the standard terms. Returns
 * the quote id.
 */
export async function approveSiteWalk(w: SiteWalk, settings: EstimatingSettings, customer: {
  customerType: 'in_app_client' | 'external_customer'; clientId: string | null; name: string; company: string | null; email: string; phone: string | null;
}, by: { id: string; name: string }, discount: PlanDiscount | null = null): Promise<string> {
  const a = settings.assumptions;
  const catalog = new Map(settings.services.map(s => [s.code, s]));
  const priced = w.lines.map(l => priceLine(l, catalog, a)).filter(l => l.service && l.qty > 0);
  if (!priced.length) throw new Error('Nothing to quote — add at least one line.');
  const planDiscount = customer.customerType === 'in_app_client' ? discount : null;
  const t = walkTotalsWithPlan(priced, planDiscount, a);
  const lines = walkQuoteLines(priced);
  const quoteId = await createDocId(ID_PREFIXES.QUOTE);
  const now = new Date();
  const expires = new Date(now.getTime() + a.quoteValidityDays * 86400000).toISOString().slice(0, 10);
  const quote: Omit<Quote, 'id'> & Record<string, unknown> = {
    quoteNumber: quoteId,
    customerType: customer.customerType,
    clientId: customer.clientId,
    customerName: customer.name,
    customerCompany: customer.company,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    title: [w.customerCompany || w.siteName, w.siteName && w.customerCompany ? w.siteName : ''].filter(Boolean).join(' — ') || 'Site walk quote',
    description: `From site walk ${w.id}`,
    scopeSummary: walkScopeText(w, a),
    lineItems: toQuoteLines(lines),
    optionalChoices: [],
    subtotal: t.subtotal, taxAmount: t.tax, discountAmount: t.discountAmount, planDiscount, total: t.total,
    terms: quoteTermsText(a),
    expirationDate: expires,
    publicToken: null, status: 'draft', sentAt: null, viewedAt: null, approvedAt: null, rejectedAt: null,
    approvedByName: null, approvedByEmail: null, approvalNote: null, rejectionReason: null,
    createdBy: by.id, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    originalQuoteId: null, revisionNumber: 1, supersededByQuoteId: null,
    convertedToWorkOrderId: null, convertedToProjectId: null, convertedToInvoiceId: null,
    leadId: w.leadId ?? null,
    siteWalkId: w.id,
  };
  await setDoc(doc(db, 'quotes', quoteId), JSON.parse(JSON.stringify({ id: quoteId, ...quote })));
  await updateDoc(doc(db, 'siteWalks', w.id), {
    status: 'approved', quoteId, lines: w.lines, reviewedBy: by.name, reviewedAt: now.toISOString(), updatedAt: now.toISOString(),
    // Margin at approval stays with the walk (staff only) — never on the
    // quote, which the client can read.
    approvedEstimate: { directCost: t.cost, grossProfit: t.gp, gmPct: t.gmPct, discountAmount: t.discountAmount },
  });
  if (w.leadId) {
    const lead = await getDoc(doc(db, 'leads', w.leadId)).catch(() => null);
    if (lead?.exists()) await syncLeadOnQuoteCreated({ ...lead.data(), id: lead.id } as Lead, quoteId, t.total, by.id).catch(() => {});
  }
  const to = w.assignedTechId || w.createdBy;
  if (to && to !== by.id) NotificationService.notify(to, 'Site walk approved', `Your site walk for ${w.customerCompany || w.siteName} was approved and quoted.`, undefined, { portal: 'tech' }).catch(() => {});
  return quoteId;
}

/** Delete a draft walk (techs: their own drafts; office: any draft). */
export async function deleteSiteWalk(id: string): Promise<void> {
  await deleteDoc(doc(db, 'siteWalks', id));
  try { localStorage.removeItem(`sitewalk:${id}`); } catch { /* private mode */ }
}
