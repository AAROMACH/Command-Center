'use client';

import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Search, Wallet } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Technician } from '@/lib/types';
import { isClient } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { auditEvent } from '@/lib/audit';

/** Payroll → Wages: each person's default hourly rate (used for project timesheets). */
export function WagesButton({ people, by }: { people: Technician[]; by: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="h-9 border-border-main" onClick={() => setOpen(true)}>
        <Wallet size={14} className="mr-1.5" /> Wages
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Default hourly wages</DialogTitle>
            <DialogDescription>Used for project timesheets. Changing one doesn’t touch hours already added to a weekly log.</DialogDescription>
          </DialogHeader>
          {open && <WagesList people={people} by={by} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function WagesList({ people, by }: { people: Technician[]; by: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => people
    .filter(p => !isClient(p) && (p as any).accountStatus !== 'deleted' && (!q.trim() || (p.name || '').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')), [people, q]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search person…" className="h-10 pl-8" aria-label="Search person" />
      </div>
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-border-sub rounded-lg border border-border-sub">
        {list.map(p => <WageRow key={p.id} person={p} by={by} />)}
        {!list.length && <p className="p-4 text-center text-[13px] text-text-muted">No one matches.</p>}
      </div>
    </div>
  );
}

function WageRow({ person, by }: { person: Technician; by: string }) {
  const { toast } = useToast();
  const saved = person.hourlyRate ?? null;
  const [value, setValue] = useState(saved != null ? String(saved) : '');
  const [busy, setBusy] = useState(false);
  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000);
  const dirty = parsed !== saved;
  const save = async () => {
    setBusy(true);
    try {
      const rate = parsed === null ? 0 : Math.round(parsed * 100) / 100;
      await updateDoc(doc(db, 'users', person.id), { hourlyRate: rate });
      void auditEvent('users', person.id, by, by, 'wage_changed', `Hourly wage $${saved ?? 0} → $${rate}`).catch(() => {});
      toast({ title: 'Wage saved', description: `${person.name}: $${rate.toFixed(2)}/hr` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: e?.message || 'Try again.' });
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{person.name || person.id}</span>
      <span className="text-[12px] text-text-muted">$</span>
      <Input type="number" inputMode="decimal" min={0} step="0.01" value={value} onChange={e => setValue(e.target.value)}
        className="h-9 w-24 text-right font-mono text-[13px]" aria-label={`${person.name} hourly wage`} />
      <span className="text-[12px] text-text-muted">/hr</span>
      <Button size="sm" className="h-9 w-16" disabled={!dirty || !valid || busy} onClick={save}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
      </Button>
    </div>
  );
}
