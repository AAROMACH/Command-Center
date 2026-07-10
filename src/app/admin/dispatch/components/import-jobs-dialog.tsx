'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Import as ImportIcon, Loader2, AlertTriangle, CircleCheck, ChevronRight, ArrowLeft, MapPin, Pencil, Building2, Calendar, Clock, X, Eye, RotateCcw, ShieldAlert } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { normalizeExternalId } from '@/lib/work-order-identity';

// A record the importer can match a parsed row against — anything in the app
// that already carries an external work order number (active/assigned/completed
// work orders and assignments, plus archived deletions).
export type ExistingRef = {
  externalId: string;   // normalized external work order number
  label: string;        // human id shown in the warning
  status?: string;
  techName?: string;
  scheduleDate?: string;
  where: string;        // e.g. "active assignment", "archived"
};

type RowStatus = 'ready' | 'needs_review' | 'duplicate_found' | 'skipped' | 'removed' | 'approved_override' | 'imported';

type ParsedRow = WorkOrder & {
  rowKey: string;                 // stable key for the row (parse order)
  externalWorkOrderId: string;    // original external number (display form)
  rowStatus: RowStatus;
  match?: ExistingRef;            // matched existing record when duplicate
  overrideBy?: string;
  overrideAt?: string;
};

type ImportJobsDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onImport: (newOrders: WorkOrder[]) => void;
  existingOrders: WorkOrder[];
  /** Everything already in the app to check duplicates against (assignments, archives, …). */
  existingRefs?: ExistingRef[];
  currentUserName?: string;
};

