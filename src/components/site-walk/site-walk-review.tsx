'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { isClient, isSuperAdmin } from '@/lib/permissions';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { MARGIN_LABEL, genLineId, priceLine, walkTotals, type SiteWalk, type WalkLine } from '@/lib/estimating';
import { approveSiteWalk, returnSiteWalk, useEstimatingSettings } from '@/lib/site-walk-actions';
import type { Technician } from '@/lib/types';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const STATUS_CLS = {
  on_target: 'border-green-border/40 bg-green-dim text-text-green',
  below_target: 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold',
  below_floor: 'border-brand-red/40 bg-brand-red/10 text-text-red',
  none: 'border-border-sub text-text-muted',
} as const;

/**
 * Admin review of a submitted site walk: catalog pricing, direct cost and
 * gross margin per line (the workbook's Quote Builder), a price adjustment
 * per line, then approve → draft quote, or send back to the tech.
 */
export function SiteWalkReview({ walk, onClose, onQuoteCreated }: {
  walk: SiteWalk | null;
  onClose: () => void;
  onQuoteCreated?: (quoteId: string) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const settings = useEstimatingSettings();
  const a = settings.assumptions;
  const [lines, setLines] = useState<WalkLine[]>([]);
  const [busy, setBusy] = useState<'save' | 'approve' | 'return' | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [showReturn, setShowReturn] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [clients, setClients] = useState<Technician[]>([]);
  const [customerType, setCustomerType] = useState<'in_app_client' | 'external_customer'>('external_customer');
  const [clientId, setClientId] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!walk) return;
    setLines(walk.lines || []);
    setReturnNote(''); setShowReturn(false); setShowDetail(false); setAddSearch('');
    setCustomerType(walk.clientId ? 'in_app_client' : 'external_customer');
    setClientId(walk.clientId || '');
    setEmail(walk.contactEmail || '');
  }, [walk?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onSharedSnapshot('users', s => setClients(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)).filter(isClient)
    .sort((x, y) => (x.clientCompany || x.name || '').localeCompare(y.clientCompany || y.name || ''))), () => setClients([])), []);

  const priced = useMemo(() => lines.map(l => priceLine(l, settings.catalog, a)), [lines, settings.catalog, a]);
  const totals = useMemo(() => walkTotals(priced, a), [priced, a]);
  const addChoices = useMemo(() => {
    const words = addSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return settings.services.filter(s => s.active !== false && words.every(w => `${s.name} ${s.code} ${s.category}`.toLowerCase().includes(w))).slice(0, 8);
  }, [addSearch, settings.services]);

  if (!walk) return null;
  const by = { id: user?.id || '', name: user?.name || 'Admin' };
  const editable = walk.status === 'submitted';
  const belowFloor = totals.status === 'below_floor';
  const canApproveLow = isSuperAdmin(user);
  const setLine = (id: string, patch: Partial<WalkLine>) => setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const client = clients.find(c => c.id === clientId);

  const save = async () => {
    setBusy('save');
    try {
      await updateDoc(doc(db, 'siteWalks', walk.id), { lines: JSON.parse(JSON.stringify(lines)), updatedAt: new Date().toISOString() });
      toast({ title: 'Saved' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not save', description: e.message }); }
    finally { setBusy(null); }
  };

  const approve = async () => {
    if (belowFloor && !canApproveLow) return;
    if (customerType === 'in_app_client' && !client) { toast({ variant: 'destructive', title: 'Pick the client' }); return; }
    if (customerType === 'external_customer' && !email.trim()) { toast({ variant: 'destructive', title: 'Customer email required', description: 'Needed to send the quote.' }); return; }
    setBusy('approve');
    try {
      const quoteId = await approveSiteWalk({ ...walk, lines }, settings, customerType === 'in_app_client' ? {
        customerType, clientId: client!.id, name: client!.clientCompany || client!.name || '', company: client!.clientCompany || null, email: client!.email || '', phone: client!.phone || null,
      } : {
        customerType, clientId: null, name: walk.contactName || walk.customerCompany, company: walk.customerCompany || null, email: email.trim(), phone: walk.contactPhone || null,
      }, by);
      toast({ title: 'Approved — draft quote created', description: `${quoteId} is in Drafts, ready to review and send.` });
      onQuoteCreated?.(quoteId);
      onClose();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not approve', description: e.message }); }
    finally { setBusy(null); }
  };

  const sendBack = async () => {
    if (!returnNote.trim()) return;
    setBusy('return');
    try {
      await returnSiteWalk(walk, returnNote.trim(), by.name);
      toast({ title: 'Sent back', description: `${walk.assignedTechName || walk.createdByName} will see your note.` });
      onClose();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not send back', description: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={!!walk} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-bg-elevated border-border-main sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <Badge variant="outline" className="text-[11px] uppercase tracking-wider">Site walk</Badge>
            <span className="text-[12px] font-mono text-text-muted">{walk.id}</span>
            <Badge variant={walk.status === 'approved' ? 'approved' : walk.status === 'returned' ? 'disputed' : 'info'} className="text-[10px] uppercase">{walk.status}</Badge>
          </div>
          <DialogTitle className="text-lg">{walk.customerCompany || walk.siteName}{walk.siteName && walk.customerCompany ? ` · ${walk.siteName}` : ''}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {[walk.siteAddress, walk.siteState].filter(Boolean).join(', ')} · {walk.mode === 'remote' ? 'Remote' : 'On site'} {walk.walkDate} · by {walk.createdByName}
            {walk.quoteId && <> · quote <span className="font-mono">{walk.quoteId}</span></>}
          </DialogDescription>
        </DialogHeader>

        <button type="button" onClick={() => setShowDetail(v => !v)} className="text-[13px] font-medium text-text-secondary hover:text-text-primary flex items-center gap-1 w-fit">
          {showDetail ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Walk details — conditions, drops, answers, {walk.photos.length} photo{walk.photos.length === 1 ? '' : 's'}
        </button>
        {showDetail && (
          <div className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-3 text-[12px]">
            {walk.contactName && <p><span className="text-text-muted">Contact:</span> {walk.contactName} {walk.contactPhone} {walk.contactEmail}</p>}
            {walk.conditions.accessNotes && <p><span className="text-text-muted">Access:</span> {walk.conditions.accessNotes}</p>}
            {walk.drops.filter(d => d.qty).length > 0 && (
              <div><p className="text-text-muted">Drops:</p>{walk.drops.filter(d => d.qty).map(d => (
                <p key={d.id} className="font-mono">• {d.label || '—'}: {d.qty} × {d.cable}{d.plenum ? ' plenum' : ''}, {d.horizontalFt}+{d.verticalFt}+{d.slackFt} = {d.horizontalFt + d.verticalFt + d.slackFt} ft</p>
              ))}</div>
            )}
            {Object.entries(walk.answers || {}).filter(([, v]) => v?.trim()).map(([q, v]) => <p key={q}><span className="text-text-muted">{q}</span> {v}</p>)}
            {walk.scopeNotes && <p><span className="text-text-muted">Notes:</span> {walk.scopeNotes}</p>}
            {walk.photos.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {walk.photos.map(p => (
                  <a key={p.storagePath} href={p.url} target="_blank" rel="noreferrer" className="aspect-square rounded-md overflow-hidden border border-border-sub">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lines */}
        <div className="table-wrap rounded-lg border border-border-sub">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-tertiary text-text-muted">
              <tr className="text-left">
                <th className="px-2 py-2 font-semibold">Service</th>
                <th className="px-2 py-2 font-semibold text-right">Qty</th>
                <th className="px-2 py-2 font-semibold text-right">Catalog</th>
                <th className="px-2 py-2 font-semibold text-right" title="1.10 = +10%, 0.95 = −5%">Adj.</th>
                <th className="px-2 py-2 font-semibold text-right">Sell / unit</th>
                <th className="px-2 py-2 font-semibold text-right">Extended</th>
                <th className="px-2 py-2 font-semibold text-right">Direct cost</th>
                <th className="px-2 py-2 font-semibold text-right">GM %</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {priced.map(l => (
                <tr key={l.id} className="border-t border-border-sub align-top">
                  <td className="px-2 py-2 min-w-[200px]">
                    <p className="font-semibold text-text-primary">{l.service?.name || <span className="text-text-red">Unknown code {l.code}</span>}</p>
                    <p className="text-text-muted">{l.code} · per {l.service?.unit}{l.notes ? ` · ${l.notes}` : ''}</p>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {editable ? <Input type="number" inputMode="decimal" value={l.qty} onChange={e => setLine(l.id, { qty: parseFloat(e.target.value) || 0 })} className="h-8 w-20 ml-auto text-right font-mono" /> : <span className="font-mono">{l.qty}</span>}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-text-muted whitespace-nowrap" title="Low – target – high">
                    {l.service ? <>{fmt(l.service.priceTarget)}<span className="block text-[11px]">{fmt(l.service.priceLow)}–{fmt(l.service.priceHigh)}</span></> : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {editable ? <Input type="number" step="0.05" inputMode="decimal" value={l.priceFactor ?? 1} onChange={e => setLine(l.id, { priceFactor: parseFloat(e.target.value) || 1 })} className="h-8 w-20 ml-auto text-right font-mono" /> : <span className="font-mono">{l.priceFactor ?? 1}</span>}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(l.sell)}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">{fmt(l.extended)}</td>
                  <td className="px-2 py-2 text-right font-mono text-text-muted">{fmt(l.cost)}</td>
                  <td className={cn('px-2 py-2 text-right font-mono font-semibold', l.gmPct == null ? 'text-text-muted' : l.gmPct >= a.targetGmPct ? 'text-text-green' : l.gmPct >= a.floorGmPct ? 'text-accent-gold' : 'text-text-red')}>
                    {l.gmPct == null ? '—' : `${l.gmPct}%`}
                  </td>
                  <td className="px-1 py-2">
                    {editable && <button type="button" aria-label="Remove line" className="h-8 w-8 flex items-center justify-center text-text-muted hover:text-text-red" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="space-y-1.5">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Add a line — search the service catalog" className="pl-8 h-9" />
            </div>
            {addChoices.length > 0 && (
              <div className="max-w-md rounded-lg border border-border-sub divide-y divide-border-sub">
                {addChoices.map(s => (
                  <button key={s.code} type="button" className="w-full flex justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-bg-tertiary"
                    onClick={() => { setLines(ls => [...ls, { id: genLineId(), code: s.code, qty: 1, source: 'manual' }]); setAddSearch(''); }}>
                    <span><span className="font-semibold">{s.name}</span> <span className="text-text-muted">· {s.code} · per {s.unit}</span></span>
                    <span className="font-mono flex items-center gap-1">{fmt(s.priceTarget)} <Plus size={12} /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Totals + customer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] font-semibold text-text-secondary">Quote to</p>
            <div className="grid grid-cols-2 gap-2">
              {(['in_app_client', 'external_customer'] as const).map(t => (
                <button key={t} type="button" disabled={!editable} onClick={() => setCustomerType(t)}
                  className={cn('h-9 rounded-md border text-[12px] font-medium', customerType === t ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
                  {t === 'in_app_client' ? 'App client' : 'Outside customer'}
                </button>
              ))}
            </div>
            {customerType === 'in_app_client' ? (
              <Select value={clientId} onValueChange={setClientId} disabled={!editable}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent>{clients.map(cl => <SelectItem key={cl.id} value={cl.id}>{cl.clientCompany || cl.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="space-y-1">
                <Label className="text-[11px] text-text-muted">{walk.contactName || walk.customerCompany} — email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!editable} className="h-9" placeholder="customer@company.com" />
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-text-muted">Customer subtotal</span><span className="font-mono">{fmt(totals.subtotal)}</span></div>
            {totals.tax > 0 && <div className="flex justify-between"><span className="text-text-muted">Tax ({a.taxPct}%)</span><span className="font-mono">{fmt(totals.tax)}</span></div>}
            <div className="flex justify-between"><span className="text-text-muted">Direct cost</span><span className="font-mono">{fmt(totals.cost)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Gross profit</span><span className="font-mono">{fmt(totals.gp)}</span></div>
            <div className="flex items-center justify-between border-t border-dashed border-border-sub pt-1.5">
              <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold', STATUS_CLS[totals.status])}>{MARGIN_LABEL[totals.status]}</span>
              <span className="font-mono font-bold text-lg">{totals.gmPct == null ? '—' : `${totals.gmPct}%`} GM</span>
            </div>
            <p className="text-[11px] text-text-muted">Target {a.targetGmPct}% · floor {a.floorGmPct}% · wage ${a.wage}/h + {a.burdenPct}% burden · materials +{a.materialUpliftPct}%</p>
            <div className="flex justify-between text-[15px] font-bold border-t border-border-sub pt-1.5"><span>Customer total</span><span className="font-mono text-text-green">{fmt(totals.total)}</span></div>
          </div>
        </div>

        {belowFloor && editable && (
          <p className={cn('text-[12px] flex items-center gap-1.5', canApproveLow ? 'text-accent-gold' : 'text-text-red')}>
            <AlertTriangle size={13} /> Below the {a.floorGmPct}% margin floor. {canApproveLow ? 'You can approve as a super admin.' : 'A super admin must approve this — or raise prices.'}
          </p>
        )}

        {showReturn && (
          <div className="space-y-2 rounded-lg border border-accent-gold/50 bg-accent-gold/5 p-3">
            <Label className="text-[12px]">What should {walk.assignedTechName || walk.createdByName} fix or add? (they'll see this)</Label>
            <Textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} className="min-h-[70px]" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowReturn(false)}>Cancel</Button>
              <Button size="sm" disabled={!returnNote.trim() || !!busy} onClick={sendBack}>{busy === 'return' && <Loader2 size={13} className="mr-1 animate-spin" />}Send back</Button>
            </div>
          </div>
        )}

        {editable && !showReturn && (
          <div className="flex flex-wrap gap-2 justify-end border-t border-border-sub pt-3">
            <Button variant="outline" onClick={() => setShowReturn(true)}><Undo2 size={14} className="mr-1.5" /> Send back to tech</Button>
            <Button variant="outline" disabled={!!busy} onClick={save}>{busy === 'save' && <Loader2 size={13} className="mr-1 animate-spin" />}Save changes</Button>
            <Button className="bg-brand-red hover:bg-brand-red/90 text-white" disabled={!!busy || !priced.length || (belowFloor && !canApproveLow)} onClick={approve}>
              {busy === 'approve' ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Check size={14} className="mr-1.5" />} Approve &amp; create draft quote
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
