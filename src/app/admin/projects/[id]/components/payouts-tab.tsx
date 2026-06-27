'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { makeProjectPayoutId } from '@/lib/doc-ids';
import type { ProjectPayout, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, DollarSign, Check, Loader2, Banknote } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'projectPayouts'), where('projectId', '==', projectId));
    const unsub = onSnapshot(q, (snap) => {
      setPayouts(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectPayout)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [projectId]);

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
      const payout: ProjectPayout = {
        id,
        projectId,
        technicianId: form.technicianId,
        technicianName: tech?.name || '',
        role: form.role,
        payType: form.payType,
        amount: parseFloat(form.amount),
        notes: form.notes,
        status: 'pending',
        createdAt: now,
      };
      await addDoc(collection(db, 'projectPayouts'), { ...payout });
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
        ...(status === 'paid' ? { paidAt: new Date().toISOString() } : {}),
        ...(status === 'approved' ? { approvedAt: new Date().toISOString() } : {}),
      });
      toast({ title: `Payout ${status}` });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  }

  const totalOwed = payouts.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

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
        <div className="ml-auto">
          <Button
            size="sm"
            className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus size={12} className="mr-1.5" />
            Add Payout
          </Button>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="border border-border-sub rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border-sub">
              <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-4">Technician</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Role</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest">Type</TableHead>
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
            ) : payouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <div className="space-y-2">
                    <Banknote size={24} className="mx-auto text-text-muted opacity-40" />
                    <p className="text-xs text-text-muted uppercase tracking-widest font-bold">No payout records</p>
                    <p className="text-[10px] text-text-muted">Add payout records for technicians working this project.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              payouts.map(payout => (
                <TableRow key={payout.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                  <TableCell className="text-xs font-bold uppercase pl-4">{payout.technicianName || payout.technicianId.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs text-text-muted capitalize">{payout.role}</TableCell>
                  <TableCell className="text-xs text-text-muted capitalize">{payout.payType.replace('_', ' ')}</TableCell>
                  <TableCell className="font-mono text-sm font-bold tabular-nums text-text-primary">
                    ${payout.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_STYLES[payout.status]?.variant || 'default'} className="text-[8px] h-4 uppercase">
                      {STATUS_STYLES[payout.status]?.label || payout.status}
                    </Badge>
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

      {/* Add Payout Dialog */}
      <Dialog open={isAddOpen} onOpenChange={v => !v && setIsAddOpen(false)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Banknote size={16} className="text-brand-red" />
              Add Payout Record
            </DialogTitle>
            <DialogDescription className="text-[10px] text-text-muted uppercase tracking-wider">
              Record a payout for a technician on this project.
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
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || t.id}
                    </SelectItem>
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
                placeholder="Phase 1 completion, milestone bonus..."
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
