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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, User, Briefcase, Banknote, Hammer } from 'lucide-react';

type AddPersonnelDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

type FormData = {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    roles: AppRole[];
    company: string;
    emergencyContact: {
        name: string;
        relation: string;
        phone: string;
    }
};

const defaultState: FormData = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    roles: [],
    company: '',
    emergencyContact: {
        name: '',
        relation: '',
        phone: ''
    }
};

const ROLE_OPTIONS: { id: AppRole; label: string; desc: string; icon: any; category: 'admin' | 'field' | 'client' }[] = [
    { id: 'super_admin', label: 'Super Admin', desc: 'Full unrestricted system access.', icon: ShieldAlert, category: 'admin' },
    { id: 'dispatch_admin', label: 'Dispatch Admin', desc: 'Manage scheduling and assignments.', icon: Briefcase, category: 'admin' },
    { id: 'payroll_admin', label: 'Payroll Admin', desc: 'Manage financial logs and payout approval.', icon: Banknote, category: 'admin' },
    { id: 'project_manager', label: 'Project Manager', desc: 'Manage strategic project infrastructure.', icon: Shield, category: 'admin' },
    { id: 'project_lead', label: 'Project Lead', desc: 'In-field lead for assigned projects.', icon: Hammer, category: 'field' },
    { id: 'field_technician', label: 'Field Technician', desc: 'On-site service and installation specialist.', icon: User, category: 'field' },
    { id: 'client', label: 'Client', desc: 'Client portal access for project tracking.', icon: User, category: 'client' },
];

export function AddPersonnelDialog({ isOpen, setIsOpen }: AddPersonnelDialogProps) {
  const [formData, setFormData] = useState<FormData>(defaultState);
  const { toast } = useToast();

  const handleSave = () => {
    if (!formData.fullName || !formData.email || formData.roles.length === 0) {
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please provide name, email, and at least one role."
        });
        return;
    }
    console.log("New Personnel Data:", formData);
    toast({
        title: "Personnel Added",
        description: `${formData.fullName} has been added to the directory.`
    });
    setIsOpen(false);
    setFormData(defaultState);
  };
  
  const toggleRole = (role: AppRole) => {
    setFormData(prev => ({
        ...prev,
        roles: prev.roles.includes(role) 
            ? prev.roles.filter(r => r !== role) 
            : [...prev.roles, role]
    }));
  };

  const handleEmergencyContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev,
        emergencyContact: {
            ...prev.emergencyContact,
            [name]: value,
        }
    }));
  };

  const hasFieldRole = formData.roles.some(r => ['project_lead', 'field_technician'].includes(r));
  const hasClientRole = formData.roles.includes('client');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="page-title text-xl">Tactical Enrollment</DialogTitle>
          <DialogDescription>
            Register new personnel into the command registry and assign mission-critical roles.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <section className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Personal Identifiers</h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                </div>
             </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Operational Roles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ROLE_OPTIONS.map(role => {
                    const isSelected = formData.roles.includes(role.id);
                    return (
                        <div 
                            key={role.id} 
                            onClick={() => toggleRole(role.id)}
                            className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 ${
                                isSelected ? 'bg-brand-red-dim border-brand-red' : 'bg-bg-primary border-border-sub hover:border-text-muted'
                            }`}
                        >
                            <div className={`p-2 rounded ${isSelected ? 'bg-brand-red text-white' : 'bg-bg-tertiary text-text-muted'}`}>
                                <role.icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold uppercase tracking-wide ${isSelected ? 'text-white' : 'text-text-primary'}`}>{role.label}</p>
                                <p className="text-[10px] text-text-muted leading-tight mt-1">{role.desc}</p>
                            </div>
                            <Checkbox checked={isSelected} className="mt-1" />
                        </div>
                    )
                })}
            </div>
          </section>

          {hasClientRole && (
            <section className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label htmlFor="company">Company / Organization</Label>
              <Input id="company" placeholder="e.g., Global Corp, Acme Inc." value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} />
            </section>
          )}

          {hasFieldRole && (
            <section className="p-4 rounded-md border border-border-sub bg-bg-primary space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Emergency Contact Protocol</h3>
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-2">
                        <Label htmlFor="emergencyContactName" className="text-xs">Full Name</Label>
                        <Input id="emergencyContactName" value={formData.emergencyContact.name} onChange={handleEmergencyContactChange} name="name" className="bg-bg-secondary h-9 text-xs" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="emergencyContactRelation" className="text-xs">Relation</Label>
                        <Input id="emergencyContactRelation" value={formData.emergencyContact.relation} onChange={handleEmergencyContactChange} name="relation" className="bg-bg-secondary h-9 text-xs" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="emergencyContactPhone" className="text-xs">Phone Number</Label>
                    <Input id="emergencyContactPhone" type="tel" value={formData.emergencyContact.phone} onChange={handleEmergencyContactChange} name="phone" className="bg-bg-secondary h-9 text-xs" />
                </div>
            </section>
          )}
        </div>
        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="px-8">Abort</Button>
          <Button onClick={handleSave} className="px-10">Enroll Personnel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
