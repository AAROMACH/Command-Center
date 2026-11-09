import 'server-only';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getConnection, qboGet, qboPost, qboQuery } from './quickbooks';

/**
 * App ↔ QuickBooks Online sync.
 *
 *  App → QuickBooks: every sent invoice (and its customer). Labor and
 *    materials post to two Service items, "Labor" and "Materials"; a plan
 *    discount is a discount line; any sales tax the app charged is its own
 *    "Sales tax (app)" line so totals match exactly. Online card and bank
 *    payment are allowed on each invoice — that's the "Pay now" link.
 *  QuickBooks → App: when a synced invoice's balance hits $0 (the customer
 *    paid it through QuickBooks Payments), the app marks it Paid.
 *  Voided in the app → voided in QuickBooks.
 *
 * Links are stored on the records (invoice.qbo, users.accounting.qboCustomer,
 * integrations/quickbooks/customers/{key} for outside customers) so a sync
 * never creates anything twice.
 */

const fs = () => getFirestore(adminApp);
const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const now = () => new Date().toISOString();

type Inv = Record<string, any> & { id: string };
export type InvoiceQbo = { id: string; syncToken: string; link?: string | null; syncedAt: string; balance?: number; error?: string | null };

const SYNCABLE = ['sent', 'overdue', 'paid'];

// ── Items ────────────────────────────────────────────────────────────────

async function incomeAccountId(): Promise<string> {
  const q = await qboQuery("SELECT Id, Name FROM Account WHERE AccountType = 'Income' AND Active = true MAXRESULTS 50");
  const list = (q.QueryResponse?.Account || []) as { Id: string; Name: string }[];
  const pick = list.find(a => /service/i.test(a.Name)) || list.find(a => /sales/i.test(a.Name)) || list[0];
  if (!pick) throw new Error('QuickBooks has no income account to post sales to. Add one in QuickBooks (Chart of accounts), then sync again.');
  return pick.Id;
}

const itemCache = new Map<string, string>();
async function itemId(name: string): Promise<string> {
  if (itemCache.has(name)) return itemCache.get(name)!;
  const q = await qboQuery(`SELECT Id FROM Item WHERE Name = '${esc(name)}'`);
  let id = q.QueryResponse?.Item?.[0]?.Id as string | undefined;
  if (!id) {
    const created = await qboPost('/item', { Name: name, Type: 'Service', IncomeAccountRef: { value: await incomeAccountId() } });
    id = created.Item.Id as string;
  }
  itemCache.set(name, id);
  return id;
}

// ── Customers ────────────────────────────────────────────────────────────

type CustomerInfo = { key: string; name: string; email: string | null; ref: DocumentReference; existing: string | null; userDoc: boolean };

async function customerInfo(inv: Inv): Promise<CustomerInfo> {
  if (inv.clientId) {
    const ref = fs().doc(`users/${inv.clientId}`);
    const u = (await ref.get()).data() || {};
    const name = String(u.accounting?.customerDisplayName || u.clientCompany || inv.clientName || u.name || inv.clientId).trim();
    return { key: inv.clientId, name, email: u.billingEmail || u.email || inv.customerEmail || null, ref, existing: u.accounting?.qboCustomer?.id || null, userDoc: true };
  }
  const email = String(inv.customerEmail || '').trim().toLowerCase();
  const name = String(inv.clientName || email || 'Customer').trim();
  const key = (email || name).replace(/[\/.#$\[\]]/g, '_').slice(0, 200);
  const ref = fs().doc(`integrations/quickbooks/customers/${key}`);
  return { key, name, email: email || null, ref, existing: (await ref.get()).data()?.id || null, userDoc: false };
}

async function ensureCustomer(inv: Inv): Promise<string> {
  const c = await customerInfo(inv);
  if (c.existing) return c.existing;
  // QuickBooks display names are unique: reuse one that's already there.
  const q = await qboQuery(`SELECT Id FROM Customer WHERE DisplayName = '${esc(c.name.slice(0, 100))}'`);
  let id = q.QueryResponse?.Customer?.[0]?.Id as string | undefined;
  if (!id) {
    const created = await qboPost('/customer', {
      DisplayName: c.name.slice(0, 100),
      ...(c.email ? { PrimaryEmailAddr: { Address: c.email } } : {}),
    });
    id = created.Customer.Id as string;
  }
  const link = { id, syncedAt: now() };
  if (c.userDoc) await c.ref.set({ accounting: { qboCustomer: link } }, { merge: true });
  else await c.ref.set(link);
  return id;
}

// ── Vendors (1099 contractors) ───────────────────────────────────────────

type Person = Record<string, any> & { id: string };

/** Techs marked "1099 contractor" in their profile that aren't linked to a QuickBooks vendor yet. */
async function contractorsToLink(): Promise<Person[]> {
  const snap = await fs().collection('users').where('accounting.workerType', '==', '1099_contractor').get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Person)).filter(u => !u.accounting?.qboVendor?.id && !u.archived);
}

