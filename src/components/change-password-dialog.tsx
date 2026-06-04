'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Key, Loader2, ShieldCheck, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function ChangePasswordDialog({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'New passwords do not match.' });
      return;
    }

    setIsLoading(true);
    const user = auth.currentUser;

    if (!user || !user.email) {
      toast({ variant: 'destructive', title: 'Auth Error', description: 'No active session found.' });
      setIsLoading(false);
      return;
    }

    try {
      // Re-authenticate user first (required for security-sensitive operations)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      toast({ title: 'Success', description: 'Your access key has been updated.' });
      setIsOpen(false);
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password update error:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Update Failed', 
        description: error.code === 'auth/wrong-password' 
          ? 'Current password provided is incorrect.' 
          : error.message || 'Unable to update credentials.' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Key className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Change Access Key</DialogTitle>
          </div>
          <DialogDescription className="text-xs">Update your credentials. You will be required to re-authenticate with your current password.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdate} className="space-y-4 py-4">
          <div className="space-y-2 text-left">
            <Label className="text-[10px] uppercase font-bold text-text-muted">Current Password</Label>
            <Input 
              type="password" 
              required 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-bg-primary h-10 text-xs" 
            />
          </div>
          
          <Separator className="bg-border-sub" />

          <div className="space-y-2 text-left">
            <Label className="text-[10px] uppercase font-bold text-text-muted">New Password</Label>
            <Input 
              type="password" 
              required 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-bg-primary h-10 text-xs" 
            />
          </div>
          <div className="space-y-2 text-left">
            <Label className="text-[10px] uppercase font-bold text-text-muted">Confirm New Password</Label>
            <Input 
              type="password" 
              required 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-bg-primary h-10 text-xs" 
            />
          </div>

          <div className="p-3 rounded bg-bg-secondary border border-border-sub flex items-start gap-2">
            <ShieldCheck size={14} className="text-text-green shrink-0 mt-0.5" />
            <p className="text-[9px] text-text-muted uppercase font-bold leading-tight text-left">
              Security Protocol: Password updates require a valid handshake with the primary authentication server.
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isLoading} className="w-full h-11 bg-brand-red hover:bg-brand-red-hover text-white">
              {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
              Commit Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
