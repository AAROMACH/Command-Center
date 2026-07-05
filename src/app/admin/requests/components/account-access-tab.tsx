import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Technician, AppRole } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { ALL_ROLES, fmtDate } from '../lib/helpers';

export function AccountAccessTab({ pendingUsers }: { pendingUsers: Technician[] }) {
  const { toast } = useToast();
  const [approveTarget, setApproveTarget] = useState<Technician | null>(null);
  const [denyTarget, setDenyTarget] = useState<Technician | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [primaryRole, setPrimaryRole] = useState<AppRole | ''>('');
  const [denyReason, setDenyReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);

  const toggleRole = (role: AppRole) =>
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const handleApprove = async () => {
    if (!approveTarget || selectedRoles.length === 0 || !primaryRole) return;
    setApproving(true);
    try {
      const adminUid = auth.currentUser?.uid || '';
      await updateDoc(doc(db, 'users', approveTarget.id), {
        roles: selectedRoles, role: primaryRole, primaryRole,
        approvalStatus: 'approved', status: 'active',
        approvedAt: new Date().toISOString(), approvedBy: adminUid, updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Granted', description: `${approveTarget.name} approved as ${primaryRole}.` });
      setApproveTarget(null); setSelectedRoles([]); setPrimaryRole('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setApproving(false); }
  };

  const handleDeny = async () => {
    if (!denyTarget) return;
    setDenying(true);
    try {
      await updateDoc(doc(db, 'users', denyTarget.id), {
        approvalStatus: 'denied', status: 'inactive',
        deniedAt: new Date().toISOString(), deniedBy: auth.currentUser?.uid || '',
        denialReason: denyReason.trim(), updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Denied' });
      setDenyTarget(null); setDenyReason('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setDenying(false); }
  };

  return (
    <>
      {pendingUsers.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <ShieldCheck size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No pending account requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendingUsers.map(user => {
            const initials = user.name?.split(' ').map(n => n[0]).join('') || '??';
            return (
              <div key={user.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={(user as any).photoURL || (user as any).avatarUrl} />
                    <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-text-primary truncate">{user.name || 'Unknown'}</p>
                    <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0 bg-amber-400/10 text-amber-400 border-amber-400/30">Pending</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-[9px] font-bold">
                    {(user as any).createdVia === 'google_sso' ? 'Google SSO' : 'Email'}
                  </span>
                  {(user as any).requestedAt && <span>Requested {fmtDate((user as any).requestedAt)}</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
                    onClick={() => { setApproveTarget(user); setSelectedRoles([]); setPrimaryRole(''); }}>
                    <UserCheck size={12} className="mr-1.5" />Approve User
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => { setDenyTarget(user); setDenyReason(''); }}>
                    <XCircle size={12} className="mr-1.5" />Deny
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!approveTarget} onOpenChange={v => !v && setApproveTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">Assign Role — {approveTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Roles</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox id={`role-${role}`} checked={selectedRoles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    <Label htmlFor={`role-${role}`} className="text-[10px] font-bold uppercase cursor-pointer">{role.replace(/_/g, ' ')}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Primary Role</p>
              <Select value={primaryRole} onValueChange={v => setPrimaryRole(v as AppRole)} disabled={selectedRoles.length === 0}>
                <SelectTrigger className="h-8 text-[11px] bg-bg-tertiary border-border-main"><SelectValue placeholder="Select primary role" /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {selectedRoles.map(r => <SelectItem key={r} value={r} className="text-[10px] font-bold uppercase">{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setApproveTarget(null)} disabled={approving}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-text-green hover:bg-text-green/90 text-white"
              onClick={handleApprove} disabled={approving || selectedRoles.length === 0 || !primaryRole}>
              {approving && <Loader2 size={11} className="animate-spin mr-1.5" />}{approving ? 'Granting...' : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!denyTarget} onOpenChange={v => !v && setDenyTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">Deny Access — {denyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Reason (optional)</Label>
            <textarea rows={3} value={denyReason} onChange={e => setDenyReason(e.target.value)}
              placeholder="Explain why access is being denied..."
              className="mt-1.5 w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setDenyTarget(null)} disabled={denying}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={handleDeny} disabled={denying}>
              {denying && <Loader2 size={11} className="animate-spin mr-1.5" />}{denying ? 'Denying...' : 'Deny Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
