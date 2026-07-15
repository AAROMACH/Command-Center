
'use client';

import { useState } from 'react';
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
import { Import as ImportIcon, Loader2, AlertTriangle, CircleCheck, ChevronRight, ArrowLeft, MapPin, Pencil, Building2, Calendar, Clock } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PAY_TYPE_LABELS } from '@/lib/constants';

type ImportJobsDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onImport: (newOrders: WorkOrder[]) => void;
  existingOrders: WorkOrder[];
};

type ParsedOrder = WorkOrder & { isDuplicate: boolean };

export function ImportJobsDialog({ isOpen, setIsOpen, onImport, existingOrders }: ImportJobsDialogProps) {
  const [pastedText, setPastedText] = useState('');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResults, setParsedResults] = useState<ParsedOrder[]>([]);
  const [editingField, setEditingField] = useState<{ id: string, field: string } | null>(null);
  const { toast } = useToast();

  const handleAnalyze = () => {
    if (!pastedText.trim()) return;
    setIsProcessing(true);

    const parsePastedText = (text: string): WorkOrder[] => {
      const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
      
      return blocks.map((block): WorkOrder | null => {
        const lines = block.split('\n').map(l => l.trim());
        if (lines.length < 5) return null;

        const id = lines[0]; // 8 digit identifier
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
          // Parse: 2 hrs @ $110 and then up to 1 hr @ $55/hr
          const fixedMatch = laborRateRaw.match(/(\d+)\s*hrs?\s*@\s*\$(\d+)/);
          const hourlyMatch = laborRateRaw.match(/@\s*\$(\d+)\/hr/);
          
          if (fixedMatch) {
            blendedIncludedHours = parseInt(fixedMatch[1]);
            blendedFixedPay = parseFloat(fixedMatch[2]);
            pay = blendedFixedPay;
          }
          if (hourlyMatch) {
            blendedHourlyRate = parseFloat(hourlyMatch[1]);
          }
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
                scheduleDate = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
             }
           } catch(e) {}
           scheduleTime = t.split('(')[0].trim();
        }

        return {
          id: id.toLowerCase(),
          title: title,
          description: block,
          location,
          clientName: company,
          pay: pay,
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
        };
      }).filter((order): order is WorkOrder => order !== null);
    };

    const results = parsePastedText(pastedText).map(order => ({
        ...order,
        isDuplicate: existingOrders.some(existing => existing.id.toLowerCase() === order.id.toLowerCase())
    }));

    setTimeout(() => {
        setParsedResults(results);
        setStep('review');
        setIsProcessing(false);
    }, 800);
  };

  const handleUpdateField = (id: string, field: keyof ParsedOrder, value: any) => {
    setParsedResults(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleFinalizeImport = () => {
    const finalOrders = parsedResults.filter(r => !r.isDuplicate);
    onImport(finalOrders);
    setIsOpen(false);
    handleReset();
    toast({
        title: "Integration Complete",
        description: `${finalOrders.length} service jobs synced. ${parsedResults.length - finalOrders.length} duplicates skipped.`,
    });
  };

  const handleReset = () => {
    setPastedText('');
    setStep('input');
    setParsedResults([]);
    setEditingField(null);
    setIsProcessing(false);
  };

  const duplicateCount = parsedResults.filter(r => r.isDuplicate).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default max-h-[90vh] flex flex-col p-0 shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <ImportIcon className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">
                {step === 'input' ? 'Job Integration Terminal' : 'Integration Audit'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs uppercase font-bold text-text-muted">
            {step === 'input' 
                ? 'Paste unstructured job blocks to convert them into field-ready missions.' 
                : `Reviewing ${parsedResults.length} parsed records. Double-click any field to edit.`}
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
                  Parser Logic: Systems will automatically extract ID, Title, Time, Location, and Client. Duplicates will be flagged in the next step.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 h-full min-h-0 flex flex-col">
                {duplicateCount > 0 && (
                    <div className="p-3 rounded bg-brand-red-dim/10 border border-brand-red/30 flex items-center gap-3">
                        <AlertTriangle className="text-brand-red h-5 w-5 shrink-0" />
                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide">
                            {duplicateCount} Duplicates Flagged. These records will be skipped to prevent registry corruption.
                        </p>
                    </div>
                )}
                
                <ScrollArea className="flex-1 min-h-0 border border-border-sub rounded-md bg-bg-primary">
                    <div className="divide-y divide-border-sub">
                        {parsedResults.map((job) => (
                            <div key={job.id} className={cn("p-4 group", job.isDuplicate ? "bg-bg-tertiary/30 opacity-60" : "bg-transparent")}>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-3 flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'id' })}>
                                                {editingField?.id === job.id && editingField.field === 'id' ? (
                                                    <Input 
                                                        autoFocus
                                                        value={job.id}
                                                        onChange={e => handleUpdateField(job.id, 'id', e.target.value)}
                                                        onBlur={() => setEditingField(null)}
                                                        onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                        className="h-6 w-32 font-mono text-[10px] font-bold uppercase bg-bg-secondary"
                                                    />
                                                ) : (
                                                    <span className="font-mono text-[10px] font-bold text-brand-red uppercase flex items-center gap-2 group-hover:text-text-primary transition-colors cursor-pointer">
                                                        ID: {job.id}
                                                        <Pencil size={8} className="opacity-0 group-hover:opacity-100" />
                                                    </span>
                                                )}
                                            </div>
                                            <Badge variant={job.isDuplicate ? "missed" : "active"} className="text-[8px] uppercase tracking-widest h-4">
                                                {job.isDuplicate ? 'Duplicate' : 'New Entry'}
                                            </Badge>
                                        </div>

                                        <div className="space-y-2">
                                            <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'title' })}>
                                                {editingField?.id === job.id && editingField.field === 'title' ? (
                                                    <Input 
                                                        autoFocus
                                                        value={job.title}
                                                        onChange={e => handleUpdateField(job.id, 'title', e.target.value)}
                                                        onBlur={() => setEditingField(null)}
                                                        onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                        className="h-7 text-xs font-bold uppercase bg-bg-secondary"
                                                    />
                                                ) : (
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide flex items-center gap-2 group-hover:text-brand-red transition-colors cursor-pointer text-left">
                                                        {job.title}
                                                        <Pencil size={10} className="opacity-0 group-hover:opacity-100 text-text-muted" />
                                                    </p>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'clientName' })}>
                                                    {editingField?.id === job.id && editingField.field === 'clientName' ? (
                                                        <Input 
                                                            autoFocus
                                                            value={job.clientName}
                                                            onChange={e => handleUpdateField(job.id, 'clientName', e.target.value)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                            className="h-6 text-[9px] uppercase bg-bg-secondary"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest cursor-pointer group-hover:text-text-primary transition-colors text-left">
                                                            <Building2 size={12}/>
                                                            <span>{job.clientName}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'location' })}>
                                                    {editingField?.id === job.id && editingField.field === 'location' ? (
                                                        <Input 
                                                            autoFocus
                                                            value={job.location}
                                                            onChange={e => handleUpdateField(job.id, 'location', e.target.value)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                            className="h-6 text-[9px] uppercase bg-bg-secondary"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest cursor-pointer group-hover:text-text-primary transition-colors text-left">
                                                            <MapPin size={12} className="text-brand-red"/>
                                                            <span className="truncate">{job.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4">
                                                <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'scheduleDate' })}>
                                                    {editingField?.id === job.id && editingField.field === 'scheduleDate' ? (
                                                        <Input 
                                                            autoFocus
                                                            type="date"
                                                            value={job.scheduleDate}
                                                            onChange={e => handleUpdateField(job.id, 'scheduleDate', e.target.value)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                            className="h-6 text-[9px] bg-bg-secondary"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest cursor-pointer group-hover:text-text-primary transition-colors text-left">
                                                            <Calendar size={12}/>
                                                            <span>{job.scheduleDate}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'scheduleTime' })}>
                                                    {editingField?.id === job.id && editingField.field === 'scheduleTime' ? (
                                                        <Input 
                                                            autoFocus
                                                            value={job.scheduleTime}
                                                            onChange={e => handleUpdateField(job.id, 'scheduleTime', e.target.value)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                            className="h-6 text-[9px] bg-bg-secondary"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest cursor-pointer group-hover:text-text-primary transition-colors text-left">
                                                            <Clock size={12}/>
                                                            <span>{job.scheduleTime}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div onDoubleClick={() => !job.isDuplicate && setEditingField({ id: job.id, field: 'pay' })}>
                                                    {editingField?.id === job.id && editingField.field === 'pay' ? (
                                                        <Input 
                                                            type="number"
                                                            autoFocus
                                                            value={job.pay}
                                                            onChange={e => handleUpdateField(job.id, 'pay', parseFloat(e.target.value) || 0)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                                                            className="h-6 w-24 text-[9px] font-mono bg-bg-secondary text-text-green"
                                                        />
                                                    ) : (
                                                        <div className="text-right">
                                                            {job.payType === 'blended' ? (
                                                                <span className="text-[10px] font-mono font-bold text-text-green bg-green-dim/5 px-2 py-0.5 rounded border border-green-border/20 cursor-pointer hover:bg-green-dim/10 transition-colors">
                                                                    ${(job.blendedFixedPay || 0).toFixed(2)} + ${(job.blendedHourlyRate || 0).toFixed(2)}/hr after {job.blendedIncludedHours} hrs
                                                                </span>
                                                            ) : job.payType === 'hourly' ? (
                                                                <span className="text-[10px] font-mono font-bold text-text-green bg-green-dim/5 px-2 py-0.5 rounded border border-green-border/20 cursor-pointer hover:bg-green-dim/10 transition-colors">
                                                                    ${job.pay.toFixed(2)}/hr
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-mono font-bold text-text-green bg-green-dim/5 px-2 py-0.5 rounded border border-green-border/20 cursor-pointer hover:bg-green-dim/10 transition-colors">
                                                                    ${job.pay.toFixed(2)} (fixed)
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {job.isDuplicate ? (
                                            <AlertTriangle className="h-5 w-5 text-brand-red ml-auto opacity-50" />
                                        ) : (
                                            <CircleCheck className="h-5 w-5 text-text-green ml-auto" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
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
                <Button onClick={handleFinalizeImport} className="h-10 px-12 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
                    <CircleCheck size={16} className="mr-2" />
                    Confirm & Integrate ({parsedResults.length - duplicateCount})
                </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
