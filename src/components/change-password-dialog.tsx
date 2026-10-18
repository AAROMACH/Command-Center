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
      toast({ variant: 'destructive', title: 'Passwords don’t match', description: 'Enter the same new password in both boxes.' });
      return;
    }

    setIsLoading(true);
    const user = auth.currentUser;

    if (!user || !user.email) {
      toast({ variant: 'destructive', title: 'You’re signed out', description: 'Sign in again, then change your password.' });
      setIsLoading(false);
      return;
    }

    try {
      // Re-authenticate user first (required for security-sensitive operations)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      toast({ title: 'Password updated', description: 'Use your new password next time you sign in.' });
      setIsOpen(false);
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password update error:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Could not update password', 
        description: error.code === 'auth/wrong-password' 
          ? 'Your current password is incorrect.' 
          : error.message || 'Please try again.' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Key className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-semibold text-text-primary">Change password</DialogTitle>
          </div>
          <DialogDescription className="text-[13px]">Enter your current password to confirm it’s you, then choose a new one.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdate} className="space-y-4 py-4">
          <div className="space-y-2 text-left">
            <Label className="text-[12px] font-medium text-text-secondary">Current password</Label>
            <Input 
              type="password" 
              required 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-bg-primary" 
            />
          </div>
          
          <Separator className="bg-border-sub" />

          <div className="space-y-2 text-left">
            <Label className="text-[12px] font-medium text-text-secondary">New password</Label>
            <Input 
              type="password" 
              required 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-bg-primary" 
            />
          </div>
          <div className="space-y-2 text-left">
            <Label className="text-[12px] font-medium text-text-secondary">Confirm new password</Label>
            <Input 
              type="password" 
              required 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-bg-primary" 
            />
          </div>

          <div className="p-3 rounded-md bg-bg-secondary border border-border-sub flex items-start gap-2">
            <ShieldCheck size={14} className="text-text-green shrink-0 mt-0.5" />
            <p className="text-[12px] text-text-muted leading-snug text-left">
              Your new password takes effect right away.
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isLoading} className="w-full h-10">
              {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
