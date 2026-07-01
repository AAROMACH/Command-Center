'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { makeProjectPayoutId } from '@/lib/doc-ids';
import type { ProjectPayout, ProjectDailyLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, DollarSign, Check, Loader2, Banknote, Clock, Calculator, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<ProjectPayout['status'], { label: string; variant: any }> = {
  pending: { label: 'Pending', variant: 'scheduled' },
  approved: { label: 'Approved', variant: 'active' },
  paid: { label: 'Paid', variant: 'completed' },
};

type Props = {
  projectId: string;
  technicians: Technician[];
  currentUserId?: string;
};

const EMPTY_FORM = {
  technicianId: '',
  role: 'crew' as ProjectPayout['role'],
  payType: 'fixed' as ProjectPayout['payType'],
  amount: '',
  notes: '',
};

export function PayoutsTab({ projectId, technicians, currentUserId }: Props) {
  const { toast } = useToast();
  const [payouts, setPayouts] = useState<ProjectPayout[]>([]);
  const [projectLogs, setProjectLogs] = useState<ProjectDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  // Filter state
  const [filterTech, setFilterTech] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Timesheet section expand state per tech
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, 'projectPayouts'), where('projectId', '==', projectId)),
      (snap) => {
        setPayouts(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectPayout)));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'projectDailyLogs'), where('projectId', '==', projectId)),
      (snap) => {
        setProjectLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDailyLog)));
      }
    );

    return () => { unsub1(); unsub2(); };
  }, [projectId]);

  // Compute per-tech timesheet summaries
  const timesheetSummaries = useMemo(() => {
    return technicians
      .map(tech => {
        const logs = projectLogs.filter(l => l.techId === tech.id);
        if (logs.length === 0) return null;
        const totalHours = logs.reduce((sum, l) => sum + (l.hoursWorked || 0), 0);
        const rate = tech.hourlyRate || 0;
        // Deduct hours already covered by existing timesheet payouts for this tech
        const existingTimesheetHours = payouts
          .filter(p => p.technicianId === tech.id && p.payoutSource === 'timesheet')
          .reduce((sum, p) => sum + (p.hoursWorked || 0), 0);
        const remainingHours = Math.max(0, totalHours - existingTimesheetHours);
        return {
          tech,
          logs,
          totalHours,
          rate,
          remainingHours,
          suggested: remainingHours * rate,
          logIds: logs.map(l => l.id),
        };
      })
      .filter(Boolean)
      .filter(s => s!.totalHours > 0) as NonNullable<ReturnType<typeof technicians.map>[0]>[];
  }, [technicians, projectLogs, payouts]) as {
    tech: Technician;
    logs: ProjectDailyLog[];
    totalHours: number;
    rate: number;
    remainingHours: number;
    suggested: number;
    logIds: string[];
  }[];

  async function handleGenerateTimesheetPayout(summary: typeof timesheetSummaries[0]) {
    if (summary.remainingHours <= 0) {
      toast({ title: 'All hours already have payout records', variant: 'destructive' });
      return;
    }
    if (!summary.rate) {
      toast({ title: 'No hourly rate set for this technician', variant: 'destructive' });
      return;
    }
    setGenerating(summary.tech.id);
    try {
      const id = await makeProjectPayoutId();
      const now = new Date().toISOString();
      await addDoc(collection(db, 'projectPayouts'), {
        id,
        projectId,
        technicianId: summary.tech.id,
        technicianName: summary.tech.name || '',
        role: 'crew' as const,
        payType: 'hourly' as const,
        payoutSource: 'timesheet' as const,
        amount: parseFloat(summary.suggested.toFixed(2)),
        hoursWorked: summary.remainingHours,
        hourlyRate: summary.rate,
        timesheetLogIds: summary.logIds,
        notes: `Auto-calculated: ${summary.remainingHours.toFixed(2)}h × $${summary.rate}/hr`,
        status: 'pending' as const,
        createdAt: now,
      });
      toast({ title: 'Timesheet payout record created' });
    } catch {
      toast({ title: 'Failed to create payout record', variant: 'destructive' });
    } finally {
      setGenerating(null);
    }
  }

  async function handleAdd() {
    if (!form.technicianId || !form.amount) {
      toast({ title: 'Technician and amount are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const id = await makeProjectPayoutId();
      const tech = technicians.find(t => t.id === form.technicianId);
      const now = new Date().toISOString();
      await addDoc(collection(db, 'projectPayouts'), {
        id,
        projectId,
        technicianId: form.technicianId,
        technicianName: tech?.name || '',
        role: form.role,
        payType: form.payType,
        payoutSource: 'manual' as const,
        amount: parseFloat(form.amount),
        notes: form.notes,
        status: 'pending' as const,
        createdAt: now,
      });
      toast({ title: 'Payout record added' });
      setForm(EMPTY_FORM);
      setIsAddOpen(false);
    } catch {
      toast({ title: 'Failed to add payout', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: ProjectPayout['status']) {
    try {
      await updateDoc(doc(db, 'projectPayouts', id), {
        status,
        ...(status === 'approved' ? { approvedAt: new Date().toISOString(), approvedBy: currentUserId || '' } : {}),
        ...(status === 'paid' ? { paidAt: new Date().toISOString(), paidBy: currentUserId || '' } : {}),
      });
      toast({ title: `Payout ${status}` });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  }

  const filteredPayouts = useMemo(() => {
    return payouts.filter(p => {
      if (filterTech && p.technicianId !== filterTech) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterSource && (p as any).payoutSource !== filterSource) return false;
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [payouts, filterTech, filterStatus, filterSource]);

  const totalOwed = payouts.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const hasFilters = filterTech || filterStatus || filterSource;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            ${totalOwed.toLocaleString()} Owed
          </span>
        </div>
        <span className="text-text-muted text-xs">·</span>
        <div className="flex items-center gap-1.5">
          <Check size={12} className="text-text-green" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-green">
            ${totalPaid.toLocaleString()} Paid
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[10px] font-bold uppercase border-border-main"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus size={12} className="mr-1.5" />
            Manual Payout
          </Button>
        </div>
      </div>

      {/* Timesheet-Based Suggestions */}
      {timesheetSummaries.length > 0 && (
        <div className="border border-border-sub rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary border-b border-border-sub">
            <Calculator size={12} className="text-accent-gold" />
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Timesheet Payouts</p>
            <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-text-muted">
              Based on logged hours × hourly rate
            </span>
          </div>
          <div className="divide-y divide-border-sub">
            {timesheetSummaries.map(summary => {
              const isExpanded = expandedTechs.has(summary.tech.id);
              return (
                <div key={summary.tech.id}>
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-text-primary truncate">
                        {summary.tech.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[9px] text-text-muted font-mono">
                          {summary.totalHours.toFixed(2)}h total
                        </span>
                        {summary.remainingHours < summary.totalHours && (
                          <span className="text-[9px] text-text-muted font-mono">
                            · {summary.remainingHours.toFixed(2)}h remaining
                          </span>
                        )}
                        {summary.rate ? (
                          <span className="text-[9px] text-text-muted font-mono">· ${summary.rate}/hr</span>
                        ) : (
                          <span className="text-[9px] text-brand-red font-bold uppercase">No rate set</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-mono text-sm font-bold text-text-green tabular-nums">
                        ${summary.suggested.toFixed(2)}
                      </p>
                      <button
                        onClick={() => setExpandedTechs(prev => {
                          const next = new Set(prev);
                          next.has(summary.tech.id) ? next.delete(summary.tech.id) : next.add(summary.tech.id);
                          return next;
                        })}
                        className="text-text-muted hover:text-text-primary transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <Button
                        size="sm"
                        disabled={!!generating || summary.remainingHours <= 0 || !summary.rate}
                        onClick={() => handleGenerateTimesheetPayout(summary)}
                        className="h-7 text-[9px] font-bold uppercase bg-accent-gold/10 border border-accent-gold/30 text-accent-gold hover:bg-accent-gold hover:text-white transition-all"
                      >
                        {generating === summary.tech.id ? (
                          <Loader2 size={10} className="animate-spin mr-1" />
                        ) : (
                          <Banknote size={10} className="mr-1" />
                        )}
                        {summary.remainingHours <= 0 ? 'Covered' : 'Generate'}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-bg-primary border-t border-border-sub">
                      <div className="space-y-1 mt-2">
                        {summary.logs.map(log => (
                          <div key={log.id} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                              <Clock size={10} className="text-text-muted" />
                              <span className="text-[10px] font-mono text-text-muted">{log.date}</span>
                              <span className="text-[10px] text-text-secondary">{log.workSummary?.slice(0, 60)}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-text-primary">
                              {log.hoursWorked.toFixed(2)}h
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payout History */}
      <div className="border border-border-sub rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary border-b border-border-sub">
          <Banknote size={12} className="text-text-muted" />
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Payout History</p>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              'ml-auto flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest transition-colors',
              hasFilters ? 'text-brand-red' : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Filter size={10} />
            Filters {hasFilters ? '(active)' : ''}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border-sub bg-bg-primary">
            <Select value={filterTech} onValueChange={setFilterTech}>
              <SelectTrigger className="h-7 text-[10px] w-[160px] bg-bg-tertiary border-border-main">
                <SelectValue placeholder="All Technicians" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="">All Technicians</SelectItem>
                {technicians.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 text-[10px] w-[130px] bg-bg-tertiary border-border-main">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-7 text-[10px] w-[130px] bg-bg-tertiary border-border-main">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="">All Sources</SelectItem>
                <SelectItem value="timesheet">Timesheet</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <button
                onClick={() => { setFilterTech(''); setFilterStatus(''); setFilterSource(''); }}
                className="text-[9px] font-bold text-brand-red hover:underline uppercase tracking-widest"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border-sub">
              <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-4">Technician</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Source</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Hours</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Amount</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Notes</TableHead>
              <TableHead className="text-right pr-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-xs text-text-muted uppercase tracking-widest">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredPayouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <div className="space-y-2">
                    <Banknote size={24} className="mx-auto text-text-muted opacity-40" />
                    <p className="text-xs text-text-muted uppercase tracking-widest font-bold">
                      {hasFilters ? 'No matching payout records' : 'No payout records'}
                    </p>
                    {!hasFilters && (
                      <p className="text-[10px] text-text-muted">Generate from timesheets above or add a manual payout.</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredPayouts.map(payout => (
                <TableRow key={payout.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                  <TableCell className="text-xs font-bold uppercase pl-4">
                    {payout.technicianName || payout.technicianId.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
                      (payout as any).payoutSource === 'timesheet'
                        ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/20'
                        : 'bg-bg-tertiary text-text-muted border border-border-sub'
                    )}>
                      {(payout as any).payoutSource === 'timesheet' ? <Clock size={8} /> : <Banknote size={8} />}
                      {(payout as any).payoutSource || 'manual'}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-text-muted">
                    {payout.hoursWorked ? `${payout.hoursWorked.toFixed(2)}h` : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-bold tabular-nums text-text-primary">
                    ${payout.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <Badge variant={STATUS_STYLES[payout.status]?.variant || 'default'} className="text-[8px] h-4 uppercase">
                        {STATUS_STYLES[payout.status]?.label || payout.status}
                      </Badge>
                      {payout.status === 'approved' && (payout as any).approvedAt && (
                        <p className="text-[8px] text-text-muted">
                          {new Date((payout as any).approvedAt).toLocaleDateString()}
                        </p>
                      )}
                      {payout.status === 'paid' && payout.paidAt && (
                        <p className="text-[8px] text-text-muted">
                          {new Date(payout.paidAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-text-muted max-w-[140px] truncate">{payout.notes || '—'}</TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex gap-1.5 justify-end">
                      {payout.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[9px] font-bold uppercase"
                          onClick={() => updateStatus(payout.id, 'approved')}
                        >
                          Approve
                        </Button>
                      )}
                      {payout.status === 'approved' && (
                        <Button
                          size="sm"
                          className="h-7 text-[9px] font-bold uppercase bg-text-green/20 hover:bg-text-green/30 text-text-green border border-text-green/30"
                          onClick={() => updateStatus(payout.id, 'paid')}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Manual Payout Dialog */}
      <Dialog open={isAddOpen} onOpenChange={v => !v && setIsAddOpen(false)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Banknote size={16} className="text-brand-red" />
              Manual Payout Record
            </DialogTitle>
            <DialogDescription className="text-[10px] text-text-muted uppercase tracking-wider">
              Add a manual payout — bonus, fixed payment, or adjustment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Technician *</Label>
              <Select value={form.technicianId} onValueChange={v => setForm(f => ({ ...f, technicianId: v }))}>
                <SelectTrigger className="h-9 text-xs bg-bg-tertiary border-border-main">
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as ProjectPayout['role'] }))}>
                  <SelectTrigger className="h-9 text-xs bg-bg-tertiary border-border-main">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="crew">Crew</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Type</Label>
                <Select value={form.payType} onValueChange={v => setForm(f => ({ ...f, payType: v as ProjectPayout['payType'] }))}>
                  <SelectTrigger className="h-9 text-xs bg-bg-tertiary border-border-main">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Amount ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Notes</Label>
              <Input
                placeholder="Milestone bonus, phase completion..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setIsAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white"
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
              {saving ? 'Saving...' : 'Add Payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