/**
 * Create (or link an existing) QuickBooks vendor for a contractor, marked for
 * 1099 tracking. Bank details for Bill Pay are added in QuickBooks — the API
 * can't store them.
 */
async function ensureVendor(u: Person): Promise<string> {
  const name = String(u.accounting?.payeeLegalName || u.name || u.id).trim().slice(0, 100);
  const q = await qboQuery(`SELECT Id FROM Vendor WHERE DisplayName = '${esc(name)}'`);
  let id = q.QueryResponse?.Vendor?.[0]?.Id as string | undefined;
  if (!id) {
    const parts = String(u.name || '').trim().split(/\s+/);
    const created = await qboPost('/vendor', {
      DisplayName: name,
      ...(parts.length > 1 ? { GivenName: parts[0].slice(0, 100), FamilyName: parts.slice(1).join(' ').slice(0, 100) } : {}),
      ...(u.accounting?.payeeBusinessName ? { CompanyName: String(u.accounting.payeeBusinessName).slice(0, 100) } : {}),
      ...(u.email ? { PrimaryEmailAddr: { Address: u.email } } : {}),
      ...(u.phone ? { PrimaryPhone: { FreeFormNumber: String(u.phone).slice(0, 30) } } : {}),
      ...(u.address ? { BillAddr: { Line1: String(u.address).slice(0, 500) } } : {}),
      Vendor1099: true,
    });
    id = created.Vendor.Id as string;
  }
  await fs().doc(`users/${u.id}`).set({ accounting: { qboVendor: { id, syncedAt: now(), error: null } } }, { merge: true });
  return id;
}

// ── Invoices ─────

