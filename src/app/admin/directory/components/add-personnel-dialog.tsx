'use client';

import { useState, useMemo } from 'react';
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
import { 
  Shield, 
  ShieldAlert, 
  User, 
  Briefcase, 
  Banknote, 
  Hammer, 
  Building2, 
  ChevronRight, 
  Lock, 
  Info,
  CheckCircle2,
  Users
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';

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
    permissions: string[];
};

const ROLE_DATA: Record<'admin' | 'tech' | 'client', RoleOption[]> = {
    admin: [
        { 
            id: 'super_admin', 
            label: 'Super Admin', 
            desc: 'Full system authorization.', 
            icon: ShieldAlert,
            permissions: ['Full System Access', 'User Management', 'Financial Override', 'Global Operations']
        },
        { 
            id: 'dispatch_admin', 
            label: 'Dispatch Admin', 
            desc: 'Logistics and scheduling lead.', 
            icon: Briefcase,
            permissions: ['Manage Assignments', 'Technician Dispatch', 'View All Projects', 'Schedule Control']
        },
        { 
            id: 'payroll_admin', 
            label: 'Payroll Admin', 
            desc: 'Financial audit specialist.', 
            icon: Banknote,
            permissions: ['Approve Weekly Logs', 'Manage Reimbursements', 'Payout Authorization']
        },
        { 
            id: 'project_manager', 
            label: 'Project Manager', 
            desc: 'Strategic deployment oversight.', 
            icon: Shield,
            permissions: ['Create Projects', 'Phase Management', 'Task Definition', 'Resource Planning']
        },
    ],
    tech: [
        { 
            id: 'project_lead', 
            label: 'Project Lead', 
            desc: 'On-site mission commander.', 
            icon: Hammer,
            permissions: ['Update Project Progress', 'Field Documentation', 'Task Management', 'Site Reporting']
        },
        { 
            id: 'field_technician', 
            label: 'Field Tech', 
            desc: 'Service execution specialist.', 
            icon: User,
            permissions: ['Check In / Check Out', 'Submit Logs', 'Upload Receipts', 'Acknowledge Work']
        },
    ],
    client: [
        { 
            id: 'client', 
            label: 'Client Contact', 
            desc: 'External project stakeholder.', 
            icon: Building2,
            permissions: ['View Project Status', 'Submit Service Requests', 'View Work History']
        },
    ]
};

export function AddPersonnelDialog({ isOpen, setIsOpen }: AddPersonnelDialogProps) {
  const [formData, setFormData] = useState<FormData>(defaultState);
  const [selectedCategory, setSelectedCategory] = useState<'admin' | 'tech' | 'client' | null>(null);
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
    handleReset();
    setIsOpen(false);
  };
  
  const handleReset = () => {
    setFormData(defaultState);
    setSelectedCategory(null);
  }

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

  const currentPermissions = useMemo(() => {
    const roles = formData.roles;
    const allOptions = [...ROLE_DATA.admin, ...ROLE_DATA.tech, ...ROLE_DATA.client];
    const perms = new Set<string>();
    roles.forEach(roleId => {
        const option = allOptions.find(o => o.id === roleId);
        option?.permissions.forEach(p => perms.add(p));
    });
    return Array.from(perms);
  }, [formData.roles]);

  const isField = formData.roles.some(r => ROLE_DATA.tech.map(fr => fr.id).includes(r));
  const isClient = formData.roles.includes('client');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="page-title text-xl">Personnel Registration Terminal</DialogTitle>
          <DialogDescription>
            Register a new operative and assign mission-specific authorization levels.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-10">
          {/* Section 1: Identity */}
          <section className="space-y-4">
             <div className="flex items-center gap-2 text-brand-red mb-4">
                <Users size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Identity Credentials</h3>
             </div>
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

          {/* Section 2: Role Authorization Gating */}
          <section className="space-y-6">
             <div className="flex items-center gap-2 text-brand-red mb-2">
                <Lock size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Permission Matrix</h3>
             </div>

             <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Select operative class</Label>
                    <Select onValueChange={(val: any) => setSelectedCategory(val)} value={selectedCategory || ''}>
                        <SelectTrigger className="bg-bg-primary border-border-sub h-11 uppercase text-[10px] font-bold tracking-[0.2em]">
                            <SelectValue placeholder="CHOOSE CATEGORY (ADMIN / TECH / CLIENT)" />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-default">
                            <SelectItem value="admin" className="uppercase text-[10px] font-bold tracking-widest">Administrative Hierarchy</SelectItem>
                            <SelectItem value="tech" className="uppercase text-[10px] font-bold tracking-widest">Field Operational Roles</SelectItem>
                            <SelectItem value="client" className="uppercase text-[10px] font-bold tracking-widest">Client Stakeholders</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {selectedCategory && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                        {ROLE_DATA[selectedCategory].map(role => {
                            const isSelected = formData.roles.includes(role.id);
                            return (
                                <div 
                                    key={role.id} 
                                    onClick={() => toggleRole(role.id)}
                                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-4 ${
                                        isSelected ? 'bg-brand-red-dim border-brand-red' : 'bg-bg-primary border-border-sub hover:border-text-muted'
                                    }`}
                                >
                                    <div className={`p-2.5 rounded ${isSelected ? 'bg-brand-red text-white' : 'bg-bg-tertiary text-text-muted'}`}>
                                        <role.icon size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[11px] font-bold uppercase tracking-wide ${isSelected ? 'text-white' : 'text-text-primary'}`}>{role.label}</p>
                                        <p className="text-[9px] text-text-muted leading-tight mt-1">{role.desc}</p>
                                    </div>
                                    <Checkbox checked={isSelected} className="mt-1" />
                                </div>
                            )
                        })}
                    </div>
                )}
             </div>
          </section>

          {/* Section 3: Permission Summary & Dynamic Fields */}
          {formData.roles.length > 0 && (
             <section className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                 <div className="p-5 rounded-lg border border-border-sub bg-bg-primary/50 space-y-6">
                    <div className="flex items-center justify-between border-b border-border-sub pb-4">
                        <div className="flex items-center gap-2 text-text-green">
                            <CheckCircle2 size={16} />
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Authorized Permissions</h3>
                        </div>
                        <div className="flex gap-1">
                            {formData.roles.map(r => (
                                <Badge key={r} variant="secondary" className="text-[8px] uppercase">{r.replace('_', ' ')}</Badge>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4">
                        {currentPermissions.map((perm, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px] font-semibold text-text-secondary">
                                <div className="h-1 w-1 rounded-full bg-text-green" />
                                {perm}
                            </div>
                        ))}
                    </div>

                    {/* Dynamic Logic Fields */}
                    <div className="pt-4 border-t border-border-sub space-y-6">
                        {isClient && (
                            <div className="space-y-2">
                                <Label htmlFor="company" className="text-[10px] uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
                                    <Info size={12}/> Associated Organization / Client Entity
                                </Label>
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
                    </div>
                 </div>
             </section>
          )}
        </div>

        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="px-8 font-bold text-[10px] uppercase tracking-widest">Abort Enrollment</Button>
          <Button onClick={handleSave} className="px-10 font-bold text-[10px] uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover group">
            Finalize Enrollment
            <ChevronRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
