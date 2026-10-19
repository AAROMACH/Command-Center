'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Hammer, Package, Plus, Trash2, Loader2, BadgePercent, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { isClient } from '@/lib/permissions';
import { useAllSubscriptions, usePricingSettings, useServicePlans } from '@/hooks/use-billing';
import { describeFactor, formatMoney } from '@/lib/billing';
import {
  describeDiscount, lineAmount, materialPrice, planDiscountFor, priceTotals,
  type PlanDiscount, type PriceBookItem, type PriceLine, type PriceSection, type PriceTotals,
} from '@/lib/price-lines';
import type { Material, Project, QuoteOptionalGroup, QuoteOptionItem, Technician, WorkOrder } from '@/lib/types';

/**
 * The one editor for quotes and invoices: centered dialog, customer, Labor
 * and Materials sections priced from the price book (Assets & Materials), the
 * client's service-plan discount, tax and totals. Quote-only fields (expiry,
 * optional add-ons, outside customers) and invoice-only fields (number, dates,
 * related job, status) switch on `kind`. The caller turns the result into a
 * Quote or Invoice doc and saves it.
 */

export type PriceDocKind = 'quote' | 'invoice';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export type PriceDocValues = {
  customerType: 'in_app_client' | 'external_customer';
  clientId: string;
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
  title: string;
  description: string;
  scopeSummary: string;
  /** Quote terms / invoice notes. */
  terms: string;
  // quote
  expirationDate: string;
  optionalGroups: QuoteOptionalGroup[];
  // invoice
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  relatedId: string;
  status: InvoiceStatus;
  lines: PriceLine[];
};

export type PriceDocResult = PriceDocValues & {
  discount: PlanDiscount | null;
  totals: PriceTotals;
  /** The chosen in-app client, for names/emails on the saved doc. */
  client?: Technician;
};

const genId = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export function emptyPriceDoc(kind: PriceDocKind): PriceDocValues {
  return {
    customerType: 'in_app_client', clientId: '', customerName: '', customerCompany: '', customerEmail: '', customerPhone: '',
    title: '', description: '', scopeSummary: '',
    terms: kind === 'quote' ? 'Payment due within 30 days of invoice.' : '',
    expirationDate: '', optionalGroups: [],
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    issueDate: today(), dueDate: plusDays(30), relatedId: '', status: 'draft',
    lines: [],
  };
}

const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const inputCls = 'h-9 text-[12px] bg-bg-secondary border-border-main';
const areaCls = 'w-full text-[12px] bg-bg-secondary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40';

