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
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Import as ImportIcon, Loader2, AlertTriangle, CircleCheck, ChevronRight, ArrowLeft } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
  const { toast } = useToast();

  const handleAnalyze = () => {
    if (!pastedText.trim()) return;
    setIsProcessing(true);

    // Parser logic
    const parsePastedText = (text: string): WorkOrder[] => {
      const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
      
      return blocks.map(block => {
        const lines = block.split('\n').map(l => l.trim());
        if (lines.length < 5) return null;

        const id = lines[0];
        const title = lines[1];
        const timeRaw = lines[2]; 
        const location = lines[3];
        const company = lines[4];
        
        let pay = 0;
        let payType: 'fixed' | 'hourly' | 'blended' = 'fixed';

        const payLine = lines.find(l => l.includes('$') && /\d/.test(l));
        if (payLine) {
          const match = payLine.match(/\$\s*(\d+(?:\.\d+)?)/);
          if (match) pay = parseFloat(match[1]);
          if (payLine.toLowerCase().includes('hr')) payType = 'hourly';
        }

        let scheduleDate = format(new Date(), 'MM-dd-yyyy');
        let scheduleTime = 'TBD';
        
        if (timeRaw.includes('at')) {
           const [d, t] = timeRaw.split(' at ');
           try { scheduleDate = format(new Date(d), 'MM-dd-yyyy'); } catch(e) {}
           scheduleTime = t;
        } else if (timeRaw.includes(',')) {
           const [d, t] = timeRaw.split(', ');
           try { scheduleDate = format(new Date(d), 'MM-dd-yyyy'); } catch(e) {}
           scheduleTime = t.split(' → ')[0];
        }

        return {
          id: id.toLowerCase(),
          description: title,
          location,
          clientName: company,
          pay: pay || 0,
          payType,
          scheduleDate,
          scheduleTime,
          status: 'unassigned' as const,
          priority: 'medium' as const,
          projectType: 'Low Voltage Service',
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
    setIsProcessing(false);
  };

  const duplicateCount = parsedResults.filter(r => r.isDuplicate).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <ImportIcon className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">
                {step === 'input' ? 'Job Integration Terminal' : 'Integration Audit'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {step === 'input' 
                ? 'Paste unstructured job blocks to convert them into low voltage field jobs.' 
                : `Reviewing ${parsedResults.length} parsed jobs for registry integrity.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 py-4">
          {step === 'input' ? (
            <div className="space-y-4 h-full flex flex-col">
              <div className="space-y-2 flex-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Data Input Buffer</label>
                <Textarea 
                  placeholder="Paste job details here...&#10;18937200&#10;Troubleshoot network cabling...&#10;4/8/2026 at 3:10 PM..."
                  className="h-full min-h-[350px] bg-bg-primary border-border-sub font-mono text-xs leading-relaxed"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>
              <div className="p-3 rounded bg-bg-secondary/50 border border-border-sub">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
                  Parser Logic: Systems will automatically extract ID, Description, Time, Location, and Client. Duplicates will be flagged in the next step.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 h-full flex flex-col">
                {duplicateCount > 0 && (
                    <div className="p-3 rounded bg-brand-red-dim/10 border border-brand-red/30 flex items-center gap-3">
                        <AlertTriangle className="text-brand-red h-5 w-5 shrink-0" />
                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">
                            {duplicateCount} Duplicates Flagged. These records will be skipped during integration to prevent registry corruption.
                        </p>
                    </div>
                )}
                
                <ScrollArea className="flex-1 border border-border-sub rounded-md bg-bg-primary">
                    <div className="divide-y divide-border-sub">
                        {parsedResults.map((job) => (
                            <div key={job.id} className={cn("p-4 flex items-center justify-between", job.isDuplicate ? "bg-bg-tertiary/30" : "bg-transparent")}>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <span className={cn("font-mono text-xs font-bold uppercase", job.isDuplicate ? "text-text-muted" : "text-brand-red")}>ID: {job.id}</span>
                                        <Badge variant={job.isDuplicate ? "missed" : "active"} className="text-[8px] uppercase tracking-widest">
                                            {job.isDuplicate ? 'Duplicate' : 'New Entry'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{job.description}</p>
                                    <div className="flex items-center gap-4 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                        <span>{job.clientName}</span>
                                        <span>•</span>
                                        <MapPin size={10} className="text-brand-red inline mr-1" />
                                        <span>{job.location}</span>
                                        <span>•</span>
                                        <span className="text-text-green">${job.pay.toFixed(2)} ({job.payType})</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {job.isDuplicate ? (
                                        <AlertTriangle className="h-4 w-4 text-brand-red ml-auto" />
                                    ) : (
                                        <CircleCheck className="h-4 w-4 text-text-green ml-auto" />
                                    )}
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
                <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8">Cancel</Button>
                <Button onClick={handleAnalyze} disabled={isProcessing || !pastedText.trim()} className="h-10 px-10">
                    {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ChevronRight size={16} className="mr-2" />}
                    Analyze Buffer
                </Button>
            </>
          ) : (
            <>
                <Button variant="outline" onClick={() => setStep('input')} className="h-10 px-8 mr-auto">
                    <ArrowLeft size={16} className="mr-2" />
                    Modify Buffer
                </Button>
                <Button onClick={handleFinalizeImport} className="h-10 px-10">
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
