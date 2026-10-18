'use client';

import { EmptyState } from '@/components/empty-state';
import type { WeeklyLog, WorkOrder } from '@/lib/types';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
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
    jobsById?: Map<string, WorkOrder>;
    onSelect: (log: WeeklyLog) => void;
};

export function LogSelectionDialog({ isOpen, setIsOpen, logs, jobsById, onSelect }: LogSelectionDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <ClipboardList className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-semibold text-text-primary">Logs to submit</DialogTitle>
                    </div>
                    <DialogDescription className="text-[12px]">Pick a weekly log to review and submit.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 px-6 py-4">
                    <ScrollArea className="h-[300px] pr-2">
                        <div className="space-y-2">
                            {logs.length > 0 ? logs.map(log => (
                                <button
                                    key={log.id}
                                    onClick={() => onSelect(log)}
                                    className="w-full flex items-center justify-between p-4 rounded-xl bg-bg-primary border border-border-main hover:border-accent-gold transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-muted group-hover:text-accent-gold group-hover:border-accent-gold/50 transition-colors">
                                            <Clock size={16} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[13px] font-semibold text-text-primary">Week of {log.weekOf}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[12px] text-text-muted">{(log.items || []).length} {(log.items || []).length === 1 ? 'job' : 'jobs'}</p>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <p className="text-[12px] text-text-green font-mono font-semibold">${computeWeeklyLogSettlement(log, jobsById).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                </button>
                            )) : (
                                <EmptyState compact icon={ClipboardList} title="No logs to submit" description="You're all caught up." />
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-6 bg-bg-secondary/30 border-t border-border-default">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full h-10">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
