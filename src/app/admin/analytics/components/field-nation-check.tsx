'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ISSUE_LABEL, parseFnReport, reconcile, type FnIssue, type FnRow } from '@/lib/fn-reconcile';
import type { Technician, WeeklyLog, WorkOrder } from '@/lib/types';
import { saveFnRows } from '@/lib/fn-reports';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const signed = (n: number, f: (x: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
type Filter = 'issues' | FnIssue | 'app_only' | 'all';

/**
 * Insights → Performance → Field Nation check. Upload Field Nation's Work Order Report CSV
 * and compare it to the app: pay per job, hours vs the tech's weekly log, and
 * jobs missing on either side. Read-only — fix anything it finds in the job or
 * the log as usual. Uploading also saves the rows (one per work order) for
 * the pay and hours stats above it.
 */
export function FieldNationCheck() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const canSave = hasPermission('admin.financials.view');
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Technician[]>([]);
  const [logs, setLogs] = useState<WeeklyLog[]>([]);
  const [pool, setPool] = useState<WorkOrder[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [rows, setRows] = useState<FnRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('issues');
  const [provider, setProvider] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = [
      onSharedSnapshot('users', s => setPeople(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)))),
      onSharedSnapshot('weeklyLogs', s => setLogs(s.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))),
      onSharedSnapshot('workOrders', s => setPool(s.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))),
      onSharedSnapshot('assignments', s => setAssignments(s.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))),
    ];
    return () => u.forEach(f => f());
  }, []);

  const result = useMemo(() => rows ? reconcile(rows, [...pool, ...assignments], logs, people) : null, [rows, pool, assignments, logs, people]);
  const providers = useMemo(() => [...new Set((rows || []).map(r => r.provider).filter(Boolean))].sort(), [rows]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const parsed = parseFnReport(await f.text());
      if (!parsed.length) throw new Error('No work orders in this file.');
      setRows(parsed); setFileName(f.name); setFilter('issues'); setProvider('');
      if (canSave) {
        setSaving(true);
        try {
          const n = await saveFnRows(parsed, user?.name || 'Admin', f.name);
          toast({ title: 'Report saved', description: `${n} work orders added to the pay and hours stats.` });
        } catch (e) {
          toast({ variant: 'destructive', title: 'Compared, but not saved', description: e instanceof Error ? e.message : 'Only payroll can save reports.' });
        } finally { setSaving(false); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, issues: 0, app_only: result?.appOnly.length || 0 };
    for (const m of result?.matches || []) {
      if (provider && m.row.provider !== provider) continue;
      c.all++;
      if (m.issues.length) c.issues++;
      for (const i of m.issues) c[i] = (c[i] || 0) + 1;
    }
    return c;
  }, [result, provider]);

  const shown = useMemo(() => (result?.matches || []).filter(m =>
    (!provider || m.row.provider === provider) &&
    (filter === 'all' ? true : filter === 'issues' ? m.issues.length > 0 : filter === 'app_only' ? false : m.issues.includes(filter as FnIssue))), [result, filter, provider]);

  const exportCsv = () => {
    if (!result) return;
    const out = [['FN work order', 'Provider', 'App tech', 'Buyer', 'Type of work', 'FN approved', 'FN labor', 'App pay', 'Pay diff', 'FN hours', 'Log hours', 'Hours diff', 'Additional charges', 'Log status', 'Issues']];
    for (const m of result.matches) {
      out.push([m.row.woId, m.row.provider, m.techName, m.row.buyer, m.row.typeOfWork, m.row.approved, m.row.labor.toFixed(2),
        m.appLabor == null ? '' : m.appLabor.toFixed(2), m.job ? m.laborDiff.toFixed(2) : '', String(m.row.hours), m.logHours == null ? '' : String(m.logHours),
        m.logHours == null ? '' : String(m.hoursDiff), m.row.additionalCharges.toFixed(2), m.logStatus || '', m.issues.map(i => ISSUE_LABEL[i]).join('; ')]);
    }
    for (const a of result.appOnly) {
      out.push([a.job.externalWorkOrderId || '', '', a.techName, a.job.clientName || '', a.job.projectType || '', '', '', (a.job.pay || 0).toFixed(2), '', '', '', '', '', a.logStatus || '', 'In the app, not in this report']);
    }
    const csv = out.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `field-nation-check-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'issues', label: 'Needs a look' },
    { key: 'labor', label: ISSUE_LABEL.labor },
    { key: 'hours', label: ISSUE_LABEL.hours },
    { key: 'not_in_app', label: ISSUE_LABEL.not_in_app },
    { key: 'not_filed', label: ISSUE_LABEL.not_filed },
    { key: 'log_not_approved', label: ISSUE_LABEL.log_not_approved },
    { key: 'app_only', label: 'In app, not in report' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Field Nation check</h3>
          <p className="text-[12px] text-text-muted">Upload Field Nation&rsquo;s Work Order Report (CSV) to compare pay, hours and jobs with the app{canSave ? ' — it\'s also saved for the stats above' : ''}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {result && <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}><Download size={14} className="mr-1.5" />Export CSV</Button>}
          <Button size="sm" className="h-9" disabled={saving} onClick={() => fileRef.current?.click()}>
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Upload size={14} className="mr-1.5" />}{rows ? 'Upload another' : 'Upload report'}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        </div>
      </div>

      {error && <p className="text-sm text-text-red">{error}</p>}

      {!result ? (
        <EmptyState
          icon={Upload}
          title="Upload a Field Nation report"
          description="In Field Nation, export the Work Order Report as CSV, then upload it here. Jobs and logs are never changed."
        />
      ) : (
        <>
          <p className="text-[12px] text-text-muted">
            {fileName} · {result.totals.rows} work orders{result.period ? ` approved ${result.period.from} to ${result.period.to}` : ''}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Needs a look" value={result.totals.issues} tone={result.totals.issues ? 'problem' : 'done'} />
            <StatCard label="Not in the app" value={counts.not_in_app || 0} tone={counts.not_in_app ? 'problem' : 'neutral'} />
            <StatCard label="FN labor / app pay" value={money(result.totals.fnLabor)} sub={`App: ${money(result.totals.appLabor)} on matched jobs`} />
            <StatCard label="FN hours / log hours" value={result.totals.fnHours.toLocaleString()} sub={`Logs: ${result.totals.logHours.toLocaleString()} on matched jobs`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn('rounded-full border px-3 py-1 text-[12px]', filter === f.key ? 'border-accent-gold bg-accent-gold/10 text-text-primary' : 'border-border-sub text-text-muted hover:text-text-primary')}>
                {f.label} <span className="tabular-nums">{counts[f.key] ?? 0}</span>
              </button>
            ))}
            <select value={provider} onChange={e => setProvider(e.target.value)}
              className="ml-auto h-8 rounded-md border border-border-main bg-bg-primary px-2 text-[12px] text-text-primary">
              <option value="">All providers</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {filter === 'app_only' ? (
            result.appOnly.length === 0 ? (
              <EmptyState icon={FileSpreadsheet} title="Nothing missing" description="Every completed Field Nation job in this period is in the report." />
            ) : (
              <div className="rounded-lg border border-border-sub overflow-x-auto">
                <p className="px-3 py-2 text-[12px] text-text-muted border-b border-border-sub">Completed in the app during this report&rsquo;s period but not in the report — not paid yet, under another provider&rsquo;s report, or the wrong number on the job.</p>
                <Table>
                  <TableHeader><TableRow><TableHead>FN work order</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Tech</TableHead><TableHead className="text-right">App pay</TableHead><TableHead>Log</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.appOnly.map(a => (
                      <TableRow key={a.job.id}>
                        <TableCell className="font-mono text-[12px]">{a.job.externalWorkOrderId || a.job.id}</TableCell>
                        <TableCell className="text-[12px]">{a.job.scheduleDate}</TableCell>
                        <TableCell className="text-[12px]">{a.job.clientName}</TableCell>
                        <TableCell className="text-[12px]">{a.techName || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-[12px]">{money(a.job.pay || 0)}</TableCell>
                        <TableCell className="text-[12px]">{a.logStatus || 'Not filed'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : shown.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="Nothing here" description="No work orders match this filter." />
          ) : (
            <div className="rounded-lg border border-border-sub overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>FN work order</TableHead>
                    <TableHead>Provider / app tech</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead className="text-right">FN labor</TableHead>
                    <TableHead className="text-right">App pay</TableHead>
                    <TableHead className="text-right">FN hrs</TableHead>
                    <TableHead className="text-right">Log hrs</TableHead>
                    <TableHead>Log</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map(m => (
                    <TableRow key={m.row.woId}>
                      <TableCell className="font-mono text-[12px]">{m.row.woId}<div className="font-sans text-[11px] text-text-muted">{m.row.approved}</div></TableCell>
                      <TableCell className="text-[12px]">{m.row.provider}{m.techName && m.techName !== m.row.provider && <div className="text-[11px] text-text-muted">App: {m.techName}</div>}</TableCell>
                      <TableCell className="text-[12px]">{m.row.buyer}<div className="text-[11px] text-text-muted">{m.row.typeOfWork}</div></TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{money(m.row.labor)}{m.row.additionalCharges ? <div className="text-[11px] text-text-muted">+{money(m.row.additionalCharges)} charges</div> : null}</TableCell>
                      <TableCell className={cn('text-right font-mono text-[12px]', m.issues.includes('labor') && 'text-text-red')}>
                        {m.appLabor == null ? '—' : money(m.appLabor)}
                        {m.issues.includes('labor') && <div className="text-[11px]">{signed(m.laborDiff, money)} FN</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{m.row.hours.toFixed(2)}</TableCell>
                      <TableCell className={cn('text-right font-mono text-[12px]', m.issues.includes('hours') && 'text-accent-gold')}>
                        {m.logHours == null ? '—' : m.logHours.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-[12px]">{m.logStatus || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.issues.length === 0 ? <Badge variant="outline" className="text-[10px]">OK</Badge>
                            : m.issues.map(i => <Badge key={i} variant="outline" className={cn('text-[10px]', i === 'not_in_app' || i === 'labor' ? 'border-brand-red/50 text-text-red' : 'border-accent-gold/50 text-accent-gold')}>{ISSUE_LABEL[i]}</Badge>)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[11px] text-text-muted">
            Pay compares Field Nation&rsquo;s Labor to the job&rsquo;s pay in the app (additional charges are shown, not compared). Hours compare Field Nation&rsquo;s Hours Logged to the hours on the tech&rsquo;s weekly log, within 15 minutes. Nothing here changes jobs or logs.
          </p>
        </>
      )}
    </div>
  );
}
