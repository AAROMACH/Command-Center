'use client';

import { newInvoiceNumber } from '@/lib/doc-number';
import { canApproveInvoices } from '@/lib/approvals';
import { useAuth } from '@/contexts/auth-context';
import { InvoicePdfButton } from '@/components/invoice-pdf-button';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { Loader2, Receipt } from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn, } from '@/lib/utils';
import { isClient } from '@/lib/permissions';
import { parseLocalDate } from '@/lib/jobs';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { usePricingSettings } from '@/hooks/use-billing';
import { useToast } from '@/hooks/use-toast';
import { saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { billableHours, invoicedJobIds, isBillableJob, jobsInvoiceDraft, minutesOnSiteByJob, standardHourlyRate } from '@/lib/job-invoicing';
import type { Invoice, Technician, TripLog, WorkOrder } from '@/lib/types';
import { PriceDocEditor, type PriceDocResult, type PriceDocValues } from '@/components/price-doc-editor';
import { SendInvoiceButton } from '@/components/send-invoice-button';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

function useUsers() {
  const [users, setUsers] = useState<Technician[]>([]);
  useEffect(() => onSharedSnapshot('users', s => setUsers(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician))), () => setUsers([])), []);
  return users;
}
function useClients() {
  const users = useUsers();
  return useMemo(() => users.filter(isClient), [users]);
}

const norm = (s?: string | null) => (s || '').trim().toLowerCase();

/**
 * A job whose client is really a staff member (a tech or admin picked or
 * typed as the client): not billable until the job's client is fixed.
 */
function staffAsClient(j: WorkOrder, users: Technician[]): Technician | null {
  const id = (j as { clientId?: string | null }).clientId;
  const byId = id ? users.find(u => u.id === id) : undefined;
  if (byId) return isClient(byId) ? null : byId;
  const name = norm(j.clientName);
  if (!name || users.some(u => isClient(u) && (norm(u.clientCompany) === name || norm(u.name) === name))) return null;
  return users.find(u => !isClient(u) && norm(u.name) === name) || null;
}

/**
 * Job page: the job's invoice, or — once it's completed — a draft invoice
 * from time on site × the standard labor rate, reviewed before saving.
 */
export function JobInvoicePanel({ job }: { job: WorkOrder }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: pricing } = usePricingSettings();
  const clients = useClients();
  const [single, setSingle] = useState<Invoice[]>([]);
  const [rolled, setRolled] = useState<Invoice[]>([]);
  const [trips, setTrips] = useState<TripLog[]>([]);
  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'invoices'), where('workOrderId', '==', job.id)), s => setSingle(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))), () => setSingle([]));
    const u2 = onSnapshot(query(collection(db, 'invoices'), where('workOrderIds', 'array-contains', job.id)), s => setRolled(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))), () => setRolled([]));
    const u3 = onSnapshot(query(collection(db, 'tripLogs'), where('assignmentId', '==', job.id)), s => setTrips(s.docs.map(d => ({ ...d.data(), id: d.id } as TripLog))), () => setTrips([]));
    return () => { u1(); u2(); u3(); };
  }, [job.id]);
  const invoice = [...single, ...rolled].filter(i => i.status !== 'void').sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0] || null;
  const minutes = useMemo(() => minutesOnSiteByJob(trips), [trips]);
  const [draft, setDraft] = useState<Partial<PriceDocValues> | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isBillableJob(job)) return null;
  const done = job.status === 'completed';
  const hrs = billableHours(minutes.get(job.id) || 0);
  const rate = standardHourlyRate(pricing);

  const save = async (r: PriceDocResult) => {
    setSaving(true);
    try {
      const id = await saveInvoiceFromEditor(r, null);
      toast({ title: 'Invoice drafted', description: `Invoice ${newInvoiceNumber(r.invoiceNumber, id, r.issueDate)} — send it from here or Quotes & Invoices.` });
      setDraft(null);
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not save invoice', description: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-bg-secondary rounded-xl border border-border-sub border-l-4 border-l-text-green p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-green flex items-center gap-2"><Receipt size={11} /> Client invoice</p>
        {invoice ? (
          <p className="text-[13px] text-text-primary mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono">{invoice.invoiceNumber}</span> · <span className="font-mono">{fmt(invoice.total)}</span>
            <StatusBadge kind="invoice" value={invoice.status} />
            {((invoice as { workOrderIds?: string[] }).workOrderIds?.length || 0) > 1 && <span className="text-[12px] text-text-muted">· billed with other jobs</span>}
          </p>
        ) : (
          <p className="text-[12px] text-text-muted mt-1">
            {done
              ? (hrs ? `${hrs} h on site × ${rate ? `${fmt(rate.rate)}/h (${rate.label})` : 'labor rate'} — review, add materials, then save.` : 'No on-site time recorded — the draft will ask for hours.')
              : 'Invoice once the job is completed.'}
          </p>
        )}
      </div>
      {invoice ? (
        <div className="flex gap-1.5"><InvoicePdfButton invoice={invoice} />{invoice.status !== 'paid' && <SendInvoiceButton invoice={invoice} />}</div>
      ) : (
        <Button size="sm" disabled={!done} onClick={() => setDraft(jobsInvoiceDraft([job], minutes, pricing, clients))}>
          <Receipt size={13} className="mr-1.5" /> Create invoice
        </Button>
      )}
      <PriceDocEditor open={!!draft} onClose={() => setDraft(null)} kind="invoice" initial={draft || undefined} draftOnly={!canApproveInvoices(user)}
        title={`Invoice for ${job.title || job.id.toUpperCase()}`} saveLabel="Save invoice" saving={saving} onSave={save} />
    </div>
  );
}

