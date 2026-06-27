'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { makeLeadId } from '@/lib/doc-ids';
import type { Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Target } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
};

const EMPTY: Partial<Lead> = {
  companyName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  source: 'other',
  stage: 'new',
  estimatedValue: 0,
  notes: '',
  tags: [],
};

export function NewLeadDialog({ open, onClose, currentUserId }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Lead>>(EMPTY);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setForm(EMPTY);
    onClose();
  }

  async function handleSave() {
    if (!form.companyName?.trim()) {
      toast({ title: 'Company name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const id = await makeLeadId();
      const now = new Date().toISOString();
      const lead: Lead = {
        id,
        companyName: form.companyName!.trim(),
        contactName: form.contactName || '',
        contactEmail: form.contactEmail || '',
        contactPhone: form.contactPhone || '',
        source: form.source as Lead['source'] || 'other',
        stage: 'new',
        estimatedValue: Number(form.estimatedValue) || 0,
        assignedTo: currentUserId,
        notes: form.notes || '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      await addDoc(collection(db, 'leads'), { ...lead });
      toast({ title: 'Lead created', description: `${lead.companyName} added to pipeline.` });
      handleClose();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof Lead, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-bg-secondary border-border-main max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary">
            <Target size={16} className="text-brand-red" />
            New Lead
          </DialogTitle>
          <DialogDescription className="text-[10px] text-text-muted uppercase tracking-wider">
            Add a prospect to the sales pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Company Name *</Label>
            <Input
              placeholder="Acme Corp"
              value={form.companyName || ''}
              onChange={e => set('companyName', e.target.value)}
              className="h-9 text-xs bg-bg-tertiary border-border-main"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Contact Name</Label>
              <Input
                placeholder="John Smith"
                value={form.contactName || ''}
                onChange={e => set('contactName', e.target.value)}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Est. Value ($)</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.estimatedValue || ''}
                onChange={e => set('estimatedValue', e.target.value)}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Email</Label>
              <Input
                type="email"
                placeholder="john@acme.com"
                value={form.contactEmail || ''}
                onChange={e => set('contactEmail', e.target.value)}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Phone</Label>
              <Input
                placeholder="(555) 123-4567"
                value={form.contactPhone || ''}
                onChange={e => set('contactPhone', e.target.value)}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Source</Label>
            <Select value={form.source || 'other'} onValueChange={v => set('source', v)}>
              <SelectTrigger className="h-9 text-xs bg-bg-tertiary border-border-main">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="cold_call">Cold Call</SelectItem>
                <SelectItem value="field_nation">Field Nation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Notes</Label>
            <Input
              placeholder="Initial context, referral info..."
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              className="h-9 text-xs bg-bg-tertiary border-border-main"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Target size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Add Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
