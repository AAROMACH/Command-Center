'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { makeTripLogId } from '@/lib/doc-ids';
import type { TripLog } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Car, MapPin, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  technicianId: string;
  technicianName?: string;
};

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  startLocation: '',
  endLocation: '',
  miles: '',
  purpose: '',
  reimbursable: true,
};

export function LogTripDialog({ open, onClose, technicianId, technicianName }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setForm(EMPTY_FORM);
    onClose();
  }

  async function handleSubmit() {
    if (!form.startLocation.trim() || !form.endLocation.trim() || !form.miles) {
      toast({ title: 'Missing fields', description: 'Start location, end location, and miles are required.', variant: 'destructive' });
      return;
    }
    const miles = parseFloat(form.miles);
    if (isNaN(miles) || miles <= 0) {
      toast({ title: 'Invalid miles', description: 'Enter a positive number for miles.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const id = await makeTripLogId();
      const tripLog: TripLog = {
        id,
        technicianId,
        technicianName: technicianName || '',
        date: form.date,
        startLocation: form.startLocation.trim(),
        endLocation: form.endLocation.trim(),
        miles,
        purpose: form.purpose.trim(),
        reimbursable: form.reimbursable,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'tripLogs'), { ...tripLog });
      toast({ title: 'Trip logged', description: `${miles} miles recorded — pending reimbursement review.` });
      handleClose();
    } catch {
      toast({ title: 'Save failed', description: 'Could not save trip log. Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-bg-secondary border-border-main max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary">
            <Car size={16} className="text-brand-red" />
            Log Trip
          </DialogTitle>
          <DialogDescription className="text-[10px] text-text-muted uppercase tracking-wider">
            Record mileage for reimbursement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Miles Driven</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="0.0"
                value={form.miles}
                onChange={e => setForm(f => ({ ...f, miles: e.target.value }))}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
              <MapPin size={10} className="text-brand-red" />
              Start Location
            </Label>
            <Input
              placeholder="e.g. Home / Office / 123 Main St"
              value={form.startLocation}
              onChange={e => setForm(f => ({ ...f, startLocation: e.target.value }))}
              className="h-9 text-xs bg-bg-tertiary border-border-main"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
              <MapPin size={10} className="text-text-green" />
              End Location / Job Site
            </Label>
            <Input
              placeholder="e.g. Job site address"
              value={form.endLocation}
              onChange={e => setForm(f => ({ ...f, endLocation: e.target.value }))}
              className="h-9 text-xs bg-bg-tertiary border-border-main"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Purpose / Notes</Label>
            <Input
              placeholder="e.g. Service call, supply pickup..."
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              className="h-9 text-xs bg-bg-tertiary border-border-main"
            />
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <Checkbox
              id="reimbursable"
              checked={form.reimbursable}
              onCheckedChange={v => setForm(f => ({ ...f, reimbursable: !!v }))}
              className="border-border-main data-[state=checked]:bg-brand-red data-[state=checked]:border-brand-red"
            />
            <Label htmlFor="reimbursable" className="text-[11px] font-bold uppercase tracking-wider text-text-muted cursor-pointer">
              Request reimbursement
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Car size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Log Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
