'use client';

import { useEffect, useState } from 'react';
import type { Lead, Quote, SiteSurvey } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { LOST_REASONS } from '@/lib/crm';
import { changeLeadStage, handOffToOps } from '@/lib/crm-actions';

type Props = {
  lead: Lead | null;
  outcome: 'won' | 'lost' | null;
  currentUserId: string;
  quotes?: Quote[];
  surveys?: SiteSurvey[];
  onClose: () => void;
};

/**
 * Closing a deal captures the data the win/loss report depends on:
 * the final contract value on a win, a categorized reason on a loss.
 */
export function CloseDealDialog({ lead, outcome, currentUserId, quotes = [], surveys = [], onClose }: Props) {
  const { toast } = useToast();
  const [category, setCategory] = useState('');
  const [detail, setDetail] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [handoff, setHandoff] = useState(true);

  useEffect(() => {
    if (lead) {
      setCategory('');
      setDetail('');
      setValue(lead.estimatedValue ? String(lead.estimatedValue) : '');
    }
  }, [lead?.id, outcome]);

  if (!lead || !outcome) return null;
  const won = outcome === 'won';

  async function save() {
    if (!won && !category) {
      toast({ title: 'Pick a lost reason', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await changeLeadStage(lead!, outcome!, currentUserId, won
        ? { estimatedValue: Number(value) || 0, probability: 100 }
        : { lostReasonCategory: category, lostReason: detail.trim(), probability: 0 });
      if (won && handoff && !lead!.projectId) {
        try {
          const finalValue = Number(value) || 0;
          const projectId = await handOffToOps({ ...lead!, stage: 'won', estimatedValue: finalValue }, quotes, currentUserId, surveys);
          toast({ title: 'Deal won 🎉', description: `Project ${projectId} created for ops (on hold).` });
        } catch {
          toast({ variant: 'destructive', title: 'Deal won, but the project was not created', description: 'Use "Hand off to Ops" on the deal to retry.' });
        }
      } else {
        toast({ title: won ? 'Deal won 🎉' : 'Deal marked lost' });
      }
      onClose();
    } catch {
      toast({ title: 'Failed to close deal', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
            {won ? <CheckCircle2 size={14} className="text-text-green" /> : <XCircle size={14} className="text-text-red" />}
            {won ? 'Mark Won' : 'Mark Lost'}
          </DialogTitle>
          <DialogDescription className="text-[10px] uppercase font-bold text-text-muted">{lead.companyName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {won ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Final Contract Value ($)</Label>
              <Input type="number" min="0" value={value} onChange={e => setValue(e.target.value)} className="h-9 text-xs bg-bg-tertiary border-border-main" />
              {!lead.projectId && (
                <label className="flex items-center gap-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted cursor-pointer">
                  <Checkbox checked={handoff} onCheckedChange={v => setHandoff(!!v)} /> Create project for ops
                </label>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Reason *</Label>
                <Select value={category || undefined} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-xs bg-bg-tertiary border-border-main"><SelectValue placeholder="Why did we lose it?" /></SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    {LOST_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Details</Label>
                <Input placeholder="Competitor name, price gap, etc." value={detail} onChange={e => setDetail(e.target.value)} className="h-9 text-xs bg-bg-tertiary border-border-main" />
              </div>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[10px] font-black uppercase">Cancel</Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            className={won ? 'bg-text-green hover:bg-text-green/90 text-white text-[10px] font-black uppercase' : 'bg-text-red hover:bg-text-red/90 text-white text-[10px] font-black uppercase'}
          >
            {saving && <Loader2 size={12} className="animate-spin mr-1.5" />}
            {won ? 'Mark Won' : 'Mark Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
