'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Technician } from '@/lib/types';
import { formatMoney, INTERVAL_LABELS } from '@/lib/billing';
import { buildMigrationPreview, runMigration, type MigrationPreview } from '@/lib/billing-migration';

/**
 * One-time import from the old Plans page. Shows exactly what will be
 * created; custom plans whose client can't be found (the old page seeded a
 * demo "Global Corp" plan) start unchecked.
 */
export function MigrationDialog({ open, onClose, users }: { open: boolean; onClose: () => void; users: Technician[] }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    buildMigrationPreview(users)
      .then(p => {
        setPreview(p);
        setSelected(new Set(p.plans.filter(x => !x.unmatchedClient || x.subscriberCount > 0).map(x => x.plan.id)));
      })
      .catch(e => toast({ variant: 'destructive', title: 'Could not read old plans', description: e.message }))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string, on: boolean) => setSelected(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const handleRun = async () => {
    if (!preview) return;
    setRunning(true);
    try {
      const n = await runMigration(preview, selected);
      toast({ title: 'Import complete', description: `${n} records written.` });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: e.message });
    } finally {
      setRunning(false);
    }
  };

  const nothing = preview && preview.plans.length === 0 && !preview.pricing && preview.subscriptions.length === 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !running) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] p-0 flex flex-col bg-bg-elevated border-border-main">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border-sub text-left">
          <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Import From Old Plans Page</DialogTitle>
          <DialogDescription className="text-xs">Runs once. Plan ids are kept, so clients stay on the same plans.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {loading && <p className="text-xs text-text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Reading old data…</p>}
          {nothing && <p className="text-xs text-text-muted">Nothing to import — start by creating your plans.</p>}
          {preview && preview.plans.length > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Plans</p>
              {preview.plans.map(({ plan, unmatchedClient, subscriberCount, legacy }) => (
                <label key={plan.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-border-sub bg-bg-secondary cursor-pointer">
                  <Checkbox checked={selected.has(plan.id)} onCheckedChange={v => toggle(plan.id, !!v)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">{plan.name} <span className="text-text-muted font-normal">· {plan.kind}</span></p>
                    <p className="text-[10px] text-text-muted">
                      {plan.prices.map(p => `${formatMoney(p.amount)} ${INTERVAL_LABELS[p.interval].toLowerCase()}`).join(', ')}
                      {' · '}{plan.benefits.responseHours}h response · {plan.benefits.laborDiscountPct}% labor discount
                      {' · '}{subscriberCount} active client{subscriberCount === 1 ? '' : 's'}
                    </p>
                    {unmatchedClient && (
                      <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                        <AlertTriangle size={10} /> Client &quot;{legacy.clientName}&quot; not found — likely demo data.
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </section>
          )}
          {preview?.pricing && (
            <section className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pricing</p>
              <p className="text-xs">{preview.pricing.laborRates.length} labor/service rates · {preview.pricing.defaultMarkupPct}% default material markup</p>
            </section>
          )}
          {preview && preview.subscriptions.length > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Client Subscriptions</p>
              <p className="text-xs">
                {preview.subscriptions.filter(s => s.status === 'active').length} active and {preview.subscriptions.filter(s => s.status === 'pending').length} requested,
                from clients&apos; current plan settings. Set each one&apos;s next billing date after import.
              </p>
            </section>
          )}
        </div>
        <DialogFooter className="p-4 sm:p-6 border-t border-border-sub flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={running} className="h-10 w-full sm:w-auto text-[10px] font-black uppercase">Cancel</Button>
          <Button onClick={handleRun} disabled={running || loading || !preview || !!nothing} className="h-10 w-full sm:w-auto bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
            {running && <Loader2 size={12} className="mr-1.5 animate-spin" />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
