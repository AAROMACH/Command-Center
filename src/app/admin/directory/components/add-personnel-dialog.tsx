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
import { Shield, ShieldAlert, User, Briefcase, Banknote, Hammer, Building2 } from 'lucide-react';

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

type RoleOption = {
    id: AppRole;
    label: string;
    desc: string;
    icon: any;
};

const ADMIN_ROLES: RoleOption[] = [
    { id: 'super_admin', label: 'Super Admin', desc: 'Unrestricted system-wide access.', icon: ShieldAlert },
    { id: 'dispatch_admin', label: 'Dispatch Admin', desc: 'Scheduling and technician assignments.', icon: Briefcase },
    { id: 'payroll_admin', label: 'Payroll Admin', desc: 'Financial audit and pay approval.', icon: Banknote },
    { id: 'project_manager', label: 'Project Manager', desc: 'Strategic project and phase management.', icon: Shield },
];

const FIELD_ROLES: RoleOption[] = [
    { id: 'project_lead', label: 'Project Lead', desc: 'On-site leadership and progress tracking.', icon: Hammer },
    { id: 'field_technician', label: 'Field Technician', desc: 'Service execution and reporting.', icon: User },
];

const CLIENT_ROLES: RoleOption[] = [
    { id: 'client', label: 'Client Contact', desc: 'External stakeholder portal access.', icon: Building2 },
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
    console.log("New Personnel Enrollment:", formData);
    toast({
        title: "Personnel Enrolled",
        description: `${formData.fullName} has been successfully registered.`
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

  const isField = formData.roles.some(r => FIELD_ROLES.map(fr => fr.id).includes(r));
  const isClient = formData.roles.includes('client');

  const RoleSection = ({ title, options }: { title: string, options: RoleOption[] }) => (
    <div className="space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted border-b border-border-sub pb-1">{title}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {options.map(role => {
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
                            <role.icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-bold uppercase tracking-wide ${isSelected ? 'text-white' : 'text-text-primary'}`}>{role.label}</p>
                            <p className="text-[9px] text-text-muted leading-tight mt-1">{role.desc}</p>
                        </div>
                        <Checkbox checked={isSelected} className="mt-0.5" />
                    </div>
                )
            })}
        </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="page-title text-xl">Tactical Personnel Enrollment</DialogTitle>
          <DialogDescription>
            Register new operatives and assign functional roles within the Command Center hierarchy.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-8">
          {/* Identity Section */}
          <section className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red">Identity Credentials</h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Full Legal Name</Label>
                    <Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Secure Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="phone" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Mobile Comms</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="address" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Base Location</Label>
                    <Input id="address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
             </div>
          </section>

          {/* Role Authorization */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red">Permission Sets & Authorization</h3>
            <div className="space-y-6">
                <RoleSection title="Administrative Hierarchy" options={ADMIN_ROLES} />
                <RoleSection title="Field Operational Roles" options={FIELD_ROLES} />
                <RoleSection title="Client Stakeholders" options={CLIENT_ROLES} />
            </div>
          </section>

          {/* Dynamic Sections */}
          {(isClient || isField) && (
            <section className="p-5 rounded-lg border border-border-alert bg-brand-red-dim/5 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red">Role-Specific Intelligence</h3>
                
                {isClient && (
                    <div className="space-y-2">
                        <Label htmlFor="company" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Associated Organization / Client Entity</Label>
                        <Input id="company" placeholder="e.g., Global Corp, Ki9" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} className="bg-bg-primary h-9 text-xs border-border-sub" />
                    </div>
                )}

                {isField && (
                    <div className="space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-sub/20 pb-1">Emergency Contact Protocol</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="emergencyContactName" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Contact Name</Label>
                                <Input id="emergencyContactName" value={formData.emergencyContact.name} onChange={handleEmergencyContactChange} name="name" className="bg-bg-primary h-9 text-xs border-border-sub" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="emergencyContactRelation" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Relation</Label>
                                <Input id="emergencyContactRelation" value={formData.emergencyContact.relation} onChange={handleEmergencyContactChange} name="relation" className="bg-bg-primary h-9 text-xs border-border-sub" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="emergencyContactPhone" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Emergency Line</Label>
                            <Input id="emergencyContactPhone" type="tel" value={formData.emergencyContact.phone} onChange={handleEmergencyContactChange} name="phone" className="bg-bg-primary h-9 text-xs border-border-sub" />
                        </div>
                    </div>
                )}
            </section>
          )}
        </div>
        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="px-8 font-bold text-[10px] uppercase tracking-widest">Abort</Button>
          <Button onClick={handleSave} className="px-10 font-bold text-[10px] uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover">Finalize Enrollment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
