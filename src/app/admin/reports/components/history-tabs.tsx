'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive as ArchiveIcon, Download, Filter, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { cn } from '@/lib/utils';
import { jobTechId, weekOfValue } from '@/lib/jobs';
import { isoDay } from '@/lib/customer-intel';
import type { Project, Technician, WeeklyLog, WorkOrder } from '@/lib/types';

/**
 * Archives tabs (Assignment History, Project History, Weekly Log History,
 * Archive): each has its own filters, and Export CSV writes every row that
 * matches them — not just the page on screen.
 */

// ── Shared bits ───────────────────────────────────────────────────────────

export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

const dayOf = (raw?: string | null) => isoDay(raw) || (raw && !isNaN(new Date(raw).getTime()) ? format(new Date(raw), 'yyyy-MM-dd') : null);
const show = (iso: string | null) => (iso ? format(new Date(`${iso}T12:00:00`), 'MM/dd/yyyy') : '—');

/** Every identifier and person on a job, for the history / archive tables. */
export type JobRecord = {
    assignmentId: string;
    workOrderId: string;
    title: string;
    assignedOn: string | null;
    scheduled: string | null;
    client: string;
    location: string;
    techIds: string[];
    techs: string;
    status: string;
    source: string;
};

export function jobRecord(job: WorkOrder, nameOf: (id: string) => string | undefined, statusOverride?: string): JobRecord {
    const ids = Array.from(new Set([jobTechId(job), ...(job.assignedTechIds || []), ...(job.additionalTechnicianIds || [])]
        .filter((id): id is string => !!id)));
    return {
        assignmentId: (job.shortId || job.id || '').toUpperCase(),
        workOrderId: (job.externalWorkOrderId || job.workOrderId || '').toString(),
        title: job.title || job.description || '',
        assignedOn: dayOf((job as WorkOrder & { assignedAt?: string }).assignedAt),
        scheduled: dayOf(job.scheduleDate),
        client: job.clientName || '',
        location: job.location || job.locationText || '',
        techIds: ids,
        techs: ids.map(id => nameOf(id) || 'Unknown').join(', '),
        status: statusOverride || job.status || '',
        source: job.source || '',
    };
}

/** Address pieces for a job's location (Google "street, city, ST zip, USA" or looser text). */
export function locationParts(job: Pick<WorkOrder, 'location' | 'locationText' | 'lat' | 'lng'>) {
    const raw = (job.location || job.locationText || '').trim();
    const zip = raw.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '';
    const parts = raw.split(',').map(p => p.trim()).filter(p => p && p.toUpperCase() !== 'USA');
    let city = '', state = '';
    const stIdx = parts.findIndex(p => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/i.test(p));
    if (stIdx > 0) { state = parts[stIdx].slice(0, 2).toUpperCase(); city = parts[stIdx - 1]; }
    else if (parts.length >= 2) {
        const m = parts[parts.length - 1].match(/^([A-Za-z]{2})\b/);
        if (m) { state = m[1].toUpperCase(); city = parts[parts.length - 2]; }
    }
    const street = stIdx > 1 ? parts.slice(0, stIdx - 1).join(', ') : parts.length > 2 ? parts[0] : '';
    return { address: raw, street, city, state, zip, lat: job.lat ?? '', lng: job.lng ?? '' };
}

/** Assignments page export: every job matching its filters, with full location. */
export function exportAssignmentsCsv(jobs: WorkOrder[], nameOf: (id: string) => string | undefined, withPay: boolean) {
    const header = [...JOB_CSV_HEADER, 'Scheduled Time', 'Priority', 'Job Type', 'Street', 'City', 'State', 'ZIP', 'Latitude', 'Longitude', ...(withPay ? ['Pay'] : [])];
    downloadCsv('assignments', header, jobs.map(j => {
        const r = jobRecord(j, nameOf);
        const l = locationParts(j);
        return [...jobCsvRow(r), j.scheduleTime || '', j.priority || '', j.jobType || j.projectType || '',
            l.street, l.city, l.state, l.zip, l.lat, l.lng, ...(withPay ? [Number(j.pay) || 0] : [])];
    }));
}

const JOB_CSV_HEADER = ['Assignment ID', 'Work Order ID', 'Title', 'Date Assigned', 'Scheduled Date', 'Client', 'Location', 'Technicians', 'Status', 'Source'];
const jobCsvRow = (r: JobRecord) => [r.assignmentId, r.workOrderId, r.title, r.assignedOn || '', r.scheduled || '', r.client, r.location, r.techs, r.status, r.source];

