import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { TimeOffRequest, Technician } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Calendar } from 'lucide-react';
import { statusCls } from '../lib/helpers';

export function PersonnelTab({ requests, technicians, viewMode = 'grid' }: {
  requests: TimeOffRequest[]; technicians: Technician[]; viewMode?: 'grid' | 'list';
}) {
  const { toast } = useToast();
  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  const approve = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'approved' });
    toast({ title: 'Time Off Approved' });
  };
  const deny = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'denied' });
    toast({ title: 'Request Denied', variant: 'destructive' } as any);
  };

  const card = (req: TimeOffRequest, showActions: boolean) => {
    const tech = technicians.find(t => t.id === req.techId);
    const initials = tech?.name?.split(' ').map(n => n[0]).join('') || '??';
    return (
      <div key={req.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarImage src={(tech as any)?.avatarUrl} />
            <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-text-primary">{tech?.name || req.techId}</p>
            <p className="text-[10px] text-text-muted">{req.type} · {req.startDate} – {req.endDate}</p>
          </div>
          <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0', statusCls(req.status))}>
            {req.status}
          </span>
        </div>
        {req.reason && (
          <p className="text-[11px] text-text-secondary italic border-l-2 border-border-sub pl-3">&ldquo;{req.reason}&rdquo;</p>
        )}
        {showActions && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white" onClick={() => approve(req.id)}>
              <CheckCircle2 size={12} className="mr-1.5" />Approve
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5" onClick={() => deny(req.id)}>
              <XCircle size={12} className="mr-1.5" />Deny
            </Button>
          </div>
        )}
      </div>
    );
  };

  const listRow = (req: TimeOffRequest, showActions: boolean) => {
    const tech = technicians.find(t => t.id === req.techId);
    const initials = tech?.name?.split(' ').map(n => n[0]).join('') || '??';
    return (
      <div key={req.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarImage src={(tech as any)?.avatarUrl} />
          <AvatarFallback className="text-[9px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-bold text-text-primary">{tech?.name || req.techId}</span>
          <span className="text-[10px] text-text-muted ml-2">{req.type} · {req.startDate} – {req.endDate}</span>
        </div>
        {req.reason && <p className="hidden md:block text-[10px] text-text-muted truncate max-w-[200px] italic">{req.reason}</p>}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase', statusCls(req.status))}>{req.status}</span>
          {showActions && (
            <>
              <Button size="sm" className="h-6 px-2 text-[9px] font-bold bg-text-green hover:bg-text-green/90 text-white" onClick={() => approve(req.id)}><CheckCircle2 size={10} className="mr-1" />Approve</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] font-bold border-brand-red/30 text-brand-red hover:bg-brand-red/5" onClick={() => deny(req.id)}><XCircle size={10} className="mr-1" />Deny</Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (items: TimeOffRequest[], label: string, showActions: boolean) => (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">{label} ({items.length})</p>
      {viewMode === 'list'
        ? <div className="space-y-1">{items.map(r => listRow(r, showActions))}</div>
        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{items.map(r => card(r, showActions))}</div>
      }
    </div>
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && renderGroup(pending, 'Pending', true)}
      {resolved.length > 0 && renderGroup(resolved, 'Resolved', false)}
      {requests.length === 0 && (
        <div className="py-16 text-center text-text-muted">
          <Calendar size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No time-off requests</p>
        </div>
      )}
    </div>
  );
}