export function ImportJobsDialog({ isOpen, setIsOpen, onImport, existingOrders, existingRefs = [], currentUserName = 'Admin' }: ImportJobsDialogProps) {
  const [pastedText, setPastedText] = useState('');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [editingField, setEditingField] = useState<{ id: string, field: string } | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const { toast } = useToast();

  // Combined lookup of every external id already in the app, keyed by normalized id.
  const existingByExternalId = useMemo(() => {
    const map = new Map<string, ExistingRef>();
    // Work orders passed directly — only imported ones carry an external
    // work order number, so manual jobs can't produce false duplicate matches.
    for (const o of existingOrders) {
      if (o.source !== 'Imported') continue;
      const ext = normalizeExternalId((o as any).externalWorkOrderId || o.workOrderId || o.id);
      if (ext && !map.has(ext)) {
        map.set(ext, { externalId: ext, label: ((o as any).externalWorkOrderId || o.id || '').toString().toUpperCase(), status: o.status, where: 'work order pool' });
      }
    }
    // Extra references (assignments, completed, archived, …)
    for (const ref of existingRefs) {
      const ext = normalizeExternalId(ref.externalId);
      if (ext && !map.has(ext)) map.set(ext, { ...ref, externalId: ext });
    }
    return map;
  }, [existingOrders, existingRefs]);

  const handleAnalyze = () => {
    if (!pastedText.trim()) return;
    setIsProcessing(true);

    const parsePastedText = (text: string): Omit<ParsedRow, 'rowStatus' | 'match'>[] => {
      const blocks = text.split(/\n\s*\n/).filter(b => b.trim());

      return (blocks.map((block, blockIdx): Omit<ParsedRow, 'rowStatus' | 'match'> | null => {
        const lines = block.split('\n').map(l => l.trim());
        if (lines.length < 5) return null;

        const rawId = lines[0]; // 8 digit identifier
        const title = lines[1];
        const serviceDateTime = lines[2]; // e.g. 5/26/2026 at 11:00 AM(EDT)
        const location = lines[3];
        const company = lines[4];
        const payModelRaw = lines[6] || ''; // e.g. blendedPayment Terms
        const laborRateRaw = lines[7] || ''; // e.g. 2 hrs @ $110 and then up to 1 hr @ $55/hr

        let payType: 'fixed' | 'hourly' | 'blended' = 'fixed';
        if (payModelRaw.toLowerCase().includes('blended')) payType = 'blended';
        else if (payModelRaw.toLowerCase().includes('hourly')) payType = 'hourly';

        let pay = 0;
        let blendedFixedPay = 0;
        let blendedIncludedHours = 0;
        let blendedHourlyRate = 0;

        if (payType === 'blended') {
          const fixedMatch = laborRateRaw.match(/(\d+)\s*hrs?\s*@\s*\$(\d+)/);
          const hourlyMatch = laborRateRaw.match(/@\s*\$(\d+)\/hr/);
          if (fixedMatch) {
            blendedIncludedHours = parseInt(fixedMatch[1]);
            blendedFixedPay = parseFloat(fixedMatch[2]);
            pay = blendedFixedPay;
          }
          if (hourlyMatch) blendedHourlyRate = parseFloat(hourlyMatch[1]);
        } else {
          const payMatch = laborRateRaw.match(/\$(\d+(?:\.\d+)?)/);
          if (payMatch) pay = parseFloat(payMatch[1]);
        }

        let scheduleDate = format(new Date(), 'yyyy-MM-dd');
        let scheduleTime = '09:00 AM';

        if (serviceDateTime.includes('at')) {
          const [d, t] = serviceDateTime.split(' at ');
          try {
            const dateParts = d.split('/');
            if (dateParts.length === 3) {
              const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
              scheduleDate = `${year}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
            }
          } catch (e) {}
          scheduleTime = t.split('(')[0].split('→')[0].split(' to ')[0].trim();
        }

        // Normalize the external number but keep a clean display form
        const externalDisplay = (rawId || '').trim();
        const internalId = normalizeExternalId(rawId) || `imp-${blockIdx}`;

        return {
          rowKey: `${blockIdx}-${internalId}`,
          id: internalId,
          externalWorkOrderId: externalDisplay,
          title,
          description: block,
          location,
          clientName: company,
          pay,
          payType,
          blendedFixedPay,
          blendedIncludedHours,
          blendedHourlyRate,
          scheduleDate,
          scheduleTime,
          status: 'unassigned' as const,
          priority: 'medium' as const,
          projectType: 'Installation',
          requiredSkills: [],
          isAcknowledged: false,
          source: 'Imported',
        } as Omit<ParsedRow, 'rowStatus' | 'match'>;
      }) as (Omit<ParsedRow, 'rowStatus' | 'match'> | null)[]).filter((o): o is Omit<ParsedRow, 'rowStatus' | 'match'> => o !== null);
    };

    const parsed = parsePastedText(pastedText);

    // Track external ids seen within THIS batch so repeated rows in one paste
    // are also flagged as duplicates.
    const seenInBatch = new Map<string, string>();
    const results: ParsedRow[] = parsed.map(row => {
      const ext = normalizeExternalId(row.externalWorkOrderId || row.id);
      const missingCore = !row.title || !row.clientName || !ext;

      const existingMatch = ext ? existingByExternalId.get(ext) : undefined;
      const batchMatch = ext ? seenInBatch.get(ext) : undefined;
      if (ext && !batchMatch) seenInBatch.set(ext, row.rowKey);

      let rowStatus: RowStatus = 'ready';
      let match: ExistingRef | undefined;
      if (existingMatch) {
        rowStatus = 'duplicate_found';
        match = existingMatch;
      } else if (batchMatch) {
        rowStatus = 'duplicate_found';
        match = { externalId: ext, label: (row.externalWorkOrderId || row.id).toUpperCase(), where: 'earlier row in this import' };
      } else if (missingCore) {
        rowStatus = 'needs_review';
      }

      return { ...row, rowStatus, match };
    });

    setTimeout(() => {
      setRows(results);
      setStep('review');
      setIsProcessing(false);
    }, 500);
  };

  const handleUpdateField = (rowKey: string, field: keyof ParsedRow, value: any) => {
    setRows(prev => prev.map(p => p.rowKey === rowKey ? { ...p, [field]: value } : p));
  };

  const setRowStatus = (rowKey: string, rowStatus: RowStatus, extra?: Partial<ParsedRow>) => {
    setRows(prev => prev.map(p => p.rowKey === rowKey ? { ...p, rowStatus, ...extra } : p));
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const skipAllDuplicates = () =>
    setRows(prev => prev.map(p => p.rowStatus === 'duplicate_found' ? { ...p, rowStatus: 'skipped' } : p));
  const clearSkipped = () =>
    setRows(prev => prev.filter(p => p.rowStatus !== 'skipped' && p.rowStatus !== 'removed'));

  const handleFinalizeImport = () => {
    // Commit only clean/approved rows. Duplicates, needs_review, skipped and
    // removed rows never become jobs unless the user explicitly approved them.
    const committable = rows.filter(r => r.rowStatus === 'ready' || r.rowStatus === 'approved_override');
    if (committable.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to import', description: 'No clean or approved rows in this batch.' });
      return;
    }

    const finalOrders: WorkOrder[] = committable.map(r => {
      const { rowKey, rowStatus, match, overrideBy, overrideAt, ...wo } = r;
      // Persist override metadata for audit when a duplicate was pushed through.
      if (rowStatus === 'approved_override') {
        (wo as any).duplicateOverride = { by: overrideBy, at: overrideAt, matchedExternalId: match?.externalId ?? null };
      }
      return wo as WorkOrder;
    });

    onImport(finalOrders);
    const skipped = rows.length - finalOrders.length;
    setIsOpen(false);
    handleReset();
    toast({
      title: 'Integration Complete',
      description: `${finalOrders.length} job${finalOrders.length !== 1 ? 's' : ''} synced.${skipped > 0 ? ` ${skipped} skipped / flagged.` : ''}`,
    });
  };

  const handleReset = () => {
    setPastedText('');
    setStep('input');
    setRows([]);
    setEditingField(null);
    setIsProcessing(false);
    setReviewOnly(false);
  };

  const counts = useMemo(() => ({
    total: rows.length,
    ready: rows.filter(r => r.rowStatus === 'ready').length,
    duplicate: rows.filter(r => r.rowStatus === 'duplicate_found').length,
    review: rows.filter(r => r.rowStatus === 'needs_review').length,
    skipped: rows.filter(r => r.rowStatus === 'skipped').length,
    override: rows.filter(r => r.rowStatus === 'approved_override').length,
  }), [rows]);

  const visibleRows = reviewOnly ? rows.filter(r => r.rowStatus === 'duplicate_found' || r.rowStatus === 'needs_review') : rows;
  const committableCount = counts.ready + counts.override;

  const STATUS_BADGE: Record<RowStatus, { label: string; variant: any }> = {
    ready: { label: 'Ready', variant: 'active' },
    needs_review: { label: 'Needs Review', variant: 'onhold' },
    duplicate_found: { label: 'Duplicate', variant: 'missed' },
    skipped: { label: 'Skipped', variant: 'outline' },
    removed: { label: 'Removed', variant: 'outline' },
    approved_override: { label: 'Override — Will Import', variant: 'scheduled' },
    imported: { label: 'Imported', variant: 'completed' },
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleReset(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[860px] bg-bg-elevated border-border-default max-h-[90vh] flex flex-col p-0 shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <ImportIcon className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">
              {step === 'input' ? 'Job Integration Terminal' : 'Import Audit'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs uppercase font-bold text-text-muted">
            {step === 'input'
              ? 'Paste unstructured job blocks to convert them into field-ready missions.'
              : `Reviewing ${rows.length} parsed records. Skip, remove, or approve before import. Double-click a field to edit.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
          {step === 'input' ? (
            <div className="space-y-4 h-full min-h-0 flex flex-col">
              <div className="space-y-2 flex-1 min-h-0">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Data Input Buffer</label>
                <Textarea
                  placeholder="Paste job details here...&#10;19204205&#10;HP Printer Repair...&#10;4/8/2026 at 3:10 PM..."
                  className="h-full min-h-[350px] bg-bg-primary border-border-sub font-mono text-xs leading-relaxed"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>
              <div className="p-3 rounded bg-bg-secondary/50 border border-border-sub">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
                  Parser extracts external work order #, title, time, location, and client. The next screen flags duplicates (checked against active, completed, and archived jobs) and lets you skip or remove rows before import.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 h-full min-h-0 flex flex-col">
              {/* Summary + bulk actions */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap text-[9px] font-bold uppercase tracking-widest">
                  <span className="text-text-green">{counts.ready} ready</span>
                  {counts.duplicate > 0 && <span className="text-brand-red">· {counts.duplicate} duplicate</span>}
                  {counts.review > 0 && <span className="text-accent-gold">· {counts.review} review</span>}
                  {counts.skipped > 0 && <span className="text-text-muted">· {counts.skipped} skipped</span>}
                  {counts.override > 0 && <span className="text-blue-400">· {counts.override} override</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setReviewOnly(v => !v)}>
                    <Eye size={11} className="mr-1" />{reviewOnly ? 'Show All' : 'Review Only'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={skipAllDuplicates} disabled={counts.duplicate === 0}>
                    Skip Duplicates
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={clearSkipped} disabled={counts.skipped === 0}>
                    Clear Skipped
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 min-h-0 border border-border-sub rounded-md bg-bg-primary">
                <div className="divide-y divide-border-sub">
                  {visibleRows.map((job) => {
                    const dimmed = job.rowStatus === 'skipped' || job.rowStatus === 'removed';
                    const isDup = job.rowStatus === 'duplicate_found';
                    return (
                      <div key={job.rowKey} className={cn('p-4 group', dimmed ? 'bg-bg-tertiary/30 opacity-50' : 'bg-transparent')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2.5 flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div onDoubleClick={() => setEditingField({ id: job.rowKey, field: 'externalWorkOrderId' })}>
                                {editingField?.id === job.rowKey && editingField.field === 'externalWorkOrderId' ? (
                                  <Input
                                    autoFocus
                                    value={job.externalWorkOrderId}
                                    onChange={e => handleUpdateField(job.rowKey, 'externalWorkOrderId', e.target.value)}
                                    onBlur={() => setEditingField(null)}
                                    onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                    className="h-6 w-32 font-mono text-[10px] font-bold uppercase bg-bg-secondary"
                                  />
                                ) : (
                                  <span className="font-mono text-[10px] font-bold text-brand-red uppercase flex items-center gap-2 group-hover:text-text-primary transition-colors cursor-pointer">
                                    WO# {job.externalWorkOrderId || job.id}
                                    <Pencil size={8} className="opacity-0 group-hover:opacity-100" />
                                  </span>
                                )}
                              </div>
                              <Badge variant={STATUS_BADGE[job.rowStatus].variant} className="text-[8px] uppercase tracking-widest h-4">
                                {STATUS_BADGE[job.rowStatus].label}
                              </Badge>
                            </div>

                            {/* Duplicate warning detail */}
                            {isDup && job.match && (
                              <div className="p-2 rounded bg-brand-red-dim/10 border border-brand-red/30 text-left">
                                <p className="text-[10px] font-bold text-brand-red uppercase tracking-wide flex items-center gap-1.5">
                                  <AlertTriangle size={11} /> This work order number already exists.
                                </p>
                                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">
                                  Matched {job.match.label} in {job.match.where}
                                  {job.match.status ? ` · status: ${job.match.status}` : ''}
                                  {job.match.techName ? ` · ${job.match.techName}` : ''}
                                  {job.match.scheduleDate ? ` · ${job.match.scheduleDate}` : ''}
                                </p>
                              </div>
                            )}

                            <div onDoubleClick={() => setEditingField({ id: job.rowKey, field: 'title' })}>
                              {editingField?.id === job.rowKey && editingField.field === 'title' ? (
                                <Input
                                  autoFocus
                                  value={job.title}
                                  onChange={e => handleUpdateField(job.rowKey, 'title', e.target.value)}
                                  onBlur={() => setEditingField(null)}
                                  onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                  className="h-7 text-xs font-bold uppercase bg-bg-secondary"
                                />
                              ) : (
                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide flex items-center gap-2 group-hover:text-brand-red transition-colors cursor-pointer text-left">
                                  {job.title || <span className="text-accent-gold">Missing title</span>}
                                  <Pencil size={10} className="opacity-0 group-hover:opacity-100 text-text-muted" />
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left"><Building2 size={12} /><span className="truncate">{job.clientName || '—'}</span></div>
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left"><MapPin size={12} className="text-brand-red" /><span className="truncate">{job.location || '—'}</span></div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left"><Calendar size={12} /><span>{job.scheduleDate}</span></div>
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left"><Clock size={12} /><span>{job.scheduleTime}</span></div>
                              <div className="text-right">
                                <span className="text-[10px] font-mono font-bold text-text-green bg-green-dim/5 px-2 py-0.5 rounded border border-green-border/20">
                                  ${job.pay.toFixed(2)} ({PAY_TYPE_LABELS[job.payType as keyof typeof PAY_TYPE_LABELS] || job.payType})
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Row actions */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {job.rowStatus === 'skipped' || job.rowStatus === 'removed' ? (
                              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setRowStatus(job.rowKey, isDup ? 'duplicate_found' : 'ready')}>
                                <RotateCcw size={10} className="mr-1" />Restore
                              </Button>
                            ) : (
                              <>
                                {isDup && (
                                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase border-blue-400/40 text-blue-400 hover:bg-blue-400/5"
                                    onClick={() => setRowStatus(job.rowKey, 'approved_override', { overrideBy: currentUserName, overrideAt: new Date().toISOString() })}>
                                    <ShieldAlert size={10} className="mr-1" />Import Anyway
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setRowStatus(job.rowKey, 'skipped')}>
                                  Skip
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[9px] font-bold uppercase text-text-muted hover:text-brand-red" onClick={() => setRows(prev => prev.filter(p => p.rowKey !== job.rowKey))}>
                                  <X size={11} className="mr-1" />Remove
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <div className="p-12 text-center text-[10px] text-text-muted uppercase font-bold tracking-widest">No rows in this view.</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
          {step === 'input' ? (
            <>
              <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
              <Button onClick={handleAnalyze} disabled={isProcessing || !pastedText.trim()} className="h-10 px-10">
                {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ChevronRight size={16} className="mr-2" />}
                Analyze Buffer
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('input')} className="h-10 px-8 mr-auto uppercase font-bold text-[10px] tracking-widest">
                <ArrowLeft size={16} className="mr-2" />
                Modify Buffer
              </Button>
              <Button onClick={handleFinalizeImport} disabled={committableCount === 0} className="h-10 px-12 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
                <CircleCheck size={16} className="mr-2" />
                Import Clean Rows ({committableCount})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