type Option = { value: string; label: string };
type FilterField =
    | { kind: 'select'; key: string; label: string; options: Option[]; allLabel: string }
    | { kind: 'date'; key: string; label: string };

function FilterBar({ fields, values, onChange, search, onSearch, onReset, onExport, count, noun, exportDisabled }: {
    fields: FilterField[];
    values: Record<string, string>;
    onChange: (key: string, v: string) => void;
    search: string;
    onSearch: (v: string) => void;
    onReset: () => void;
    onExport: () => void;
    count: number;
    noun: string;
    exportDisabled?: boolean;
}) {
    const active = !!search || Object.values(values).some(Boolean);
    const control = 'h-8 bg-bg-primary border-border-main text-[10px] font-bold uppercase';
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                <div className="flex items-center gap-2 shrink-0 self-center">
                    <Filter size={12} className="text-text-muted" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Filters</span>
                </div>
                <label className="flex flex-col gap-1 min-w-[180px] flex-1 max-w-[260px]">
                    <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Search</span>
                    <span className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input value={search} onChange={e => onSearch(e.target.value)} placeholder="ID, title, client, tech…" className="h-8 pl-7 bg-bg-primary border-border-main text-[11px]" />
                    </span>
                </label>
                {fields.map(f => f.kind === 'date' ? (
                    <label key={f.key} className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">{f.label}</span>
                        <Input type="date" className={cn(control, 'w-[145px]')} value={values[f.key] || ''} onChange={e => onChange(f.key, e.target.value)} />
                    </label>
                ) : (
                    <div key={f.key} className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">{f.label}</span>
                        <Select value={values[f.key] || 'all'} onValueChange={v => onChange(f.key, v === 'all' ? '' : v)}>
                            <SelectTrigger className={cn(control, 'w-[165px]')}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main max-h-[320px]">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">{f.allLabel}</SelectItem>
                                {f.options.map(o => <SelectItem key={o.value} value={o.value} className="text-[10px] font-bold uppercase">{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
                {active && (
                    <button onClick={onReset} className="h-8 px-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand-red hover:underline">
                        <RotateCcw size={11} /> Reset
                    </button>
                )}
            </div>
            <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{count.toLocaleString()} {noun}{active ? ' match' : ''}</p>
                <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={onExport} disabled={exportDisabled ?? count === 0}>
                    <Download size={13} className="mr-1.5" /> Export CSV{active ? ' (filtered)' : ''}
                </Button>
            </div>
        </div>
    );
}

function useFilters(keys: string[]) {
    const blank = () => Object.fromEntries(keys.map(k => [k, ''])) as Record<string, string>;
    const [values, setValues] = useState<Record<string, string>>(blank);
    const [search, setSearch] = useState('');
    return {
        values, search, setSearch,
        set: (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v })),
        reset: () => { setValues(blank()); setSearch(''); },
    };
}

const opts = (vals: string[]): Option[] => Array.from(new Set(vals.filter(Boolean))).sort().map(v => ({ value: v, label: v }));
const inRange = (d: string | null, from: string, to: string) => (!from || (!!d && d >= from)) && (!to || (!!d && d <= to));
const matchesText = (q: string, ...parts: (string | null | undefined)[]) => !q || parts.some(p => (p || '').toLowerCase().includes(q));
const th = 'text-[9px] uppercase font-black tracking-widest';

function JobCells({ r }: { r: JobRecord }) {
    return (
        <>
            <TableCell className="py-3 pl-6">
                <p className="text-[10px] font-mono font-bold text-brand-red uppercase">{r.assignmentId}</p>
                <p className="text-xs font-bold text-text-primary uppercase mt-0.5 max-w-[240px] truncate">{r.title || '—'}</p>
            </TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary uppercase">{r.workOrderId || '—'}</TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r.assignedOn)}</TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{show(r.scheduled)}</TableCell>
            <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase max-w-[180px] truncate">{r.client || '—'}</TableCell>
            <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase max-w-[200px] hidden lg:table-cell">{r.techs || 'Unassigned'}</TableCell>
        </>
    );
}

function JobHeads() {
    return (
        <>
            <TableHead className={cn(th, 'pl-6')}>Assignment ID / Title</TableHead>
            <TableHead className={th}>Work Order ID</TableHead>
            <TableHead className={cn(th, 'hidden md:table-cell')}>Date Assigned</TableHead>
            <TableHead className={th}>Scheduled</TableHead>
            <TableHead className={th}>Client</TableHead>
            <TableHead className={cn(th, 'hidden lg:table-cell')}>Technicians</TableHead>
        </>
    );
}

// ── Assignment History ────────────────────────────────────────────────────

export function AssignmentHistoryTab({ jobs, technicians, disputedIds, onOpen }: {
    jobs: WorkOrder[];
    technicians: Technician[];
    disputedIds: Set<string>;
    onOpen: (job: WorkOrder) => void;
}) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name;
    const rows = useMemo(() => jobs.map(j => ({ job: j, r: jobRecord(j, nameOf, disputedIds.has(j.id) ? 'disputed' : 'completed') })),
        [jobs, technicians, disputedIds]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useFilters(['from', 'to', 'client', 'tech', 'status', 'source']);
    const q = f.search.trim().toLowerCase();
    const filtered = rows.filter(({ r }) =>
        inRange(r.scheduled, f.values.from, f.values.to)
        && (!f.values.client || r.client === f.values.client)
        && (!f.values.tech || r.techIds.includes(f.values.tech))
        && (!f.values.status || r.status === f.values.status)
        && (!f.values.source || r.source === f.values.source)
        && matchesText(q, r.assignmentId, r.workOrderId, r.title, r.client, r.techs, r.location));
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-completed-jobs', [f.values, f.search]);
    const techOptions = useMemo(() => {
        const ids = new Set(rows.flatMap(x => x.r.techIds));
        return [...ids].map(id => ({ value: id, label: nameOf(id) || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label));
    }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            <FilterBar
                fields={[
                    { kind: 'date', key: 'from', label: 'Scheduled from' },
                    { kind: 'date', key: 'to', label: 'To' },
                    { kind: 'select', key: 'client', label: 'Client', allLabel: 'All clients', options: opts(rows.map(x => x.r.client)) },
                    { kind: 'select', key: 'tech', label: 'Technician', allLabel: 'All technicians', options: techOptions },
                    { kind: 'select', key: 'status', label: 'Status', allLabel: 'All statuses', options: [{ value: 'completed', label: 'Completed' }, { value: 'disputed', label: 'Disputed' }] },
                    { kind: 'select', key: 'source', label: 'Source', allLabel: 'All sources', options: opts(rows.map(x => x.r.source)) },
                ]}
                values={f.values} onChange={f.set} search={f.search} onSearch={f.setSearch} onReset={f.reset}
                count={filtered.length} noun="completed records"
                onExport={() => downloadCsv('assignment_history', JOB_CSV_HEADER, filtered.map(x => jobCsvRow(x.r)))}
            />
            <div className="table-wrap text-left">
                <Table>
                    <TableHeader className="bg-bg-tertiary">
                        <TableRow className="hover:bg-transparent border-border-sub">
                            <JobHeads />
                            <TableHead className={cn(th, 'text-right pr-6')}>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(({ job, r }) => (
                            <TableRow key={job.id} className="border-border-sub hover:bg-bg-tertiary cursor-pointer" onClick={() => onOpen(job)}>
                                <JobCells r={r} />
                                <TableCell className="py-3 text-right pr-6">
                                    <Badge variant={r.status === 'disputed' ? 'destructive' : 'active'} className="text-[8px] uppercase">{r.status}</Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No completed assignments match</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
                <ListPager pager={pager} noun="jobs" />
            </div>
        </div>
    );
}

// ── Project History ───────────────────────────────────────────────────────

export function ProjectHistoryTab({ projects, technicians }: { projects: Project[]; technicians: Technician[] }) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name;
    const rows = useMemo(() => projects.map(p => {
        const crew = (p.team || []).map(m => m.techId);
        const lead = (p.team || []).find(m => m.role === 'Project Lead')?.techId || p.projectLeadId || '';
        const end = (p as Project & { endDate?: string; completedAt?: string }).endDate || (p as Project & { completedAt?: string }).completedAt || '';
        return {
            p, crew,
            id: (p.id || '').toUpperCase(), name: p.name || '', client: p.client || '', location: p.location || '',
            start: dayOf(p.startDate), end: dayOf(end),
            lead: lead ? nameOf(lead) || 'Unknown' : '', crewNames: crew.map(id => nameOf(id) || 'Unknown').join(', '),
            phases: (p.phases || []).length, tasks: (p.phases || []).reduce((s, ph) => s + (ph.tasks || []).length, 0),
        };
    }), [projects, technicians]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useFilters(['from', 'to', 'client', 'tech']);
    const q = f.search.trim().toLowerCase();
    const filtered = rows.filter(r =>
        inRange(r.start, f.values.from, f.values.to)
        && (!f.values.client || r.client === f.values.client)
        && (!f.values.tech || r.crew.includes(f.values.tech))
        && matchesText(q, r.id, r.name, r.client, r.location, r.crewNames));
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-completed-projects', [f.values, f.search]);
    const techOptions = useMemo(() => [...new Set(rows.flatMap(r => r.crew))].map(id => ({ value: id, label: nameOf(id) || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label)), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            <FilterBar
                fields={[
                    { kind: 'date', key: 'from', label: 'Started from' },
                    { kind: 'date', key: 'to', label: 'To' },
                    { kind: 'select', key: 'client', label: 'Client', allLabel: 'All clients', options: opts(rows.map(r => r.client)) },
                    { kind: 'select', key: 'tech', label: 'Crew member', allLabel: 'Anyone', options: techOptions },
                ]}
                values={f.values} onChange={f.set} search={f.search} onSearch={f.setSearch} onReset={f.reset}
                count={filtered.length} noun="completed projects"
                onExport={() => downloadCsv('project_history',
                    ['Project ID', 'Name', 'Client', 'Location', 'Start Date', 'Completed', 'Project Lead', 'Crew', 'Phases', 'Tasks', 'Status'],
                    filtered.map(r => [r.id, r.name, r.client, r.location, r.start || '', r.end || '', r.lead, r.crewNames, r.phases, r.tasks, r.p.status]))}
            />
            <div className="table-wrap text-left">
                <Table>
                    <TableHeader className="bg-bg-tertiary">
                        <TableRow className="hover:bg-transparent border-border-sub">
                            <TableHead className={cn(th, 'pl-6')}>Project</TableHead>
                            <TableHead className={th}>Client</TableHead>
                            <TableHead className={th}>Started</TableHead>
                            <TableHead className={cn(th, 'hidden md:table-cell')}>Completed</TableHead>
                            <TableHead className={cn(th, 'hidden lg:table-cell')}>Crew</TableHead>
                            <TableHead className={cn(th, 'text-right pr-6')}>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(r => (
                            <TableRow key={r.p.id} className="border-border-sub hover:bg-bg-tertiary">
                                <TableCell className="py-3 pl-6">
                                    <p className="text-xs font-bold text-text-primary uppercase">{r.name}</p>
                                    <p className="text-[9px] font-mono text-brand-red uppercase mt-0.5">{r.id}</p>
                                </TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase">{r.client || '—'}</TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{show(r.start)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r.end)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase hidden lg:table-cell max-w-[220px]">
                                    {r.lead && <span className="text-text-primary">{r.lead} (lead){r.crew.length > 1 ? ', ' : ''}</span>}
                                    {r.crewNames.split(', ').filter(n => n && n !== r.lead).join(', ') || (!r.lead ? '—' : '')}
                                </TableCell>
                                <TableCell className="py-3 text-right pr-6"><Badge variant="active" className="text-[8px] uppercase">completed</Badge></TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow><TableCell colSpan={6} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No completed projects match</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
                <ListPager pager={pager} noun="projects" />
            </div>
        </div>
    );
}

// ── Weekly Log History ────────────────────────────────────────────────────

export function WeeklyLogHistoryTab({ logs, technicians }: { logs: WeeklyLog[]; technicians: Technician[] }) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name;
    const rows = useMemo(() => logs
        .filter(l => l.status === 'Submitted' || l.status === 'Approved')
        .sort((a, b) => weekOfValue(b.weekOf) - weekOfValue(a.weekOf))
        .map(l => ({
            l, week: dayOf(l.weekOf), tech: nameOf(l.techId) || l.techId,
            items: (l.items || []).length,
            disputed: (l.items || []).filter(i => i.confirmationStatus === 'disputed').length,
            submitted: dayOf(l.submittedAt),
        })), [logs, technicians]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useFilters(['from', 'to', 'tech', 'status']);
    const q = f.search.trim().toLowerCase();
    const filtered = rows.filter(r =>
        inRange(r.week, f.values.from, f.values.to)
        && (!f.values.tech || r.l.techId === f.values.tech)
        && (!f.values.status || r.l.status === f.values.status)
        && matchesText(q, r.tech, r.l.id, r.l.weekOf));
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-weekly-logs', [f.values, f.search]);
    const techOptions = useMemo(() => [...new Set(rows.map(r => r.l.techId))].map(id => ({ value: id, label: nameOf(id) || id })).sort((a, b) => a.label.localeCompare(b.label)), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            <FilterBar
                fields={[
                    { kind: 'date', key: 'from', label: 'Week from' },
                    { kind: 'date', key: 'to', label: 'To' },
                    { kind: 'select', key: 'tech', label: 'Technician', allLabel: 'All technicians', options: techOptions },
                    { kind: 'select', key: 'status', label: 'Status', allLabel: 'Submitted & approved', options: [{ value: 'Submitted', label: 'Submitted' }, { value: 'Approved', label: 'Approved' }] },
                ]}
                values={f.values} onChange={f.set} search={f.search} onSearch={f.setSearch} onReset={f.reset}
                count={filtered.length} noun="logs"
                onExport={() => downloadCsv('weekly_log_history',
                    ['Log ID', 'Week Of', 'Technician', 'Jobs', 'Disputed', 'Submitted', 'Status'],
                    filtered.map(r => [r.l.id, r.l.weekOf, r.tech, r.items, r.disputed, r.submitted || '', r.l.status]))}
            />
            <div className="table-wrap text-left">
                <Table>
                    <TableHeader className="bg-bg-tertiary">
                        <TableRow className="hover:bg-transparent border-border-sub">
                            <TableHead className={cn(th, 'pl-6')}>Week Of</TableHead>
                            <TableHead className={th}>Technician</TableHead>
                            <TableHead className={cn(th, 'text-center')}>Jobs</TableHead>
                            <TableHead className={cn(th, 'hidden md:table-cell')}>Submitted</TableHead>
                            <TableHead className={cn(th, 'text-right pr-6')}>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(r => (
                            <TableRow key={r.l.id} className="border-border-sub hover:bg-bg-tertiary">
                                <TableCell className="py-3 pl-6 text-[10px] font-mono font-bold text-text-secondary uppercase">{show(r.week)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-primary uppercase">{r.tech}</TableCell>
                                <TableCell className="py-3 text-center text-[10px] font-bold text-text-secondary">
                                    {r.items}{r.disputed > 0 && <span className="ml-1 text-brand-red">({r.disputed} disputed)</span>}
                                </TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-muted hidden md:table-cell">{show(r.submitted)}</TableCell>
                                <TableCell className="py-3 text-right pr-6"><Badge variant={r.l.status === 'Approved' ? 'active' : 'scheduled'} className="text-[8px] uppercase">{r.l.status}</Badge></TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No logs match</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
                <ListPager pager={pager} noun="logs" />
            </div>
        </div>
    );
}

// ── Archive ───────────────────────────────────────────────────────────────

export type ArchiveRow = {
    id: string;
    archivedAt: string;
    kind: 'job' | 'activity';
    title: string;
    identifier?: string;
    clientName?: string;
    techName?: string;
    job?: WorkOrder;
};

export function ArchiveTab({ items, technicians, onOpen, onRestore }: {
    items: ArchiveRow[];
    technicians: Technician[];
    onOpen: (job: WorkOrder) => void;
    onRestore: (item: ArchiveRow) => void;
}) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name;
    const rows = useMemo(() => items.map(item => ({
        item,
        archived: dayOf(item.archivedAt),
        r: item.job ? jobRecord(item.job, nameOf, item.job.previousStatus || item.job.status) : null,
    })), [items, technicians]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useFilters(['from', 'to', 'kind', 'client', 'tech', 'status']);
    const [newestFirst, setNewestFirst] = useState(true);
    const q = f.search.trim().toLowerCase();
    const filtered = rows
        .filter(({ item, archived, r }) =>
            inRange(archived, f.values.from, f.values.to)
            && (!f.values.kind || item.kind === f.values.kind)
            && (!f.values.client || (r?.client || item.clientName || '') === f.values.client)
            && (!f.values.tech || (r ? r.techIds.includes(f.values.tech) : false))
            && (!f.values.status || r?.status === f.values.status)
            && matchesText(q, item.title, item.identifier, item.clientName, item.techName, r?.assignmentId, r?.workOrderId, r?.techs))
        .sort((a, b) => (newestFirst ? -1 : 1) * (a.item.archivedAt || '').localeCompare(b.item.archivedAt || ''));
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-archive', [f.values, f.search, newestFirst]);
    const techOptions = useMemo(() => [...new Set(rows.flatMap(x => x.r?.techIds || []))].map(id => ({ value: id, label: nameOf(id) || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label)), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            <FilterBar
                fields={[
                    { kind: 'date', key: 'from', label: 'Archived from' },
                    { kind: 'date', key: 'to', label: 'To' },
                    { kind: 'select', key: 'kind', label: 'Type', allLabel: 'Jobs & activity', options: [{ value: 'job', label: 'Jobs' }, { value: 'activity', label: 'Activity' }] },
                    { kind: 'select', key: 'client', label: 'Client', allLabel: 'All clients', options: opts(rows.map(x => x.r?.client || x.item.clientName || '')) },
                    { kind: 'select', key: 'tech', label: 'Technician', allLabel: 'All technicians', options: techOptions },
                    { kind: 'select', key: 'status', label: 'Last status', allLabel: 'Any status', options: opts(rows.map(x => x.r?.status || '')) },
                ]}
                values={f.values} onChange={f.set} search={f.search} onSearch={f.setSearch} onReset={f.reset}
                count={filtered.length} noun="archived records"
                onExport={() => downloadCsv('archive',
                    ['Archived', 'Type', ...JOB_CSV_HEADER],
                    filtered.map(({ item, archived, r }) => r
                        ? [archived || '', item.kind, ...jobCsvRow(r)]
                        : [archived || '', item.kind, item.identifier || '', '', item.title, '', '', item.clientName || '', '', item.techName || '', '', '']))}
            />
            <div className="flex items-center justify-between">
                <p className="text-[9px] text-text-muted">Jobs and hidden activity share one archive. Restoring a job returns it to where it came from.</p>
                <button onClick={() => setNewestFirst(v => !v)} className="h-8 px-3 rounded-md border border-border-main bg-bg-primary text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-text-primary">
                    {newestFirst ? 'Latest first' : 'Earliest first'}
                </button>
            </div>
            {filtered.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-border-sub rounded-xl opacity-60">
                    <ArchiveIcon size={32} className="mx-auto text-text-muted mb-2" />
                    <p className="text-[10px] font-bold uppercase text-text-muted">No archived records match.</p>
                </div>
            ) : (
                <div className="table-wrap text-left">
                    <Table>
                        <TableHeader className="bg-bg-tertiary">
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className={cn(th, 'pl-6')}>Archived</TableHead>
                                <TableHead className={th}>Type</TableHead>
                                <TableHead className={th}>Assignment ID / Title</TableHead>
                                <TableHead className={th}>Work Order ID</TableHead>
                                <TableHead className={cn(th, 'hidden md:table-cell')}>Date Assigned</TableHead>
                                <TableHead className={th}>Client</TableHead>
                                <TableHead className={cn(th, 'hidden lg:table-cell')}>Technicians</TableHead>
                                <TableHead className={th}>Status</TableHead>
                                <TableHead className={cn(th, 'text-right pr-6')}>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pager.items.map(({ item, archived, r }) => (
                                <TableRow key={item.id} className={cn('border-border-sub hover:bg-bg-tertiary', item.job && 'cursor-pointer')}
                                    onClick={() => { if (item.job) onOpen(item.job); }}>
                                    <TableCell className="py-3 pl-6 text-[10px] font-mono text-text-secondary">{show(archived)}</TableCell>
                                    <TableCell className="py-3"><Badge variant="outline" className="text-[7px] uppercase h-4">{item.kind}</Badge></TableCell>
                                    <TableCell className="py-3">
                                        <p className="text-[10px] font-mono font-bold text-brand-red uppercase">{r?.assignmentId || item.identifier}</p>
                                        <p className="text-xs font-bold text-text-primary uppercase mt-0.5 max-w-[220px] truncate">{item.title}</p>
                                    </TableCell>
                                    <TableCell className="py-3 text-[10px] font-mono text-text-secondary uppercase">{r?.workOrderId || '—'}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r?.assignedOn || null)}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase max-w-[160px] truncate">{r?.client || item.clientName || '—'}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase hidden lg:table-cell max-w-[200px]">{r?.techs || item.techName || '—'}</TableCell>
                                    <TableCell className="py-3">{r?.status ? <Badge variant="outline" className="text-[8px] uppercase">{r.status}</Badge> : <span className="text-[10px] text-text-muted">—</span>}</TableCell>
                                    <TableCell className="py-3 text-right pr-6" onClick={e => e.stopPropagation()}>
                                        <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold tracking-widest" onClick={() => onRestore(item)}>
                                            <RotateCcw size={10} className="mr-1" />Restore
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <ListPager pager={pager} noun="records" />
                </div>
            )}
        </div>
    );
}

