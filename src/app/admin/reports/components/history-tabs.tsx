'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive as ArchiveIcon, ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, RotateCcw, Search } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
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
    const control = 'h-8 bg-bg-primary border-border-main text-[10px] font-bold';
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                <div className="flex items-center gap-2 shrink-0 self-center">
                    <Filter size={12} className="text-text-muted" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Filters</span>
                </div>
                <label className="flex flex-col gap-1 min-w-[180px] flex-1 max-w-[260px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Search</span>
                    <span className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input value={search} onChange={e => onSearch(e.target.value)} placeholder="ID, title, client, tech…" className="h-8 pl-7 bg-bg-primary border-border-main text-[11px]" />
                    </span>
                </label>
                {fields.map(f => f.kind === 'date' ? (
                    <label key={f.key} className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{f.label}</span>
                        <Input type="date" className={cn(control, 'w-[145px]')} value={values[f.key] || ''} onChange={e => onChange(f.key, e.target.value)} />
                    </label>
                ) : (
                    <div key={f.key} className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{f.label}</span>
                        <Select value={values[f.key] || 'all'} onValueChange={v => onChange(f.key, v === 'all' ? '' : v)}>
                            <SelectTrigger className={cn(control, 'w-[165px]')}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main max-h-[320px]">
                                <SelectItem value="all" className="text-[10px] font-bold">{f.allLabel}</SelectItem>
                                {f.options.map(o => <SelectItem key={o.value} value={o.value} className="text-[10px] font-bold">{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
                {active && (
                    <button onClick={onReset} className="h-8 px-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-red hover:underline">
                        <RotateCcw size={11} /> Reset
                    </button>
                )}
            </div>
            <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{count.toLocaleString()} {noun}{active ? ' match' : ''}</p>
                <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-wider" onClick={onExport} disabled={exportDisabled ?? count === 0}>
                    <Download size={13} className="mr-1.5" /> Export CSV ({count.toLocaleString()})
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
const th = 'text-[10px] uppercase font-bold tracking-wider';

// ── Sortable column headers ───────────────────────────────────────────────

type SortDir = 'asc' | 'desc';
type SortVal = string | number | null | undefined;
type SortState<K extends string> = { key: K; dir: SortDir; toggle: (k: K) => void };

/** Click a header to sort by it; click again to flip. Dates start newest-first, text A→Z. */
function useSort<K extends string>(initial: K, dateKeys: K[]): SortState<K> {
    const [state, setState] = useState<{ key: K; dir: SortDir }>({ key: initial, dir: dateKeys.includes(initial) ? 'desc' : 'asc' });
    return {
        ...state,
        toggle: (k: K) => setState(prev => prev.key === k
            ? { key: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            : { key: k, dir: dateKeys.includes(k) ? 'desc' : 'asc' }),
    };
}

/** Sort rows by the value a getter returns; blanks always go last. */
function sortRows<T, K extends string>(rows: T[], sort: SortState<K>, get: (row: T, key: K) => SortVal): T[] {
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const va = get(a, sort.key), vb = get(b, sort.key);
        const ea = va === null || va === undefined || va === '', eb = vb === null || vb === undefined || vb === '';
        if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
        if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
        return sign * String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
    });
}

function SortHead<K extends string>({ label, k, sort, className }: { label: string; k: K; sort: SortState<K>; className?: string }) {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <TableHead className={cn(th, className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onClick={() => sort.toggle(k)}
                className={cn('inline-flex items-center gap-1 uppercase hover:text-text-primary', active && 'text-text-primary')}
                title={`Sort by ${label.toLowerCase()}`}>
                {label}
                <Icon size={11} className={cn('shrink-0', active ? 'text-brand-red' : 'opacity-50')} />
            </button>
        </TableHead>
    );
}

/** Empty table body row: "no matches" (with Reset) vs "nothing yet". */
function EmptyRow({ colSpan, hasRows, noun, onReset }: { colSpan: number; hasRows: boolean; noun: string; onReset: () => void }) {
    return (
        <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colSpan} className="p-4">
                {hasRows
                    ? <EmptyState compact icon={Search} title={`No ${noun} match these filters`} action={<Button variant="outline" size="sm" onClick={onReset}>Reset filters</Button>} />
                    : <EmptyState compact title={`No ${noun} yet`} />}
            </TableCell>
        </TableRow>
    );
}

function JobCells({ r }: { r: JobRecord }) {
    return (
        <>
            <TableCell className="py-3 pl-6">
                <p className="text-[10px] font-mono font-bold text-brand-red">{r.assignmentId}</p>
                <p className="text-xs font-bold text-text-primary mt-0.5 max-w-[240px] truncate">{r.title || '—'}</p>
            </TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{r.workOrderId || '—'}</TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r.assignedOn)}</TableCell>
            <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{show(r.scheduled)}</TableCell>
            <TableCell className="py-3 text-[10px] font-bold text-text-secondary max-w-[180px] truncate">{r.client || '—'}</TableCell>
            <TableCell className="py-3 text-[10px] font-bold text-text-secondary max-w-[200px] hidden lg:table-cell">{r.techs || 'Unassigned'}</TableCell>
        </>
    );
}

type JobSortKey = 'date' | 'assigned' | 'client' | 'tech' | 'status';

function JobHeads({ sort }: { sort: SortState<JobSortKey> }) {
    return (
        <>
            <TableHead className={cn(th, 'pl-6')}>Assignment ID / title</TableHead>
            <TableHead className={th}>Work order ID</TableHead>
            <SortHead label="Assigned" k="assigned" sort={sort} className="hidden md:table-cell" />
            <SortHead label="Scheduled" k="date" sort={sort} />
            <SortHead label="Client" k="client" sort={sort} />
            <SortHead label="Technicians" k="tech" sort={sort} className="hidden lg:table-cell" />
        </>
    );
}

const jobSortValue = (r: JobRecord, k: JobSortKey): SortVal =>
    k === 'date' ? r.scheduled : k === 'assigned' ? r.assignedOn : k === 'client' ? r.client : k === 'tech' ? r.techs : r.status;

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
    const sort = useSort<JobSortKey>('date', ['date', 'assigned']);
    const filtered = sortRows(rows.filter(({ r }) =>
        inRange(r.scheduled, f.values.from, f.values.to)
        && (!f.values.client || r.client === f.values.client)
        && (!f.values.tech || r.techIds.includes(f.values.tech))
        && (!f.values.status || r.status === f.values.status)
        && (!f.values.source || r.source === f.values.source)
        && matchesText(q, r.assignmentId, r.workOrderId, r.title, r.client, r.techs, r.location)), sort, (x, k) => jobSortValue(x.r, k));
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-completed-jobs', [f.values, f.search, sort.key, sort.dir]);
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
                            <JobHeads sort={sort} />
                            <SortHead label="Status" k="status" sort={sort} className="text-right pr-6" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(({ job, r }) => (
                            <TableRow key={job.id} className="border-border-sub hover:bg-bg-tertiary cursor-pointer" onClick={() => onOpen(job)}>
                                <JobCells r={r} />
                                <TableCell className="py-3 text-right pr-6">
                                    <StatusBadge kind="job" value={r.status} />
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <EmptyRow colSpan={7} hasRows={rows.length > 0} noun="completed jobs" onReset={f.reset} />
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
    const sort = useSort<'date' | 'end' | 'client' | 'tech' | 'status'>('date', ['date', 'end']);
    const filtered = sortRows(rows.filter(r =>
        inRange(r.start, f.values.from, f.values.to)
        && (!f.values.client || r.client === f.values.client)
        && (!f.values.tech || r.crew.includes(f.values.tech))
        && matchesText(q, r.id, r.name, r.client, r.location, r.crewNames)), sort,
        (r, k) => k === 'date' ? r.start : k === 'end' ? r.end : k === 'client' ? r.client : k === 'tech' ? (r.lead || r.crewNames) : r.p.status);
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-completed-projects', [f.values, f.search, sort.key, sort.dir]);
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
                            <SortHead label="Client" k="client" sort={sort} />
                            <SortHead label="Started" k="date" sort={sort} />
                            <SortHead label="Completed" k="end" sort={sort} className="hidden md:table-cell" />
                            <SortHead label="Crew" k="tech" sort={sort} className="hidden lg:table-cell" />
                            <SortHead label="Status" k="status" sort={sort} className="text-right pr-6" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(r => (
                            <TableRow key={r.p.id} className="border-border-sub hover:bg-bg-tertiary">
                                <TableCell className="py-3 pl-6">
                                    <p className="text-xs font-bold text-text-primary">{r.name}</p>
                                    <p className="text-[11px] font-mono text-brand-red mt-0.5">{r.id}</p>
                                </TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-secondary">{r.client || '—'}</TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{show(r.start)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r.end)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-secondary hidden lg:table-cell max-w-[220px]">
                                    {r.lead && <span className="text-text-primary">{r.lead} (lead){r.crew.length > 1 ? ', ' : ''}</span>}
                                    {r.crewNames.split(', ').filter(n => n && n !== r.lead).join(', ') || (!r.lead ? '—' : '')}
                                </TableCell>
                                <TableCell className="py-3 text-right pr-6"><StatusBadge kind="job" value={r.p.status || 'completed'} /></TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <EmptyRow colSpan={6} hasRows={rows.length > 0} noun="completed projects" onReset={f.reset} />
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
    const sort = useSort<'date' | 'tech' | 'jobs' | 'submitted' | 'status'>('date', ['date', 'submitted']);
    const filtered = sortRows(rows.filter(r =>
        inRange(r.week, f.values.from, f.values.to)
        && (!f.values.tech || r.l.techId === f.values.tech)
        && (!f.values.status || r.l.status === f.values.status)
        && matchesText(q, r.tech, r.l.id, r.l.weekOf)), sort,
        (r, k) => k === 'date' ? (weekOfValue(r.l.weekOf) || null) : k === 'tech' ? r.tech : k === 'jobs' ? r.items : k === 'submitted' ? r.submitted : r.l.status);
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-weekly-logs', [f.values, f.search, sort.key, sort.dir]);
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
                            <SortHead label="Week of" k="date" sort={sort} className="pl-6" />
                            <SortHead label="Technician" k="tech" sort={sort} />
                            <SortHead label="Jobs" k="jobs" sort={sort} className="text-center" />
                            <SortHead label="Submitted" k="submitted" sort={sort} className="hidden md:table-cell" />
                            <SortHead label="Status" k="status" sort={sort} className="text-right pr-6" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pager.items.map(r => (
                            <TableRow key={r.l.id} className="border-border-sub hover:bg-bg-tertiary">
                                <TableCell className="py-3 pl-6 text-[10px] font-mono font-bold text-text-secondary">{show(r.week)}</TableCell>
                                <TableCell className="py-3 text-[10px] font-bold text-text-primary">{r.tech}</TableCell>
                                <TableCell className="py-3 text-center text-[10px] font-bold text-text-secondary">
                                    {r.items}{r.disputed > 0 && <span className="ml-1 text-brand-red">({r.disputed} disputed)</span>}
                                </TableCell>
                                <TableCell className="py-3 text-[10px] font-mono text-text-muted hidden md:table-cell">{show(r.submitted)}</TableCell>
                                <TableCell className="py-3 text-right pr-6"><StatusBadge kind="log" value={r.l.status} /></TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <EmptyRow colSpan={5} hasRows={rows.length > 0} noun="weekly logs" onReset={f.reset} />
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
    const sort = useSort<'date' | 'assigned' | 'kind' | 'client' | 'tech' | 'status'>('date', ['date', 'assigned']);
    const q = f.search.trim().toLowerCase();
    const filtered = sortRows(rows
        .filter(({ item, archived, r }) =>
            inRange(archived, f.values.from, f.values.to)
            && (!f.values.kind || item.kind === f.values.kind)
            && (!f.values.client || (r?.client || item.clientName || '') === f.values.client)
            && (!f.values.tech || (r ? r.techIds.includes(f.values.tech) : false))
            && (!f.values.status || r?.status === f.values.status)
            && matchesText(q, item.title, item.identifier, item.clientName, item.techName, r?.assignmentId, r?.workOrderId, r?.techs)),
        sort, ({ item, r }, k) => {
            if (k === 'date') { const t = item.archivedAt ? new Date(item.archivedAt).getTime() : NaN; return isNaN(t) ? null : t; }
            if (k === 'assigned') return r?.assignedOn;
            if (k === 'kind') return item.kind;
            if (k === 'client') return r?.client || item.clientName;
            if (k === 'tech') return r?.techs || item.techName;
            return r?.status;
        });
    const pager = usePaged(filtered, PAGE_SIZES_LARGE, 'reports-archive', [f.values, f.search, sort.key, sort.dir]);
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
            <p className="text-[12px] text-text-muted">Jobs and hidden activity share one archive. Restoring a job returns it to where it came from.</p>
            {filtered.length === 0 ? (
                rows.length > 0
                    ? <EmptyState icon={Search} title="No archived records match these filters" action={<Button variant="outline" size="sm" onClick={f.reset}>Reset filters</Button>} />
                    : <EmptyState icon={ArchiveIcon} title="Nothing archived yet" description="Archived jobs and hidden activity show up here." />
            ) : (
                <div className="table-wrap text-left">
                    <Table>
                        <TableHeader className="bg-bg-tertiary">
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <SortHead label="Archived" k="date" sort={sort} className="pl-6" />
                                <SortHead label="Type" k="kind" sort={sort} />
                                <TableHead className={th}>Assignment ID / title</TableHead>
                                <TableHead className={th}>Work order ID</TableHead>
                                <SortHead label="Assigned" k="assigned" sort={sort} className="hidden md:table-cell" />
                                <SortHead label="Client" k="client" sort={sort} />
                                <SortHead label="Technicians" k="tech" sort={sort} className="hidden lg:table-cell" />
                                <SortHead label="Status" k="status" sort={sort} />
                                <TableHead className={cn(th, 'text-right pr-6')}>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pager.items.map(({ item, archived, r }) => (
                                <TableRow key={item.id} className={cn('border-border-sub hover:bg-bg-tertiary', item.job && 'cursor-pointer')}
                                    onClick={() => { if (item.job) onOpen(item.job); }}>
                                    <TableCell className="py-3 pl-6 text-[10px] font-mono text-text-secondary">{show(archived)}</TableCell>
                                    <TableCell className="py-3"><Badge variant="outline" className="text-[10px] uppercase tracking-wide">{item.kind === 'job' ? 'Job' : 'Activity'}</Badge></TableCell>
                                    <TableCell className="py-3">
                                        <p className="text-[10px] font-mono font-bold text-brand-red">{r?.assignmentId || item.identifier}</p>
                                        <p className="text-xs font-bold text-text-primary mt-0.5 max-w-[220px] truncate">{item.title}</p>
                                    </TableCell>
                                    <TableCell className="py-3 text-[10px] font-mono text-text-secondary">{r?.workOrderId || '—'}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-mono text-text-secondary hidden md:table-cell">{show(r?.assignedOn || null)}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-bold text-text-secondary max-w-[160px] truncate">{r?.client || item.clientName || '—'}</TableCell>
                                    <TableCell className="py-3 text-[10px] font-bold text-text-secondary hidden lg:table-cell max-w-[200px]">{r?.techs || item.techName || '—'}</TableCell>
                                    <TableCell className="py-3">{r?.status ? <StatusBadge kind="job" value={r.status} /> : <span className="text-[12px] text-text-muted">—</span>}</TableCell>
                                    <TableCell className="py-3 text-right pr-6" onClick={e => e.stopPropagation()}>
                                        <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold tracking-wider" onClick={() => onRestore(item)}>
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