type Period = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'this_week', label: 'This week' }, { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'all', label: 'All unbilled' },
];
function periodRange(p: Period): [Date, Date] | null {
  const now = new Date();
  switch (p) {
    case 'this_week': return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
    case 'last_week': { const d = subWeeks(now, 1); return [startOfWeek(d, { weekStartsOn: 1 }), endOfWeek(d, { weekStartsOn: 1 })]; }
    case 'this_month': return [startOfMonth(now), endOfMonth(now)];
    case 'last_month': { const d = subMonths(now, 1); return [startOfMonth(d), endOfMonth(d)]; }
    default: return null;
  }
}

/**
 * Roll-up: one invoice for a client's completed, not-yet-invoiced manual jobs
 * in a period (one line per job). For clients billed weekly or monthly.
 */
export function BillJobsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: pricing } = usePricingSettings();
  const users = useUsers();
  const clients = useMemo(() => users.filter(isClient), [users]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [trips, setTrips] = useState<TripLog[]>([]);
  useEffect(() => {
    if (!open) return;
    const subs = [
      onSharedSnapshot('assignments', s => setJobs(s.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))),
      onSharedSnapshot('invoices', s => setInvoices(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)))),
      onSharedSnapshot('tripLogs', s => setTrips(s.docs.map(d => ({ ...d.data(), id: d.id } as TripLog)))),
    ];
    return () => subs.forEach(u => u());
  }, [open]);

  const billed = useMemo(() => invoicedJobIds(invoices), [invoices]);
  const minutes = useMemo(() => minutesOnSiteByJob(trips), [trips]);
  const candidates = useMemo(() => jobs.filter(j => j.status === 'completed' && isBillableJob(j) && !billed.has(j.id) && j.clientName), [jobs, billed]);
  // Jobs with a staff member as the client are held back until fixed.
  const misfiled = useMemo(() => candidates.map(j => ({ j, who: staffAsClient(j, users) })).filter((x): x is { j: WorkOrder; who: Technician } => !!x.who), [candidates, users]);
  const unbilled = useMemo(() => { const bad = new Set(misfiled.map(x => x.j.id)); return candidates.filter(j => !bad.has(j.id)); }, [candidates, misfiled]);
  const byClient = useMemo(() => {
    const m = new Map<string, number>();
    unbilled.forEach(j => m.set(j.clientName, (m.get(j.clientName) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [unbilled]);

  const [client, setClient] = useState('');
  const [period, setPeriod] = useState<Period>('last_week');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const range = periodRange(period);
    return unbilled.filter(j => j.clientName === client).filter(j => {
      if (!range) return true;
      const d = parseLocalDate(j.scheduleDate);
      return !!d && d >= range[0] && d <= range[1];
    }).sort((a, b) => (parseLocalDate(a.scheduleDate)?.getTime() || 0) - (parseLocalDate(b.scheduleDate)?.getTime() || 0));
  }, [unbilled, client, period]);
  useEffect(() => { setPicked(new Set(shown.map(j => j.id))); }, [shown]);

  const rate = standardHourlyRate(pricing);
  const chosen = shown.filter(j => picked.has(j.id));
  const estimate = chosen.reduce((s, j) => s + billableHours(minutes.get(j.id) || 0) * (rate?.rate || 0), 0);
  const [draft, setDraft] = useState<Partial<PriceDocValues> | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async (r: PriceDocResult) => {
    setSaving(true);
    try {
      const id = await saveInvoiceFromEditor(r, null, { workOrderIds: draftIds } as Partial<Invoice>);
      toast({ title: 'Invoice drafted', description: `${draftIds.length} job${draftIds.length === 1 ? '' : 's'} on invoice ${newInvoiceNumber(r.invoiceNumber, id, r.issueDate)}.` });
      setDraft(null);
      onClose();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not save invoice', description: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open && !draft} onOpenChange={o => !o && onClose()}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-xl max-h-[88vh] flex flex-col">
          <DialogHeader className="text-left">
            <DialogTitle>Bill completed jobs</DialogTitle>
            <DialogDescription className="text-[12px]">
              One invoice for a client&apos;s completed jobs that aren&apos;t invoiced yet — one line per job, from time on site × {rate ? `${fmt(rate.rate)}/h` : 'the labor rate'}. Field Nation jobs aren&apos;t included.
            </DialogDescription>
          </DialogHeader>
          {misfiled.length > 0 && (
            <details className="rounded-lg border border-accent-gold/40 bg-accent-gold/5 px-3 py-2 text-[12px]">
              <summary className="cursor-pointer text-text-secondary">
                <b>{misfiled.length}</b> completed job{misfiled.length === 1 ? ' has' : 's have'} a staff member as the client ({[...new Set(misfiled.map(x => x.who.name))].join(', ')}) — left out until the client is fixed.
              </summary>
              <div className="mt-2 space-y-1">
                {misfiled.map(({ j, who }) => (
                  <a key={j.id} href={`/admin/assignments/${j.id}`} className="flex justify-between gap-3 rounded px-1.5 py-1 hover:bg-bg-tertiary">
                    <span className="min-w-0 truncate">{j.title || j.description || j.id.toUpperCase()} <span className="text-text-muted">· {j.scheduleDate} · {j.id.toUpperCase()}</span></span>
                    <span className="shrink-0 text-text-muted">client: {who.name} → fix</span>
                  </a>
                ))}
              </div>
            </details>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger className="h-9"><SelectValue placeholder={byClient.length ? 'Choose a client…' : 'No unbilled jobs'} /></SelectTrigger>
              <SelectContent className="max-h-[320px]">{byClient.map(([c, n]) => <SelectItem key={c} value={c}>{c} ({n})</SelectItem>)}</SelectContent>
            </Select>
            <Select value={period} onValueChange={v => setPeriod(v as Period)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-h-[120px] overflow-y-auto space-y-1">
            {!client ? <p className="text-[12px] text-text-muted py-8 text-center">Pick a client to see their unbilled jobs.</p>
              : !shown.length ? <p className="text-[12px] text-text-muted py-8 text-center">No unbilled completed jobs for {client} in this period.</p>
              : shown.map(j => {
                const h = billableHours(minutes.get(j.id) || 0);
                return (
                  <label key={j.id} className={cn('flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer text-[12px]', picked.has(j.id) ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub')}>
                    <input type="checkbox" className="accent-brand-red h-4 w-4" checked={picked.has(j.id)}
                      onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(j.id); else n.delete(j.id); return n; })} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-text-primary truncate">{j.title || j.description || j.id.toUpperCase()}</span>
                      <span className="block text-text-muted">{j.scheduleDate} · {j.id.toUpperCase()}</span>
                    </span>
                    <span className={cn('font-mono shrink-0', h ? 'text-text-secondary' : 'text-accent-gold')}>{h ? `${h} h` : 'no time'}</span>
                  </label>
                );
              })}
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
            <span className="text-[12px] text-text-muted">{chosen.length} job{chosen.length === 1 ? '' : 's'} · about {fmt(estimate)} before materials and plan discount</span>
            <Button disabled={!chosen.length} onClick={() => { setDraftIds(chosen.map(j => j.id)); setDraft(jobsInvoiceDraft(chosen, minutes, pricing, clients)); }}>
              {saving && <Loader2 size={13} className="mr-1.5 animate-spin" />} Draft invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PriceDocEditor open={!!draft} onClose={() => setDraft(null)} kind="invoice" initial={draft || undefined} draftOnly={!canApproveInvoices(user)}
        title={`Invoice — ${client} · ${draftIds.length} job${draftIds.length === 1 ? '' : 's'}`} saveLabel="Save invoice" saving={saving} onSave={save} />
    </>
  );
}
