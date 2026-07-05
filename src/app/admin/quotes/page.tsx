'use client';

import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { Quote, QuoteLineItem, QuoteOptionalGroup, QuoteOptionItem, QuoteStatus, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { format, parseISO } from 'date-fns';
import {
  FileSearch, Plus, Send, Copy, Clock, CheckCircle2, XCircle,
  Archive, RotateCcw, Trash2, ExternalLink, ChevronRight,
  Building2, User, Mail, Phone, DollarSign, FileText, Loader2,
  Edit3, ArrowRight, Settings,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function genToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'qtk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function calcTotals(items: QuoteLineItem[]) {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmount = items.filter(i => i.taxable).reduce((s, i) => s + i.total * 0.08, 0);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

function statusCls(s: QuoteStatus) {
  if (s === 'draft') return 'bg-bg-tertiary text-text-muted border-border-sub';
  if (s === 'sent') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (s === 'viewed') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
  if (s === 'approved') return 'bg-text-green/10 text-text-green border-text-green/30';
  if (s === 'rejected' || s === 'expired') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (s === 'changes_requested') return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
  return 'bg-bg-tertiary text-text-muted border-border-sub';
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ── Preset Catalog ────────────────────────────────────────────────────────────

type PresetItem = { id: string; name: string; unitPrice: number; category: QuoteLineItem['category']; taxable: boolean };
const PRESET_CATALOG: { group: string; items: PresetItem[] }[] = [
  { group: 'Labor & Services', items: [
    { id: 'labor_fiber', name: 'Fiber Optic Labor ($150/hr)', unitPrice: 150, category: 'labor', taxable: false },
    { id: 'labor_install', name: 'Installation Labor ($120/hr)', unitPrice: 120, category: 'labor', taxable: false },
    { id: 'labor_diag', name: 'Troubleshooting ($100/hr)', unitPrice: 100, category: 'labor', taxable: false },
    { id: 'labor_smart', name: 'Smart Hands ($85/hr)', unitPrice: 85, category: 'labor', taxable: false },
    { id: 'service_call', name: 'Service Dispatch Fee', unitPrice: 75, category: 'service', taxable: false },
  ]},
  { group: 'Cabling & Wiring', items: [
    { id: 'cat6_plenum', name: 'CAT6 Plenum Cable (1000ft)', unitPrice: 450, category: 'materials', taxable: true },
    { id: 'cat6_riser', name: 'CAT6 Riser Cable (1000ft)', unitPrice: 280, category: 'materials', taxable: true },
    { id: 'fiber_sm', name: 'Single-Mode Fiber (per ft)', unitPrice: 2, category: 'materials', taxable: true },
    { id: 'keystones', name: 'Keystone Jacks (24-pack)', unitPrice: 120, category: 'materials', taxable: true },
  ]},
  { group: 'Hardware', items: [
    { id: 'patch_panel_24', name: 'Patch Panel 24-Port', unitPrice: 180, category: 'equipment', taxable: true },
    { id: 'rack_12u', name: '12U Wall Rack', unitPrice: 320, category: 'equipment', taxable: true },
    { id: 'poe_switch', name: 'PoE Switch 8-Port', unitPrice: 240, category: 'equipment', taxable: true },
  ]},
];

// ── New Quote Dialog ──────────────────────────────────────────────────────────

function NewQuoteDialog({
  open,
  onClose,
  clients,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: Technician[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setFirebaseUser(u));
    return unsub;
  }, []);
  const [customerType, setCustomerType] = useState<'in_app_client' | 'external_customer'>('in_app_client');
  const [clientId, setClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scopeSummary, setScopeSummary] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days of invoice.');
  const [expirationDate, setExpirationDate] = useState('');
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([{
    id: genId(), name: '', description: '', quantity: 1, unitPrice: 0, total: 0,
    taxable: false, category: 'labor', required: true,
  }]);
  const [optionalGroups, setOptionalGroups] = useState<QuoteOptionalGroup[]>([]);

  const { subtotal, taxAmount, total } = useMemo(() => calcTotals(lineItems), [lineItems]);

  const updateLineItem = (idx: number, field: keyof QuoteLineItem, value: any) => {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.total = Number(updated.quantity) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  const addLineItem = () => setLineItems(prev => [...prev, {
    id: genId(), name: '', description: '', quantity: 1, unitPrice: 0, total: 0,
    taxable: false, category: 'labor', required: true,
  }]);

  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const handlePremadeItemSelect = (idx: number, itemId: string) => {
    const preset = PRESET_CATALOG.flatMap(g => g.items).find(i => i.id === itemId);
    if (!preset) return;
    setLineItems(prev => prev.map((item, i) => i !== idx ? item : {
      ...item,
      name: preset.name,
      unitPrice: preset.unitPrice,
      total: item.quantity * preset.unitPrice,
      category: preset.category,
      taxable: preset.taxable,
    }));
  };

  const addOptionalGroup = () => setOptionalGroups(prev => [...prev, {
    id: genId(), title: '', description: '', requiredSelection: false,
    options: [{ id: genId(), label: '', priceAdjustment: 0, selected: false }],
  }]);

  const updateGroup = (gIdx: number, field: keyof QuoteOptionalGroup, value: any) => {
    setOptionalGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, [field]: value } : g));
  };

  const addOption = (gIdx: number) => {
    setOptionalGroups(prev => prev.map((g, i) =>
      i === gIdx ? { ...g, options: [...g.options, { id: genId(), label: '', priceAdjustment: 0, selected: false }] } : g
    ));
  };

  const updateOption = (gIdx: number, oIdx: number, field: keyof QuoteOptionItem, value: any) => {
    setOptionalGroups(prev => prev.map((g, gi) =>
      gi === gIdx ? { ...g, options: g.options.map((o, oi) => oi === oIdx ? { ...o, [field]: value } : o) } : g
    ));
  };

  const removeOption = (gIdx: number, oIdx: number) => {
    setOptionalGroups(prev => prev.map((g, gi) =>
      gi === gIdx ? { ...g, options: g.options.filter((_, oi) => oi !== oIdx) } : g
    ));
  };

  const handleSave = async () => {
    if (!firebaseUser) { toast({ variant: 'destructive', title: 'Authentication required', description: 'Please refresh and try again.' }); return; }
    if (!title) { toast({ variant: 'destructive', title: 'Title required' }); return; }
    if (customerType === 'in_app_client' && !clientId) { toast({ variant: 'destructive', title: 'Select a client' }); return; }
    if (customerType === 'external_customer' && !customerEmail) { toast({ variant: 'destructive', title: 'Customer email required' }); return; }

    setSaving(true);
    try {
      const quoteId = await createDocId(ID_PREFIXES.QUOTE);
      const selectedClient = clients.find(c => c.id === clientId);
      const now = new Date().toISOString();
      const quote: Omit<Quote, 'id'> = {
        quoteNumber: quoteId,
        customerType,
        clientId: customerType === 'in_app_client' ? clientId : null,
        customerName: customerType === 'in_app_client'
          ? (selectedClient?.clientCompany || selectedClient?.name || '')
          : customerName,
        customerCompany: customerType === 'in_app_client'
          ? (selectedClient?.clientCompany || null)
          : (customerCompany || null),
        customerEmail: customerType === 'in_app_client' ? (selectedClient?.email || '') : customerEmail,
        customerPhone: customerType === 'in_app_client' ? (selectedClient?.phone || null) : (customerPhone || null),
        title,
        description,
        scopeSummary,
        lineItems,
        optionalChoices: optionalGroups,
        subtotal,
        taxAmount,
        discountAmount: 0,
        total,
        terms,
        expirationDate: expirationDate || null,
        publicToken: null,
        status: 'draft',
        sentAt: null,
        viewedAt: null,
        approvedAt: null,
        rejectedAt: null,
        approvedByName: null,
        approvedByEmail: null,
        approvalNote: null,
        rejectionReason: null,
        createdBy: firebaseUser.uid,
        createdAt: now,
        updatedAt: now,
        originalQuoteId: null,
        revisionNumber: 1,
        supersededByQuoteId: null,
        convertedToWorkOrderId: null,
        convertedToProjectId: null,
        convertedToInvoiceId: null,
      };
      await setDoc(doc(db, 'quotes', quoteId), { id: quoteId, ...quote });
      toast({ title: 'Quote created', description: `${quoteId} saved as draft.` });
      onSaved();
      onClose();
    } catch (e: any) {
      const desc = e?.code === 'permission-denied'
        ? 'Your account does not have permission to create quotes. Contact a super admin.'
        : e.message;
      toast({ variant: 'destructive', title: 'Failed', description: desc });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-bg-elevated border-border-main max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[13px] font-black uppercase tracking-widest">New Quote</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Customer type */}
          <div className="flex gap-2">
            {(['in_app_client', 'external_customer'] as const).map(t => (
              <button key={t} type="button" onClick={() => setCustomerType(t)}
                className={cn('flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded border transition-colors',
                  customerType === t ? 'bg-brand-red/10 text-brand-red border-brand-red/30' : 'border-border-sub text-text-muted hover:border-border-main')}>
                {t === 'in_app_client' ? 'App Client' : 'External Customer'}
              </button>
            ))}
          </div>

          {/* Customer info */}
          {customerType === 'in_app_client' ? (
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-[10px]">
                      {c.clientCompany || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Name</Label>
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company</Label>
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={customerCompany} onChange={e => setCustomerCompany(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email *</Label>
                <Input type="email" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="jane@acme.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</Label>
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="555-000-0000" />
              </div>
            </div>
          )}

          {/* Quote info */}
          <div className="space-y-3 border-t border-border-sub pt-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Quote Details</p>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Title *</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={title} onChange={e => setTitle(e.target.value)} placeholder="Security camera installation — 4 units" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Description</Label>
              <textarea rows={2} className="w-full text-[11px] bg-bg-secondary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40"
                value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief overview of the project..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Scope Summary</Label>
              <textarea rows={2} className="w-full text-[11px] bg-bg-secondary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40"
                value={scopeSummary} onChange={e => setScopeSummary(e.target.value)} placeholder="What's included in this quote..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expiration Date</Label>
                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Terms</Label>
              <textarea rows={2} className="w-full text-[11px] bg-bg-secondary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40"
                value={terms} onChange={e => setTerms(e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2 border-t border-border-sub pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Line Items</p>
              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={addLineItem}>
                <Plus size={10} className="mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={item.id} className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Preset</Label>
                    <Select onValueChange={v => handlePremadeItemSelect(idx, v)}>
                      <SelectTrigger className="h-7 text-[10px] bg-bg-tertiary border-border-sub">
                        <SelectValue placeholder="Select preset or enter below..." />
                      </SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main">
                        {PRESET_CATALOG.map(group => (
                          <SelectGroup key={group.group}>
                            <SelectLabel className="text-[8px] font-black uppercase tracking-widest text-text-muted px-2 py-1">{group.group}</SelectLabel>
                            {group.items.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Item Name</Label>
                      <Input className="h-7 text-[10px] bg-bg-tertiary border-border-sub" value={item.name}
                        onChange={e => updateLineItem(idx, 'name', e.target.value)} placeholder="Labor — installation" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Category</Label>
                      <Select value={item.category} onValueChange={v => updateLineItem(idx, 'category', v)}>
                        <SelectTrigger className="h-7 text-[10px] bg-bg-tertiary border-border-sub">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          {['labor', 'materials', 'travel', 'equipment', 'service', 'other'].map(c => (
                            <SelectItem key={c} value={c} className="text-[10px] capitalize">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Qty</Label>
                      <Input type="number" className="h-7 text-[10px] bg-bg-tertiary border-border-sub" value={item.quantity}
                        onChange={e => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Unit Price</Label>
                      <Input type="number" className="h-7 text-[10px] bg-bg-tertiary border-border-sub" value={item.unitPrice}
                        onChange={e => updateLineItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-text-primary">{fmtMoney(item.total)}</span>
                      <button type="button" onClick={() => removeLineItem(idx)} className="text-text-muted hover:text-brand-red transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-[9px] text-text-muted cursor-pointer">
                      <input type="checkbox" checked={item.taxable} onChange={e => updateLineItem(idx, 'taxable', e.target.checked)} className="accent-brand-red" />
                      Taxable
                    </label>
                    <label className="flex items-center gap-1.5 text-[9px] text-text-muted cursor-pointer">
                      <input type="checkbox" checked={item.required} onChange={e => updateLineItem(idx, 'required', e.target.checked)} className="accent-brand-red" />
                      Required
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right space-y-0.5 pt-2">
              <p className="text-[10px] text-text-muted">Subtotal: <span className="text-text-primary font-bold">{fmtMoney(subtotal)}</span></p>
              <p className="text-[10px] text-text-muted">Tax (8%): <span className="text-text-primary font-bold">{fmtMoney(taxAmount)}</span></p>
              <p className="text-[12px] font-black text-text-primary">Total: {fmtMoney(total)}</p>
            </div>
          </div>

          {/* Optional Choices */}
          <div className="space-y-2 border-t border-border-sub pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Optional Add-Ons</p>
              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={addOptionalGroup}>
                <Plus size={10} className="mr-1" /> Add Group
              </Button>
            </div>
            {optionalGroups.map((group, gIdx) => (
              <div key={group.id} className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-2">
                <Input className="h-7 text-[10px] bg-bg-tertiary border-border-sub" value={group.title}
                  onChange={e => updateGroup(gIdx, 'title', e.target.value)} placeholder="Group title (e.g. Camera Upgrade)" />
                {group.options.map((opt, oIdx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <Input className="h-7 text-[10px] bg-bg-tertiary border-border-sub flex-1" value={opt.label}
                      onChange={e => updateOption(gIdx, oIdx, 'label', e.target.value)} placeholder="Option label" />
                    <Input type="number" className="h-7 text-[10px] bg-bg-tertiary border-border-sub w-24"
                      value={opt.priceAdjustment} onChange={e => updateOption(gIdx, oIdx, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                      placeholder="+$" />
                    <button type="button" onClick={() => removeOption(gIdx, oIdx)} className="text-text-muted hover:text-brand-red"><Trash2 size={11} /></button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="h-6 text-[9px] font-bold uppercase text-text-muted" onClick={() => addOption(gIdx)}>
                  <Plus size={9} className="mr-1" /> Add Option
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[10px] font-black uppercase">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
            {saving && <Loader2 size={11} className="animate-spin mr-1.5" />}
            Save as Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Quote Card ────────────────────────────────────────────────────────────────

function QuoteCard({ quote, onClick }: { quote: Quote; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3 text-left hover:border-border-main transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-text-primary truncate">{quote.title}</p>
          <p className="text-[10px] text-text-muted">{quote.customerName || quote.customerCompany}</p>
        </div>
        <span className={cn('text-[8px] px-2 py-0.5 rounded border font-black uppercase tracking-widest shrink-0', statusCls(quote.status))}>
          {quote.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        <span className="font-mono text-[9px]">{quote.quoteNumber}</span>
        <span className="font-black text-text-primary">{fmtMoney(quote.total)}</span>
        {quote.expirationDate && (
          <span className="flex items-center gap-1"><Clock size={9} />Exp {quote.expirationDate}</span>
        )}
      </div>
      {quote.lineItems.length > 0 && (
        <p className="text-[9px] text-text-muted">{quote.lineItems.length} line item{quote.lineItems.length !== 1 ? 's' : ''}</p>
      )}
    </button>
  );
}

function QuoteRow({ quote, onClick }: { quote: Quote; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors text-left">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-text-primary truncate">{quote.title}</p>
        <p className="text-[10px] text-text-muted truncate">
          <span className="font-mono">{quote.quoteNumber}</span> · {quote.customerName || quote.customerCompany}
        </p>
      </div>
      {quote.expirationDate && (
        <span className="hidden md:flex items-center gap-1 text-[10px] text-text-muted shrink-0"><Clock size={9} />Exp {quote.expirationDate}</span>
      )}
      <span className="text-[11px] font-black text-text-primary shrink-0">{fmtMoney(quote.total)}</span>
      <span className={cn('text-[8px] px-2 py-0.5 rounded border font-black uppercase tracking-widest shrink-0', statusCls(quote.status))}>
        {quote.status.replace(/_/g, ' ')}
      </span>
    </button>
  );
}

// ── Quote Detail Sheet ────────────────────────────────────────────────────────

function QuoteDetailSheet({
  quote,
  onClose,
  onUpdated,
}: {
  quote: Quote | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [acting, setActing] = useState(false);

  if (!quote) return null;

  const publicUrl = quote.publicToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/public/quote/${quote.publicToken}`
    : null;

  const act = async (updates: Partial<Quote> & Record<string, any>) => {
    setActing(true);
    try {
      await updateDoc(doc(db, 'quotes', quote.id), { ...updates, updatedAt: new Date().toISOString() });
      toast({ title: 'Quote updated' });
      onUpdated();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActing(false);
    }
  };

  const handleSend = async () => {
    const token = quote.customerType === 'external_customer' && !quote.publicToken ? genToken() : quote.publicToken;
    await act({ status: 'sent', sentAt: new Date().toISOString(), publicToken: token });
    toast({ title: 'Quote sent', description: 'Status updated to Sent.' });
  };

  const handleCopyLink = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast({ title: 'Link copied', description: publicUrl });
    }
  };

  const handleConvert = async (target: 'work_order' | 'project' | 'invoice') => {
    const field = target === 'work_order' ? 'convertedToWorkOrderId'
      : target === 'project' ? 'convertedToProjectId'
      : 'convertedToInvoiceId';
    const status: QuoteStatus = target === 'work_order' ? 'converted_to_work_order'
      : target === 'project' ? 'converted_to_project'
      : 'converted_to_invoice';
    const refId = `${target.replace('_', '-')}-${Date.now()}`;
    await act({ status, [field]: refId });
    toast({ title: `Quote converted to ${target.replace('_', ' ')}`, description: `Ref: ${refId}` });
  };

  return (
    <Sheet open={!!quote} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border-sub">
          <SheetTitle className="text-[13px] font-black uppercase tracking-widest">{quote.title}</SheetTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono text-text-muted">{quote.quoteNumber}</span>
            <span className={cn('text-[8px] px-2 py-0.5 rounded border font-black uppercase tracking-widest', statusCls(quote.status))}>
              {quote.status.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] font-black text-text-primary">{fmtMoney(quote.total)}</span>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-5">
          {/* Customer */}
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Customer</p>
            <p className="text-[13px] font-bold text-text-primary">{quote.customerName}</p>
            {quote.customerCompany && <p className="text-[11px] text-text-secondary">{quote.customerCompany}</p>}
            {quote.customerEmail && (
              <p className="text-[11px] text-text-muted flex items-center gap-1"><Mail size={10} />{quote.customerEmail}</p>
            )}
            {quote.customerPhone && (
              <p className="text-[11px] text-text-muted flex items-center gap-1"><Phone size={10} />{quote.customerPhone}</p>
            )}
          </div>

          {/* Scope */}
          {quote.scopeSummary && (
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Scope</p>
              <p className="text-[11px] text-text-secondary leading-relaxed">{quote.scopeSummary}</p>
            </div>
          )}

          {/* Line items */}
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Line Items</p>
            <div className="rounded-lg border border-border-sub overflow-hidden">
              {quote.lineItems.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border-sub last:border-0">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-text-primary truncate">{item.name}</p>
                    <p className="text-[9px] text-text-muted">{item.quantity} × {fmtMoney(item.unitPrice)} · {item.category}</p>
                  </div>
                  <span className="text-[11px] font-black text-text-primary shrink-0 ml-3">{fmtMoney(item.total)}</span>
                </div>
              ))}
              <div className="px-3 py-2 bg-bg-tertiary space-y-0.5">
                <div className="flex justify-between text-[9px] text-text-muted">
                  <span>Subtotal</span><span>{fmtMoney(quote.subtotal)}</span>
                </div>
                {quote.taxAmount > 0 && (
                  <div className="flex justify-between text-[9px] text-text-muted">
                    <span>Tax</span><span>{fmtMoney(quote.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] font-black text-text-primary border-t border-border-sub pt-1 mt-1">
                  <span>Total</span><span>{fmtMoney(quote.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional choices */}
          {quote.optionalChoices.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Optional Add-Ons</p>
              {quote.optionalChoices.map(g => (
                <div key={g.id} className="rounded-lg border border-border-sub p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-text-primary">{g.title}</p>
                  {g.options.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-[10px]">
                      <span className={cn(o.selected ? 'text-text-green font-bold' : 'text-text-muted')}>{o.label}</span>
                      <span className="text-text-primary">+{fmtMoney(o.priceAdjustment)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Approval info */}
          {quote.approvedAt && (
            <div className="rounded-lg bg-text-green/5 border border-text-green/20 p-3 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-green">Approved</p>
              <p className="text-[11px] text-text-primary">{quote.approvedByName} — {quote.approvedByEmail}</p>
              <p className="text-[10px] text-text-muted">{format(parseISO(quote.approvedAt), 'MMM d, yyyy h:mm a')}</p>
              {quote.approvalNote && <p className="text-[10px] text-text-secondary italic">"{quote.approvalNote}"</p>}
            </div>
          )}
          {quote.rejectionReason && (
            <div className="rounded-lg bg-brand-red/5 border border-brand-red/20 p-3 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-brand-red">Rejected</p>
              <p className="text-[10px] text-text-secondary italic">"{quote.rejectionReason}"</p>
            </div>
          )}

          {/* Public link */}
          {publicUrl && (
            <div className="rounded-lg border border-border-sub p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Approval Link</p>
              <p className="text-[9px] text-text-muted font-mono break-all">{publicUrl}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase flex-1" onClick={handleCopyLink}>
                  <Copy size={10} className="mr-1" /> Copy Link
                </Button>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase">
                    <ExternalLink size={10} />
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* In-app client delivery note */}
          {quote.customerType === 'in_app_client' && quote.status !== 'draft' && (
            <div className="rounded-lg border border-border-sub p-3 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Client Delivery</p>
              <p className="text-[9px] text-text-muted leading-relaxed">
                This quote is visible to the client in their portal. No external link is required.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border-sub pt-4 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {quote.status === 'draft' && (
                <>
                  <Button size="sm" className="h-8 text-[9px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white col-span-2"
                    onClick={handleSend} disabled={acting}>
                    <Send size={11} className="mr-1.5" />Send Quote
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => act({ status: 'archived' })} disabled={acting}>
                    <Archive size={11} className="mr-1.5" />Archive
                  </Button>
                </>
              )}
              {(quote.status === 'sent' || quote.status === 'viewed') && (
                <>
                  <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase col-span-2"
                    onClick={handleSend} disabled={acting}>
                    <RotateCcw size={11} className="mr-1.5" />Resend
                  </Button>
                  {publicUrl && (
                    <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase"
                      onClick={handleCopyLink} disabled={acting}>
                      <Copy size={11} className="mr-1.5" />Copy Link
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => act({ status: 'expired' })} disabled={acting}>
                    <Clock size={11} className="mr-1.5" />Mark Expired
                  </Button>
                </>
              )}
              {quote.status === 'approved' && (
                <>
                  <Button size="sm" className="h-8 text-[9px] font-bold uppercase bg-blue-600 hover:bg-blue-600/90 text-white"
                    onClick={() => handleConvert('work_order')} disabled={acting || !!quote.convertedToWorkOrderId}>
                    <ArrowRight size={11} className="mr-1.5" />→ Work Order
                  </Button>
                  <Button size="sm" className="h-8 text-[9px] font-bold uppercase bg-purple-600 hover:bg-purple-600/90 text-white"
                    onClick={() => handleConvert('project')} disabled={acting || !!quote.convertedToProjectId}>
                    <ArrowRight size={11} className="mr-1.5" />→ Project
                  </Button>
                  <Button size="sm" className="h-8 text-[9px] font-bold uppercase bg-text-green hover:bg-text-green/90 text-white col-span-2"
                    onClick={() => handleConvert('invoice')} disabled={acting || !!quote.convertedToInvoiceId}>
                    <ArrowRight size={11} className="mr-1.5" />→ Invoice
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase col-span-2"
                    onClick={() => act({ status: 'archived' })} disabled={acting}>
                    <Archive size={11} className="mr-1.5" />Archive
                  </Button>
                </>
              )}
              {(quote.status === 'rejected' || quote.status === 'expired') && (
                <Button size="sm" variant="outline" className="h-8 text-[9px] font-bold uppercase col-span-2"
                  onClick={() => act({ status: 'archived' })} disabled={acting}>
                  <Archive size={11} className="mr-1.5" />Archive
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Quotes Page ──────────────────────────────────────────────────────────

export default function AdminQuotesPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Technician[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useViewMode('quotes');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'quotes'), snap => {
      setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
      setLoading(false);
    }, () => setLoading(false));

    const u2 = onSnapshot(collection(db, 'users'), snap => {
      setClients(
        snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Technician))
          .filter(u => u.roles?.includes('client') || u.role?.toLowerCase().includes('client'))
      );
    });

    return () => { u1(); u2(); };
  }, []);

  const draft     = quotes.filter(q => q.status === 'draft');
  const sent      = quotes.filter(q => q.status === 'sent' || q.status === 'viewed' || q.status === 'changes_requested');
  const approved  = quotes.filter(q => q.status === 'approved' || q.status === 'converted_to_work_order' || q.status === 'converted_to_project' || q.status === 'converted_to_invoice');
  const rejected  = quotes.filter(q => q.status === 'rejected' || q.status === 'expired' || q.status === 'archived' || q.status === 'superseded');

  function TabCount({ n }: { n: number }) {
    if (!n) return null;
    return (
      <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[8px] font-black min-w-[16px] h-4 px-1">
        {n}
      </span>
    );
  }

  const grid = (items: Quote[]) => (
    items.length === 0 ? (
      <div className="py-16 text-center text-text-muted">
        <FileSearch size={28} className="mx-auto mb-3 opacity-20" />
        <p className="text-[11px]">No quotes in this section</p>
      </div>
    ) : viewMode === 'grid' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(q => <QuoteCard key={q.id} quote={q} onClick={() => setSelectedQuote(q)} />)}
      </div>
    ) : (
      <div className="space-y-1">
        {items.map(q => <QuoteRow key={q.id} quote={q} onClick={() => setSelectedQuote(q)} />)}
      </div>
    )
  );

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <FileSearch size={12} />
            Quote Management
          </p>
          <h1 className="page-title">Quotes</h1>
          <p className="page-subtitle">Create, send, and track client quotes through to conversion.</p>
        </div>
        <div className="page-header-right items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={() => setIsNewOpen(true)} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest h-9">
            <Plus size={13} className="mr-1.5" />New Quote
          </Button>
        </div>
      </header>

      <Tabs defaultValue="draft" className="w-full">
        <TabsList className="tabs flex-wrap h-auto gap-1 p-1 mb-4">
          <TabsTrigger value="draft" className="tab">Draft<TabCount n={draft.length} /></TabsTrigger>
          <TabsTrigger value="sent" className="tab">Sent<TabCount n={sent.length} /></TabsTrigger>
          <TabsTrigger value="approved" className="tab">Approved<TabCount n={approved.length} /></TabsTrigger>
          <TabsTrigger value="rejected" className="tab">Rejected / Expired<TabCount n={rejected.length} /></TabsTrigger>
        </TabsList>

        <TabsContent value="draft" className="mt-0">{grid(draft)}</TabsContent>
        <TabsContent value="sent" className="mt-0">{grid(sent)}</TabsContent>
        <TabsContent value="approved" className="mt-0">{grid(approved)}</TabsContent>
        <TabsContent value="rejected" className="mt-0">{grid(rejected)}</TabsContent>
      </Tabs>

      <NewQuoteDialog
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        clients={clients}
        onSaved={() => {}}
      />

      <QuoteDetailSheet
        quote={selectedQuote}
        onClose={() => setSelectedQuote(null)}
        onUpdated={() => setSelectedQuote(null)}
      />
    </div>
  );
}