export function PriceDocEditor({
  open, onClose, kind, initial, initialDiscount, title, saveLabel, saving, onSave, externalOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  kind: PriceDocKind;
  /** Values to start from (editing, a CRM lead, or a quote being invoiced). */
  initial?: Partial<PriceDocValues>;
  /** A discount already on the doc. undefined = use the client's plan;
   *  null = the doc was saved without one. */
  initialDiscount?: PlanDiscount | null;
  title: string;
  saveLabel: string;
  saving: boolean;
  onSave: (result: PriceDocResult) => void;
  /** Sales Portal: can't read client accounts or plans — outside customers only. */
  externalOnly?: boolean;
}) {
  const [v, setV] = useState<PriceDocValues>(() => ({ ...emptyPriceDoc(kind), ...initial }));
  // 'auto' = the client's plan discount; 'removed' = taken off for this doc;
  // a PlanDiscount = the one saved on the doc being edited.
  const [discountMode, setDiscountMode] = useState<'auto' | 'removed' | PlanDiscount>('auto');

  useEffect(() => {
    if (!open) return;
    setV({ ...emptyPriceDoc(kind), ...(externalOnly ? { customerType: 'external_customer' } : {}), ...initial });
    setDiscountMode(initialDiscount === undefined ? 'auto' : initialDiscount === null ? 'removed' : initialDiscount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof PriceDocValues>(k: K, val: PriceDocValues[K]) => setV(p => ({ ...p, [k]: val }));

  // ── Data: clients, plans, price book, jobs ──
  const { settings } = usePricingSettings();
  const { plans } = useServicePlans();
  const { subscriptions } = useAllSubscriptions(!externalOnly);
  const [clients, setClients] = useState<Technician[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  useEffect(() => {
    if (!open) return;
    const subs = [
      onSharedSnapshot('materials', snap => setMaterials(snap.docs.map(d => ({ ...d.data(), id: d.id } as Material))), () => setMaterials([])),
    ];
    if (!externalOnly) subs.push(onSharedSnapshot('users', snap => setClients(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)).filter(isClient)
      .sort((a, b) => (a.clientCompany || a.name || '').localeCompare(b.clientCompany || b.name || ''))), () => setClients([])));
    if (kind === 'invoice' && !externalOnly) {
      subs.push(onSharedSnapshot('projects', snap => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project))), () => setProjects([])));
      subs.push(onSharedSnapshot('assignments', snap => setJobs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))), () => setJobs([])));
    }
    return () => subs.forEach(u => u());
  }, [open, kind, externalOnly]);

  const priceBook = useMemo<PriceBookItem[]>(() => [
    ...settings.laborRates.map(r => ({
      id: `rate:${r.id}`, name: r.unit === 'hour' ? `${r.label} ($${r.rate}/hr)` : r.label, unitPrice: r.rate,
      section: 'labor' as const, taxable: false, group: 'Labor rates',
    })),
    ...materials.filter(m => m.status !== 'inactive').map(m => ({
      id: `mat:${m.id}`, name: m.name, unitPrice: materialPrice(m, settings), section: 'material' as const,
      taxable: m.taxable !== false, group: m.category || 'Other',
    })),
  ], [settings, materials]);

  // ── Discount ──
  const client = clients.find(c => c.id === v.clientId);
  const planDiscount = v.customerType === 'in_app_client' ? planDiscountFor(v.clientId, subscriptions, plans) : null;
  const discount: PlanDiscount | null = discountMode === 'auto' ? planDiscount : discountMode === 'removed' ? null : discountMode;
  const totals = useMemo(() => priceTotals(v.lines, discount, settings.salesTaxPct), [v.lines, discount, settings.salesTaxPct]);

  const pickClient = (id: string) => { set('clientId', id); setDiscountMode('auto'); };

  // ── Lines ──
  const addLine = (section: PriceSection, from?: PriceBookItem) => setV(p => ({
    ...p, lines: [...p.lines, {
      id: genId(), name: from?.name || '', quantity: 1, unitPrice: from?.unitPrice || 0, section,
      taxable: section === 'material' ? (from ? from.taxable : true) : false, required: true,
      ...(from ? { itemRef: from.id } : {}),
    }],
  }));
  const setLine = (id: string, patch: Partial<PriceLine>) => setV(p => ({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, ...patch } : l) }));
  // Labor multiplier picker: 'std', a price-book multiplier id, or 'saved'
  // (one on an older doc that's no longer in the price book).
  const multiplierKey = (l: PriceLine) => {
    if (l.multiplier == null && !l.emergency) return 'std';
    const m = settings.multipliers.find(x => x.factor === l.multiplier && x.label === l.multiplierLabel);
    return m ? m.id : 'saved';
  };
  const multiplierPatch = (key: string): Partial<PriceLine> => {
    if (key === 'saved') return {};
    const m = settings.multipliers.find(x => x.id === key);
    return m ? { multiplier: m.factor, multiplierLabel: m.label, emergency: false } : { multiplier: undefined, multiplierLabel: undefined, emergency: false };
  };
  const removeLine = (id: string) => setV(p => ({ ...p, lines: p.lines.filter(l => l.id !== id) }));

  // ── Optional add-ons (quotes) ──
  const groups = v.optionalGroups;
  const setGroups = (g: QuoteOptionalGroup[]) => set('optionalGroups', g);
  const updateGroup = (gi: number, patch: Partial<QuoteOptionalGroup>) => setGroups(groups.map((g, i) => i === gi ? { ...g, ...patch } : g));
  const updateOption = (gi: number, oi: number, patch: Partial<QuoteOptionItem>) =>
    updateGroup(gi, { options: groups[gi].options.map((o, i) => i === oi ? { ...o, ...patch } : o) });

  const section = (s: PriceSection) => {
    const rows = v.lines.filter(l => l.section === s);
    const items = priceBook.filter(i => i.section === s);
    const groupNames = [...new Set(items.map(i => i.group))];
    const isLabor = s === 'labor';
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
            {isLabor ? <Hammer size={14} className="text-brand-red" /> : <Package size={14} className="text-accent-gold" />}
            {isLabor ? 'Labor (not taxed)' : `Materials (${settings.salesTaxPct}% tax on taxable items)`}
          </h3>
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={id => { const it = items.find(i => i.id === id); if (it) addLine(s, it); }}>
              <SelectTrigger className="h-8 w-[190px] text-[11px] bg-bg-secondary border-border-main" disabled={items.length === 0}>
                <SelectValue placeholder={items.length ? 'Add from price book…' : 'Price book is empty'} />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main max-h-[320px]">
                {groupNames.map(g => (
                  <SelectGroup key={g}>
                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-2 py-1">{g}</SelectLabel>
                    {items.filter(i => i.group === g).map(i => (
                      <SelectItem key={i.id} value={i.id} className="text-[12px]">{i.name} · {formatMoney(i.unitPrice)}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => addLine(s)}>
              <Plus size={12} className="mr-1" /> Custom
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-[11px] text-text-muted px-1">No {isLabor ? 'labor' : 'materials'} yet.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="hidden sm:grid grid-cols-[1fr,64px,96px,112px,80px,28px] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>{isLabor ? 'Description' : 'Item'}</span>
              <span className="text-center">{isLabor ? 'Hrs' : 'Qty'}</span>
              <span className="text-center">{isLabor ? 'Rate' : 'Unit price'}</span>
              <span className="text-center">{isLabor ? 'Multiplier' : 'Taxable'}</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {rows.map(l => (
              <div key={l.id} className="grid grid-cols-[1fr,28px] sm:grid-cols-[1fr,64px,96px,112px,80px,28px] gap-2 items-center p-2 rounded-lg border border-border-sub bg-bg-secondary">
                <Input className="h-8 text-[12px] bg-bg-primary border-border-sub col-span-1" value={l.name}
                  onChange={e => setLine(l.id, { name: e.target.value })} placeholder={isLabor ? 'Installation labor' : 'CAT6 plenum cable'} />
                <button type="button" onClick={() => removeLine(l.id)} className="sm:hidden text-text-muted hover:text-brand-red justify-self-center"><Trash2 size={13} /></button>
                <div className="col-span-2 sm:col-span-1 grid grid-cols-[64px,1fr,auto] sm:contents gap-2 items-center">
                  <Input type="number" className="h-8 text-[12px] bg-bg-primary border-border-sub text-center" value={l.quantity}
                    onChange={e => setLine(l.id, { quantity: parseFloat(e.target.value) || 0 })} />
                  <Input type="number" className="h-8 text-[12px] bg-bg-primary border-border-sub text-center font-mono" value={l.unitPrice}
                    onChange={e => setLine(l.id, { unitPrice: parseFloat(e.target.value) || 0 })} />
                  {isLabor ? (
                    <Select value={multiplierKey(l)} onValueChange={k => setLine(l.id, multiplierPatch(k))}>
                      <SelectTrigger className="h-8 text-[11px] bg-bg-primary border-border-sub" title="Rate multiplier"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="std" className="text-[12px]">Standard ×1</SelectItem>
                        {settings.multipliers.map(m => <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.label} {describeFactor(m.factor)}</SelectItem>)}
                        {multiplierKey(l) === 'saved' && <SelectItem value="saved" className="text-[12px]">{l.multiplierLabel || (l.emergency ? 'Emergency' : 'Saved')} ×{l.multiplier ?? 1.5}</SelectItem>}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5" title="Charge sales tax on this item">
                      <span className="sm:hidden text-[10px] text-text-muted">Tax</span>
                      <Switch className="scale-75" checked={l.taxable} onCheckedChange={val => setLine(l.id, { taxable: val })} />
                    </div>
                  )}
                </div>
                <span className="hidden sm:block text-right text-[12px] font-mono font-bold text-text-primary">{formatMoney(lineAmount(l))}</span>
                <button type="button" onClick={() => removeLine(l.id)} className="hidden sm:block text-text-muted hover:text-brand-red justify-self-center"><Trash2 size={13} /></button>
                <span className="sm:hidden col-span-2 text-right text-[12px] font-mono font-bold text-text-primary">{formatMoney(lineAmount(l))}</span>
                {kind === 'quote' && (
                  <label className="col-span-2 sm:col-span-6 flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer px-1">
                    <input type="checkbox" className="accent-brand-red" checked={l.required !== false} onChange={e => setLine(l.id, { required: e.target.checked })} />
                    Required
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const canSave = v.customerType === 'in_app_client' ? !!v.clientId : !!(v.customerName || v.customerCompany);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-bg-elevated border-border-main max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-[12px] text-text-muted">
            Prices come from Assets &amp; Materials. A client on a service plan gets its discount automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Customer */}
          {!externalOnly && (
            <div className="flex gap-2">
              {(['in_app_client', 'external_customer'] as const).map(t => (
                <button key={t} type="button" onClick={() => { set('customerType', t); setDiscountMode('auto'); }}
                  className={cn('flex-1 py-2 text-[12px] font-medium rounded-md border transition-colors',
                    v.customerType === t ? 'bg-brand-red/10 text-brand-red border-brand-red/30' : 'border-border-sub text-text-muted hover:border-border-main')}>
                  {t === 'in_app_client' ? 'App client' : 'Outside customer'}
                </button>
              ))}
            </div>
          )}
          {v.customerType === 'in_app_client' ? (
            <div className="space-y-1.5">
              <Label className={labelCls}>Client *</Label>
              <Select value={v.clientId} onValueChange={pickClient}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.clientCompany || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {planDiscount && (
                <p className="text-[11px] text-text-green flex items-center gap-1.5"><BadgePercent size={12} /> On the {planDiscount.planName} plan — {describeDiscount(planDiscount)}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className={labelCls}>Name</Label>
                <Input className={inputCls} value={v.customerName} onChange={e => set('customerName', e.target.value)} placeholder="Jane Smith" /></div>
              <div className="space-y-1.5"><Label className={labelCls}>Company</Label>
                <Input className={inputCls} value={v.customerCompany} onChange={e => set('customerCompany', e.target.value)} placeholder="Acme Corp" /></div>
              <div className="space-y-1.5"><Label className={labelCls}>Email{kind === 'quote' ? ' *' : ''}</Label>
                <Input type="email" className={inputCls} value={v.customerEmail} onChange={e => set('customerEmail', e.target.value)} placeholder="jane@acme.com" /></div>
              <div className="space-y-1.5"><Label className={labelCls}>Phone</Label>
                <Input className={inputCls} value={v.customerPhone} onChange={e => set('customerPhone', e.target.value)} placeholder="555-000-0000" /></div>
            </div>
          )}

          {/* Details */}
          <div className="space-y-3 border-t border-border-sub pt-4">
            {kind === 'quote' ? (
              <>
                <div className="space-y-1.5"><Label className={labelCls}>Title *</Label>
                  <Input className={inputCls} value={v.title} onChange={e => set('title', e.target.value)} placeholder="Security camera installation — 4 units" /></div>
                <div className="space-y-1.5"><Label className={labelCls}>Description</Label>
                  <textarea rows={2} className={areaCls} value={v.description} onChange={e => set('description', e.target.value)} placeholder="Brief overview of the project…" /></div>
                <div className="space-y-1.5"><Label className={labelCls}>Scope summary</Label>
                  <textarea rows={2} className={areaCls} value={v.scopeSummary} onChange={e => set('scopeSummary', e.target.value)} placeholder="What's included in this quote…" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className={labelCls}>Expires</Label>
                    <Input type="date" className={inputCls} value={v.expirationDate} onChange={e => set('expirationDate', e.target.value)} /></div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label className={labelCls}>Invoice #</Label>
                    <Input className={`${inputCls} font-mono`} value={v.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className={labelCls}>Issue date</Label>
                    <Input type="date" className={inputCls} value={v.issueDate} onChange={e => set('issueDate', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className={labelCls}>Due date</Label>
                    <Input type="date" className={inputCls} value={v.dueDate} onChange={e => set('dueDate', e.target.value)} /></div>
                </div>
                {!externalOnly && (
                  <div className="space-y-1.5"><Label className={labelCls}>Related project or job</Label>
                    <Select value={v.relatedId || 'none'} onValueChange={id => set('relatedId', id === 'none' ? '' : id)}>
                      <SelectTrigger className={inputCls}><SelectValue placeholder="Link a project or job…" /></SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main max-h-[320px]">
                        <SelectItem value="none">None</SelectItem>
                        <SelectGroup>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-2 py-1">Projects</SelectLabel>
                          {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-[12px]">{p.name}</SelectItem>)}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-2 py-1">Jobs</SelectLabel>
                          {jobs.filter(j => !v.clientId || (j as { clientId?: string }).clientId === v.clientId || j.id === v.relatedId).slice(0, 200).map(j => (
                            <SelectItem key={j.id} value={j.id} className="text-[12px]">{j.id.toUpperCase()} — {j.title || j.description}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Lines */}
          <div className="space-y-5 border-t border-border-sub pt-4">
            {section('labor')}
            {section('material')}
          </div>

          {/* Optional add-ons (quotes) */}
          {kind === 'quote' && (
            <div className="space-y-2 border-t border-border-sub pt-4">
              <div className="flex items-center justify-between">
                <p className={labelCls}>Optional add-ons</p>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setGroups([...groups, {
                  id: genId(), title: '', description: '', requiredSelection: false,
                  options: [{ id: genId(), label: '', priceAdjustment: 0, selected: false }],
                }])}><Plus size={10} className="mr-1" /> Add group</Button>
              </div>
              {groups.map((g, gi) => (
                <div key={g.id} className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input className="h-8 text-[12px] bg-bg-primary border-border-sub flex-1" value={g.title} onChange={e => updateGroup(gi, { title: e.target.value })} placeholder="Group title (e.g. Camera upgrade)" />
                    <button type="button" onClick={() => setGroups(groups.filter((_, i) => i !== gi))} className="text-text-muted hover:text-brand-red"><Trash2 size={13} /></button>
                  </div>
                  {g.options.map((o, oi) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <Input className="h-8 text-[12px] bg-bg-primary border-border-sub flex-1" value={o.label} onChange={e => updateOption(gi, oi, { label: e.target.value })} placeholder="Option" />
                      <Input type="number" className="h-8 text-[12px] bg-bg-primary border-border-sub w-24" value={o.priceAdjustment}
                        onChange={e => updateOption(gi, oi, { priceAdjustment: parseFloat(e.target.value) || 0 })} placeholder="+$" />
                      <button type="button" onClick={() => updateGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} className="text-text-muted hover:text-brand-red"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] text-text-muted"
                    onClick={() => updateGroup(gi, { options: [...g.options, { id: genId(), label: '', priceAdjustment: 0, selected: false }] })}>
                    <Plus size={9} className="mr-1" /> Add option
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Notes + totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border-sub pt-4">
            <div className="space-y-1.5">
              <Label className={labelCls}>{kind === 'quote' ? 'Terms' : 'Notes'}</Label>
              <textarea rows={5} className={areaCls} value={v.terms} onChange={e => set('terms', e.target.value)}
                placeholder={kind === 'quote' ? 'Terms…' : 'Terms, scope notes or payment instructions…'} />
            </div>
            <div className="rounded-lg bg-bg-secondary border border-border-sub p-4 space-y-2 text-[12px]">
              <div className="flex justify-between"><span className="text-text-muted">Labor</span><span className="font-mono">{formatMoney(totals.laborSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Materials</span><span className="font-mono">{formatMoney(totals.materialsSubtotal)}</span></div>
              {discount ? (
                <div className="flex justify-between items-start gap-2 text-text-green">
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5"><BadgePercent size={12} /> {discount.planName} plan discount</span>
                    <span className="text-[10px] text-text-muted">{describeDiscount(discount)} ·{' '}
                      <button type="button" className="underline hover:text-brand-red" onClick={() => setDiscountMode('removed')}>remove</button></span>
                  </span>
                  <span className="font-mono">−{formatMoney(totals.discountAmount)}</span>
                </div>
              ) : planDiscount && discountMode === 'removed' ? (
                <button type="button" className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1" onClick={() => setDiscountMode('auto')}>
                  <Undo2 size={11} /> Apply {planDiscount.planName} plan discount
                </button>
              ) : null}
              <div className="flex justify-between text-accent-gold"><span>Sales tax ({settings.salesTaxPct}%, materials)</span><span className="font-mono">{formatMoney(totals.taxAmount)}</span></div>
              <div className="flex justify-between items-center border-t border-dashed border-border-sub pt-2">
                <span className="font-bold text-text-primary">Total</span>
                <span className="text-xl font-mono font-bold text-text-green">{formatMoney(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 flex-wrap sm:justify-between">
          {kind === 'invoice' ? (
            <Select value={v.status} onValueChange={s => set('status', s as InvoiceStatus)}>
              <SelectTrigger className="h-9 w-[150px] text-[12px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={saving || !canSave} className="bg-brand-red hover:bg-brand-red/90 text-white"
              onClick={() => onSave({ ...v, discount, totals, client })}>
              {saving && <Loader2 size={12} className="animate-spin mr-1.5" />}{saveLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
