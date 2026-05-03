
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
import { FileText, Import, Loader2 } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';

type ImportJobsDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onImport: (newOrders: WorkOrder[]) => void;
};

export function ImportJobsDialog({ isOpen, setIsOpen, onImport }: ImportJobsDialogProps) {
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleImport = () => {
    if (!pastedText.trim()) return;

    setIsProcessing(true);
    
    // Parser logic based on user block format
    const parsePastedText = (text: string): WorkOrder[] => {
      // Split by double newline to get individual job blocks
      const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
      
      return blocks.map(block => {
        const lines = block.split('\n').map(l => l.trim());
        if (lines.length < 5) return null;

        const id = lines[0];
        const title = lines[1];
        const timeRaw = lines[2]; 
        const location = lines[3];
        const company = lines[4];
        
        // Extract pay from lines (look for $ with numbers)
        let pay = 0;
        const payLine = lines.find(l => l.includes('$') && /\d/.test(l));
        if (payLine) {
          if (payLine.toLowerCase().includes('@')) {
            // Hourly format: "2 hrs @ $60/hr"
            const match = payLine.match(/(\d+)\s*hrs?\s*@\s*\$(\d+)/i);
            if (match) {
              pay = parseFloat(match[1]) * parseFloat(match[2]);
            }
          } else {
            // Fixed format: "$80" or "$ 930"
            const match = payLine.match(/\$\s*(\d+)/);
            if (match) {
              pay = parseFloat(match[1]);
            }
          }
        }

        // Parse date/time
        let scheduleDate = format(new Date(), 'yyyy-MM-dd');
        let scheduleTime = 'TBD';
        
        if (timeRaw.includes('at')) {
           const [d, t] = timeRaw.split(' at ');
           try {
             scheduleDate = format(new Date(d), 'yyyy-MM-dd');
           } catch(e) {}
           scheduleTime = t;
        } else if (timeRaw.includes(',')) {
           const [d, t] = timeRaw.split(', ');
           try {
             scheduleDate = format(new Date(d), 'yyyy-MM-dd');
           } catch(e) {}
           scheduleTime = t.split(' → ')[0];
        }

        return {
          id: id.toLowerCase(),
          description: title,
          location,
          clientName: company,
          pay: pay || 0,
          scheduleDate,
          scheduleTime,
          status: 'unassigned' as const,
          priority: 'medium' as const,
          projectType: 'General Service',
          requiredSkills: [],
          isAcknowledged: false,
        };
      }).filter((order): order is WorkOrder => order !== null);
    };

    const newOrders = parsePastedText(pastedText);

    setTimeout(() => {
      onImport(newOrders);
      setIsProcessing(false);
      setIsOpen(false);
      setPastedText('');
      toast({
        title: "Import Successful",
        description: `${newOrders.length} service engagements integrated into registry.`,
      });
    }, 800);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Import className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Job Integration Terminal</DialogTitle>
          </div>
          <DialogDescription>Paste unstructured job blocks to convert them into tactical engagements.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Data Input Buffer</label>
            <Textarea 
              placeholder="Paste job details here...&#10;18937200&#10;Troubleshoot monitor...&#10;4/8/2026 at 3:10 PM..."
              className="h-[350px] bg-bg-primary border-border-sub font-mono text-xs leading-relaxed"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>
          <div className="p-3 rounded bg-bg-secondary/50 border border-border-sub">
            <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
              Parser Logic: Systems will automatically extract ID, Description, Time, Location, Client, and Calculate Pay based on blocks separated by line breaks.
            </p>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8">Abort</Button>
          <Button onClick={handleImport} disabled={isProcessing || !pastedText.trim()} className="h-10 px-10">
            {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <FileText size={16} className="mr-2" />}
            Initiate Integration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