type LineIn = { description?: string; quantity?: number; unitPrice?: number; category?: string; multiplier?: number; isEmergencyProtocol?: boolean };
/** Labor multipliers (after-hours ×1.5 etc.) — same rule as the invoice and PDF. */
const lineFactor = (l: LineIn) => (l.category === 'labor' ? (typeof l.multiplier === 'number' ? l.multiplier : l.isEmergencyProtocol ? 1.5 : 1) : 1);
/** QuickBooks needs at least one priced line. */
const hasPricedLine = (inv: Inv) => ((inv.lineItems || []) as LineIn[]).some(l => roundCents((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * lineFactor(l)) !== 0);
// ────────────────────────────────────────────────────────

async function invoiceLines(inv: Inv) {
  const lines: any[] = [];
  for (const l of (inv.lineItems || []) as LineIn[]) {
    const qty = Number(l.quantity) || 0, price = roundCents((Number(l.unitPrice) || 0) * lineFactor(l));
    const amount = roundCents(qty * price);
    if (!amount) continue;
    lines.push({
      DetailType: 'SalesItemLineDetail', Amount: amount, Description: String(l.description || '').slice(0, 4000),
      SalesItemLineDetail: { ItemRef: { value: await itemId(l.category === 'material' ? 'Materials' : 'Labor') }, Qty: qty, UnitPrice: price },
    });
  }
  const discount = roundCents(Number(inv.discountAmount) || 0);
  if (discount > 0) lines.push({ DetailType: 'DiscountLineDetail', Amount: discount, DiscountLineDetail: { PercentBased: false } });
  const tax = roundCents(Number(inv.tax) || 0);
  if (tax > 0) {
    lines.push({ DetailType: 'SalesItemLineDetail', Amount: tax, Description: 'Sales tax',
      SalesItemLineDetail: { ItemRef: { value: await itemId('Sales tax (app)') }, Qty: 1, UnitPrice: tax } });
  }
  return lines;
}

/** Create or update one invoice in QuickBooks; returns its link info. Throws on failure. */
export async function pushInvoice(inv: Inv): Promise<InvoiceQbo> {
  const customerId = await ensureCustomer(inv);
  const prev = inv.qbo as InvoiceQbo | undefined;
  const body: Record<string, any> = {
    CustomerRef: { value: customerId },
    DocNumber: String(inv.invoiceNumber || inv.id).slice(0, 21),
    Line: await invoiceLines(inv),
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
    ...(inv.issueDate ? { TxnDate: String(inv.issueDate).slice(0, 10) } : {}),
    ...(inv.dueDate ? { DueDate: String(inv.dueDate).slice(0, 10) } : {}),
    ...(inv.customerEmail ? { BillEmail: { Address: inv.customerEmail } } : {}),
    ...(inv.notes ? { CustomerMemo: { value: String(inv.notes).slice(0, 1000) } } : {}),
  };
  let saved: any;
  if (prev?.id) {
    // Full update needs the current SyncToken; read it fresh.
    const cur = (await qboGet(`/invoice/${prev.id}`)).Invoice;
    if (Number(cur.Balance) < Number(cur.TotalAmt)) {
      // Already (partly) paid in QuickBooks — don't rewrite a paid invoice.
      saved = cur;
    } else {
      saved = (await qboPost('/invoice', { ...body, Id: prev.id, SyncToken: cur.SyncToken })).Invoice;
    }
  } else {
    saved = (await qboPost('/invoice', body)).Invoice;
  }
  let link: string | null = prev?.link || null;
  try { link = (await qboGet(`/invoice/${saved.Id}?include=invoiceLink`)).Invoice?.InvoiceLink || link; } catch { /* Payments off → no link */ }
  return { id: saved.Id, syncToken: saved.SyncToken, link, syncedAt: now(), balance: Number(saved.Balance), error: null };
}

/** Push one invoice and save the link on it. Never throws; returns the error text instead. */
export async function syncInvoiceById(id: string): Promise<{ ok: boolean; link?: string | null; error?: string }> {
  if (!(await getConnection())) return { ok: false, error: 'QuickBooks isn’t connected.' };
  const ref = fs().doc(`invoices/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'Invoice not found' };
  const inv = { ...snap.data(), id: snap.id } as Inv;
  if (!hasPricedLine(inv)) return { ok: false, error: 'This invoice has no priced lines, so it can’t go to QuickBooks. Add a price to at least one line.' };
  try {
    const qbo = await pushInvoice(inv);
    await ref.update({ qbo });
    return { ok: true, link: qbo.link };
  } catch (e) {
    const error = String((e as Error)?.message || e).slice(0, 300);
    await ref.update({ 'qbo.error': error, 'qbo.syncedAt': now() }).catch(() => {});
    return { ok: false, error };
  }
}

// ── Whole sync ───────────────────────────────────────────────────────────

const syncedAtOf = (inv: Inv) => Date.parse(inv.qbo?.syncedAt || '') || 0;
const changedAtOf = (inv: Inv) => Math.max(Date.parse(inv.updatedAt || '') || 0, Date.parse(inv.sentAt || '') || 0);
const needsPush = (inv: Inv) => SYNCABLE.includes(inv.status) && hasPricedLine(inv) && (!inv.qbo?.id || !!inv.qbo?.error || changedAtOf(inv) > syncedAtOf(inv));
const needsVoid = (inv: Inv) => inv.status === 'void' && !!inv.qbo?.id && !inv.qbo?.voided;
const awaitingPayment = (inv: Inv) => !!inv.qbo?.id && (inv.status === 'sent' || inv.status === 'overdue');

export type SyncPlan = { push: number; newInvoices: number; voids: number; checkPaid: number; newCustomers: number; newVendors: string[]; skippedEmpty: string[] };

async function allInvoices(): Promise<Inv[]> {
  return (await fs().collection('invoices').get()).docs.map(d => ({ ...d.data(), id: d.id } as Inv));
}

export async function previewSync(): Promise<SyncPlan> {
  const invs = await allInvoices();
  const push = invs.filter(needsPush);
  const keys = new Set(push.filter(i => !i.qbo?.id).map(i => i.clientId || String(i.customerEmail || i.clientName || '').toLowerCase()));
  let newCustomers = 0;
  for (const k of keys) {
    const linked = invs.some(i => (i.clientId || String(i.customerEmail || i.clientName || '').toLowerCase()) === k && i.qbo?.id);
    if (!linked) newCustomers++;
  }
  const newVendors = (await contractorsToLink()).map(u => String(u.accounting?.payeeLegalName || u.name || u.id));
  const skippedEmpty = invs.filter(i => SYNCABLE.includes(i.status) && !i.qbo?.id && !hasPricedLine(i)).map(i => i.invoiceNumber || i.id);
  return { skippedEmpty, push: push.length, newInvoices: push.filter(i => !i.qbo?.id).length, voids: invs.filter(needsVoid).length, checkPaid: invs.filter(awaitingPayment).length, newCustomers, newVendors };
}

export type SyncResult = { pushed: number; voided: number; markedPaid: number; vendors: number; failed: { invoice: string; error: string }[] };

export async function runSync(by: string): Promise<SyncResult> {
  const invs = await allInvoices();
  const res: SyncResult = { pushed: 0, voided: 0, markedPaid: 0, vendors: 0, failed: [] };

  for (const u of await contractorsToLink()) {
    try { await ensureVendor(u); res.vendors++; }
    catch (e) {
      const error = String((e as Error).message).slice(0, 300);
      await fs().doc(`users/${u.id}`).set({ accounting: { qboVendor: { id: '', error, syncedAt: now() } } }, { merge: true }).catch(() => {});
      res.failed.push({ invoice: `Vendor: ${u.name || u.id}`, error });
    }
  }
  const label = (i: Inv) => i.invoiceNumber || i.id;

  for (const inv of invs.filter(needsPush)) {
    const r = await syncInvoiceById(inv.id);
    if (r.ok) res.pushed++; else res.failed.push({ invoice: label(inv), error: r.error || 'failed' });
  }

  for (const inv of invs.filter(needsVoid)) {
    try {
      const cur = (await qboGet(`/invoice/${inv.qbo.id}`)).Invoice;
      await qboPost('/invoice?operation=void', { Id: cur.Id, SyncToken: cur.SyncToken });
      await fs().doc(`invoices/${inv.id}`).update({ 'qbo.voided': true, 'qbo.syncedAt': now() });
      res.voided++;
    } catch (e) { res.failed.push({ invoice: label(inv), error: String((e as Error).message).slice(0, 300) }); }
  }

  // Paid in QuickBooks → Paid in the app. Re-read after the pushes above.
  const fresh = (await allInvoices()).filter(awaitingPayment);
  for (let i = 0; i < fresh.length; i += 30) {
    const batch = fresh.slice(i, i + 30);
    try {
      const q = await qboQuery(`SELECT Id, Balance, TotalAmt FROM Invoice WHERE Id IN (${batch.map(b => `'${esc(b.qbo.id)}'`).join(',')})`);
      for (const row of (q.QueryResponse?.Invoice || []) as { Id: string; Balance: number; TotalAmt: number }[]) {
        const inv = batch.find(b => b.qbo.id === row.Id);
        if (!inv) continue;
        if (Number(row.TotalAmt) > 0 && Number(row.Balance) === 0) {
          await fs().doc(`invoices/${inv.id}`).update({ status: 'paid', paidAt: now(), paidVia: 'quickbooks', 'qbo.balance': 0, 'qbo.syncedAt': now() });
          res.markedPaid++;
        } else if (Number(row.Balance) !== inv.qbo.balance) {
          await fs().doc(`invoices/${inv.id}`).update({ 'qbo.balance': Number(row.Balance) });
        }
      }
    } catch (e) { res.failed.push({ invoice: 'payment check', error: String((e as Error).message).slice(0, 300) }); }
  }

  await fs().doc('integrations/quickbooks').set({ lastSync: { at: now(), by, ...res, failed: res.failed.length } }, { merge: true });
  return res;
}
