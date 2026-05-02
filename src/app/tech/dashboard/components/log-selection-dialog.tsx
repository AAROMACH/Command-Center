'use client';

import type { WeeklyLog } from '@/lib/types';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ClipboardList,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

type LogSelectionDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    logs: WeeklyLog[];
    onSelect: (log: WeeklyLog) => void;
};

export function LogSelectionDialog({ isOpen, setIsOpen, logs, onSelect }: LogSelectionDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <ClipboardList className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Unfinalized Logs</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Select a pending weekly log to review and submit for audit.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 px-6 py-4">
                    <ScrollArea className="h-[300px] pr-2">
                        <div className="space-y-2">
                            {logs.length > 0 ? logs.map(log => (
                                <button
                                    key={log.id}
                                    onClick={() => onSelect(log)}
                                    className="w-full flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub hover:border-accent-gold transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-muted group-hover:text-accent-gold group-hover:border-accent-gold/50 transition-colors">
                                            <Clock size={16} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Week of {log.weekOf}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest">{log.items.length} Assignments</p>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <p className="text-[9px] text-text-green font-mono font-bold">${(log.totalPayout || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                </button>
                            )) : (
                                <div className="text-center py-16 border border-dashed border-border-main rounded-lg">
                                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-[0.2em]">No logs awaiting finalization</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-6 bg-bg-secondary/30 border-t border-border-default">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full uppercase font-bold text-[10px] tracking-widest">
                        Close Terminal
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
