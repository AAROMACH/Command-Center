'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, FileText } from "lucide-react";
import type { WeeklyLog } from "@/lib/types";

type PendingPayoutDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  pendingAmount: number;
  submittedLogs: WeeklyLog[];
};

export function PendingPayoutDialog({ isOpen, setIsOpen, pendingAmount, submittedLogs }: PendingPayoutDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="text-text-green h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Pending Payout Status</DialogTitle>
          </div>
          <DialogDescription>Breakdown of funds currently in the audit pipeline.</DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-6">
          <div className="text-center p-6 bg-bg-secondary rounded-lg border border-border-subtle shadow-inner">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Total Amount Pending</p>
            <p className="text-4xl font-mono font-bold text-text-green">${pendingAmount.toFixed(2)}</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Awaiting Audit</h3>
            {submittedLogs.length > 0 ? (
              <div className="space-y-2">
                {submittedLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub transition-colors hover:border-text-muted">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-bg-secondary rounded text-text-muted border border-border-sub">
                        <FileText size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Week of {log.weekOf}</p>
                        <p className="text-[10px] text-text-muted">Status: {log.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-xs font-mono font-bold text-text-primary">${(log.totalPayout || 0).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-border-main rounded-md">
                <p className="text-[10px] uppercase font-bold text-text-muted">No logs currently in audit</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border-default pt-4">
          <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>
            Close Terminal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
