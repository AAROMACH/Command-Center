
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

type AddPersonnelDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

const defaultState = {
    fullName: '',
    email: '',
    phone: '',
    role: '',
    company: '',
    permissions: {
        dispatch: false,
        billing: false,
        admin: false,
    }
};

export function AddPersonnelDialog({ isOpen, setIsOpen }: AddPersonnelDialogProps) {
  const [formData, setFormData] = useState(defaultState);
  const { toast } = useToast();

  const handleSave = () => {
    console.log("New Personnel Data:", formData);
    toast({
        title: "Personnel Added",
        description: `${formData.fullName} has been added to the directory.`
    })
    setIsOpen(false);
    setFormData(defaultState);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[525px] bg-bg-elevated border-border-default">
        <DialogHeader>
          <DialogTitle className="page-title text-xl">Add New Personnel</DialogTitle>
          <DialogDescription>
            Add a new technician, staff member, or client contact to the system.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})}>
                <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="staff">Internal Staff</SelectItem>
                    <SelectItem value="client">Client Contact</SelectItem>
                </SelectContent>
            </Select>
          </div>
          {formData.role === 'staff' && (
            <div className="p-4 rounded-md border border-border-subtle bg-bg-primary">
                <Label className="font-bold">Staff Permissions</Label>
                <p className="text-xs text-text-muted mb-3">Assign access levels for this staff member.</p>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Checkbox id="perm-dispatch" onCheckedChange={(checked) => setFormData({...formData, permissions: {...formData.permissions, dispatch: !!checked}})} />
                        <Label htmlFor="perm-dispatch" className="text-sm font-normal">Can access dispatch and assign jobs.</Label>
                    </div>
                     <div className="flex items-center gap-2">
                        <Checkbox id="perm-billing" onCheckedChange={(checked) => setFormData({...formData, permissions: {...formData.permissions, billing: !!checked}})} />
                        <Label htmlFor="perm-billing" className="text-sm font-normal">Can access financial hub and billing.</Label>
                    </div>
                     <div className="flex items-center gap-2">
                        <Checkbox id="perm-admin" onCheckedChange={(checked) => setFormData({...formData, permissions: {...formData.permissions, admin: !!checked}})} />
                        <Label htmlFor="perm-admin" className="text-sm font-normal">Full system administrator access.</Label>
                    </div>
                </div>
            </div>
          )}
          {formData.role === 'client' && (
            <div className="space-y-2">
              <Label htmlFor="company">Company Name</Label>
              <Input id="company" placeholder="e.g., Global Corp, Acme Inc." value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Add Personnel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
