'use client';

import { useState } from 'react';
import { Briefcase, Inbox, Palette } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { StatCard, StatGrid } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SortControl, FiltersPopover, FilterSection, CheckboxFilter, DateRangeButton } from '@/components/list-toolbar';
import { TONE_DOT, type StatusKind, type Tone } from '@/lib/status-styles';
import type { DateRange } from 'react-day-picker';

/**
 * Internal reference for building pages the same way everywhere
 * (docs/ui-unification-plan.md). Not linked in the nav; super admins only.
 */
const STATUSES: Record<StatusKind, string[]> = {
    job: ['unassigned', 'assigned', 'confirmed', 'on-my-way', 'in-progress', 'checked-out', 'completed', 'cancelled'],
    log: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    pay: ['upcoming', 'draft', 'submitted', 'approved', 'returned', 'not-filed'],
    request: ['new', 'pending_review', 'reviewed', 'approved', 'denied', 'closed'],
    invoice: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'void'],
};
const TONES: [Tone, string][] = [['done', 'Done / approved / paid'], ['progress', 'In progress / waiting'], ['scheduled', 'Scheduled / draft'], ['problem', 'Problem / disputed'], ['info', 'Informational'], ['neutral', 'Neutral / closed']];

export default function StyleGuidePage() {
    const [sort, setSort] = useState('date');
    const [asc, setAsc] = useState(false);
    const [status, setStatus] = useState<string[]>([]);
    const [range, setRange] = useState<DateRange | undefined>();
    const section = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted';

    return (
        <div className="space-y-8">
            <PageHeader eyebrow="Reference" icon={Palette} title="Style guide"
                subtitle="The shared pieces every page is built from. Use these instead of one-off styles."
                actions={<><Button variant="outline">Secondary</Button><Button>Primary action</Button></>} />

            <section className="space-y-3">
                <p className={section}>Type</p>
                <Card><CardContent className="space-y-2 p-5">
                    <p className="page-eyebrow">Eyebrow · 10px label</p>
                    <p className="page-title">Page title</p>
                    <p className="text-base font-semibold text-text-primary">Section title</p>
                    <p className="text-[13px] text-text-secondary">Body text — 13px, sentence case, normal tracking.</p>
                    <p className="text-[12px] text-text-muted">Secondary / helper text — 12px.</p>
                </CardContent></Card>
            </section>

            <section className="space-y-3">
                <p className={section}>Buttons & inputs</p>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button>
                    <Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button>
                    <Button variant="destructive-outline">Delete</Button><Button variant="secondary">Secondary</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search jobs…" className="w-[240px]" />
                    <Select defaultValue="all"><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All clients</SelectItem><SelectItem value="acme">Acme Retail</SelectItem></SelectContent></Select>
                </div>
            </section>

            <section className="space-y-3">
                <p className={section}>List toolbar</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SortControl value={sort} onChange={setSort} options={[{ value: 'date', label: 'Date' }, { value: 'client', label: 'Client' }]} dateAsc={asc} onToggleDirection={() => setAsc(a => !a)} />
                    <FiltersPopover activeCount={status.length} onReset={() => setStatus([])}>
                        <FilterSection title="Status"><CheckboxFilter idPrefix="sg" options={STATUSES.job} selected={status} onChange={setStatus} /></FilterSection>
                    </FiltersPopover>
                    <DateRangeButton value={range} onChange={setRange} />
                </div>
            </section>

            <section className="space-y-3">
                <p className={section}>Tabs</p>
                <Tabs defaultValue="a"><TabsList className="tabs"><TabsTrigger value="a" className="tab">Pills (page sections)</TabsTrigger><TabsTrigger value="b" className="tab">Second</TabsTrigger></TabsList><TabsContent value="a" /></Tabs>
                <Tabs defaultValue="a"><TabsList className="h-auto gap-6 bg-transparent p-0 border-b border-border-sub rounded-none"><TabsTrigger value="a" className="tab-underline">Underline (detail pages)</TabsTrigger><TabsTrigger value="b" className="tab-underline">Second</TabsTrigger></TabsList></Tabs>
            </section>

            <section className="space-y-3">
                <p className={section}>Status colors</p>
                <div className="flex flex-wrap gap-4">
                    {TONES.map(([t, label]) => <span key={t} className="flex items-center gap-2 text-[12px] text-text-secondary"><span className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[t]}`} />{label}</span>)}
                </div>
                {(Object.keys(STATUSES) as StatusKind[]).map(kind => (
                    <div key={kind} className="flex flex-wrap items-center gap-2">
                        <span className="w-16 text-[12px] capitalize text-text-muted">{kind}</span>
                        {STATUSES[kind].map(v => <StatusBadge key={v} kind={kind} value={v} />)}
                    </div>
                ))}
            </section>

            <section className="space-y-3">
                <p className={section}>Summary tiles</p>
                <StatGrid>
                    <StatCard label="Net pay" value="$12,480" sub="$14,800 gross" tone="done" />
                    <StatCard label="Open jobs" value="18" sub="4 unassigned" />
                    <StatCard label="Disputed" value="2" tone="problem" sub="needs review" />
                </StatGrid>
            </section>

            <section className="space-y-3">
                <p className={section}>Card & table</p>
                <Card>
                    <CardHeader><CardTitle>Card title</CardTitle><CardDescription>One line describing the card.</CardDescription></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader><TableRow><TableHead className="pl-6">Job</TableHead><TableHead>Client</TableHead><TableHead className="text-right pr-6">Status</TableHead></TableRow></TableHeader>
                            <TableBody>
                                <TableRow><TableCell className="pl-6 font-medium">Cabling — Install</TableCell><TableCell>Acme Retail</TableCell><TableCell className="text-right pr-6"><StatusBadge kind="job" value="in-progress" /></TableCell></TableRow>
                                <TableRow><TableCell className="pl-6 font-medium">Cameras — Repair</TableCell><TableCell>Metro Schools</TableCell><TableCell className="text-right pr-6"><StatusBadge kind="job" value="completed" /></TableCell></TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3"><p className={section}>Empty</p>
                    <EmptyState icon={Inbox} title="No jobs match these filters" description="Try a different date range or clear the filters." action={<Button variant="outline" size="sm">Reset filters</Button>} /></div>
                <div className="space-y-3"><p className={section}>Loading</p><LoadingState label="Loading jobs…" rows={3} /></div>
            </section>
            <EmptyState icon={Briefcase} title="No projects yet" description="Projects you create or are assigned to show up here." compact />
        </div>
    );
}
