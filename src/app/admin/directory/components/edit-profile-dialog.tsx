'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddressAutocompleteInput } from '@/components/ui/address-autocomplete-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { auditFieldChange } from '@/lib/audit';
import {
  normalizeLegacyRole, APP_ROLES, SUBROLE_DEFINITIONS, SUBROLES_BY_PORTAL,
  type SubrolePortal,
} from '@/lib/permissions';
import { ROLE_DATA } from '@/lib/constants/roles';
import type { Technician, AppRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  User, Phone, Mail, MapPin, Briefcase, Shield, Heart,
  FileText, Plus, X, Building2, DollarSign, Loader2, Globe,
  ShieldCheck, Wrench,
} from 'lucide-react';

type EditProfileDialogProps = {
  open: boolean;
  onClose: () => void;
  person: Technician;
};

// Per-subrole icon, pulled from ROLE_DATA so the visual stays in sync with the
// rest of the app. Labels / descriptions / portal come from the central
// SUBROLE_DEFINITIONS map (permissions.ts).
const ROLE_ICONS: Partial<Record<AppRole, typeof User>> = Object.fromEntries(
  [...ROLE_DATA.admin, ...ROLE_DATA.tech, ...ROLE_DATA.client, ...ROLE_DATA.office].map(r => [r.id, r.icon])
) as Partial<Record<AppRole, typeof User>>;

const PORTAL_GROUPS: { portal: SubrolePortal; label: string; icon: typeof User; accent: string }[] = [
  { portal: 'admin', label: 'Admin Subroles', icon: ShieldCheck, accent: 'text-brand-red' },
  { portal: 'tech', label: 'Tech Subroles', icon: Wrench, accent: 'text-[#3b82f6]' },
  { portal: 'client', label: 'Client Subroles', icon: Building2, accent: 'text-[#10b981]' },
];

const SECTIONS = [
  { id: 'basic', label: 'Basic Info', icon: User },
  { id: 'status', label: 'Status & Access', icon: Shield },
  { id: 'work', label: 'Work Info', icon: Briefcase },
  { id: 'emergency', label: 'Emergency', icon: Heart },
  { id: 'client', label: 'Client Details', icon: Building2 },
  { id: 'notes', label: 'Admin Notes', icon: FileText },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

type FormState = {
  name: string;
  preferredName: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  address: string;
  approvalStatus: 'pending' | 'approved' | 'denied';
  accountStatus: string;
  roles: AppRole[];
  primaryPortal: string;
  hourlyRate: string;
  serviceArea: string;
  skills: string[];
  certifications: string[];
  ecName: string;
  ecRelation: string;
  ecPhone: string;
  clientCompany: string;
  businessType: string;
  billingContactName: string;
  billingEmail: string;
  billingTerms: string;
  billingDelivery: string;
  adminNotes: string;
};

function personToForm(p: Technician): FormState {
  return {
    name: p.name || '',
    preferredName: p.preferredName || '',
    jobTitle: p.jobTitle || '',
    department: p.department || '',
    email: p.email || '',
    phone: p.phone || '',
    address: p.address || p.currentLocation || '',
    approvalStatus: p.approvalStatus || 'approved',
    accountStatus: p.accountStatus || 'active',
    // Only valid AppRole values may enter the form (and later be saved).
    // Legacy free-text `role` strings are mapped through the same heuristics
    // hasPermission uses, instead of being cast into the roles array raw.
    roles: (p.roles?.length
      ? p.roles.filter(r => (APP_ROLES as string[]).includes(r))
      : (normalizeLegacyRole(p.role) ? [normalizeLegacyRole(p.role)!] : [])),
    primaryPortal: p.primaryPortal || '',
    hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : '',
    serviceArea: p.serviceArea || '',
    skills: [...(p.skills || [])],
    certifications: [...(p.certifications || [])],
    ecName: p.emergencyContact?.name || '',
    ecRelation: p.emergencyContact?.relation || '',
    ecPhone: p.emergencyContact?.phone || '',
    clientCompany: p.clientCompany || '',
    businessType: p.businessType || '',
    billingContactName: p.billingDetails?.contactName || '',
    billingEmail: p.billingDetails?.email || '',
    billingTerms: p.billingDetails?.terms || 'Net 30',
    billingDelivery: p.billingDetails?.deliveryMethod || 'Portal',
    adminNotes: p.adminNotes || '',
  };
}

const labelCls = 'text-[10px] font-black uppercase tracking-widest text-text-muted';
const inputCls = 'h-9 text-[11px] bg-bg-secondary border-border-main focus-visible:ring-brand-red';
const sectionHeading = 'text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-4 flex items-center gap-2';

export function EditProfileDialog({ open, onClose, person }: EditProfileDialogProps) {
  const [section, setSection] = useState<SectionId>('basic');
  const [form, setForm] = useState<FormState>(() => personToForm(person));
  const [skillInput, setSkillInput] = useState('');
  const [certInput, setCertInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setForm(personToForm(person));
      setSection('basic');
      setSkillInput('');
      setCertInput('');
    }
  }, [open, person]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // Portals unlocked by the currently-selected subroles.
  const unlockedPortals = (roles: AppRole[]): SubrolePortal[] =>
    (['admin', 'tech', 'client'] as SubrolePortal[])
      .filter(portal => roles.some(r => SUBROLE_DEFINITIONS[r]?.portal === portal));

  // Account Status vocabulary depends on the account type. Client accounts use
  // CRM lifecycle terms (lead, prospect, VIP, collections…); personnel
  // (tech / admin / office) use simple workforce states. Mixing them made the
  // dropdown show client-only terms on techs.
  const CLIENT_STATUSES = ['active', 'inactive', 'lead', 'prospect', 'past_client', 'on_hold', 'do_not_service', 'collections', 'vip', 'archived'];
  const PERSONNEL_STATUSES = ['active', 'inactive', 'on_hold', 'archived'];
  const isClientAccount = unlockedPortals(form.roles).includes('client') || !!form.clientCompany;
  const accountStatusOptions = (() => {
    const base = isClientAccount ? CLIENT_STATUSES : PERSONNEL_STATUSES;
    // Always keep the currently-saved value selectable even if it's off-list.
    return base.includes(form.accountStatus) ? base : [form.accountStatus, ...base];
  })();

  const toggleRole = (role: AppRole) => {
    const nextRoles = form.roles.includes(role)
      ? form.roles.filter(r => r !== role)
      : [...form.roles, role];
    // Keep Primary Portal valid: if it lost its last subrole, fall back to the
    // first still-unlocked portal (or clear when none remain).
    const portals = unlockedPortals(nextRoles);
    const nextPrimary = form.primaryPortal && portals.includes(form.primaryPortal as SubrolePortal)
      ? form.primaryPortal
      : (portals[0] ?? '');
    setForm(prev => ({ ...prev, roles: nextRoles, primaryPortal: nextPrimary }));
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills.includes(s)) set('skills', [...form.skills, s]);
    setSkillInput('');
  };

  const addCert = () => {
    const c = certInput.trim();
    if (c && !form.certifications.includes(c)) set('certifications', [...form.certifications, c]);
    setCertInput('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Name required', description: 'Full name cannot be blank.' });
      return;
    }

    setSaving(true);
    try {
      const adminUser = auth.currentUser;
      const adminId = adminUser?.uid || '';
      const adminName = adminUser?.displayName || 'Admin';

      const ecFilled = form.ecName.trim() || form.ecRelation.trim() || form.ecPhone.trim();

      const updates: Record<string, unknown> = {
        name: form.name.trim(),
        preferredName: form.preferredName.trim(),
        jobTitle: form.jobTitle.trim(),
        department: form.department.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        currentLocation: form.address.trim(),
        approvalStatus: form.approvalStatus,
        accountStatus: form.accountStatus,
        roles: form.roles,
        primaryPortal: form.primaryPortal || null,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        serviceArea: form.serviceArea.trim(),
        skills: form.skills,
        certifications: form.certifications,
        ...(ecFilled
          ? { emergencyContact: { name: form.ecName.trim(), relation: form.ecRelation.trim(), phone: form.ecPhone.trim() } }
          : {}),
        clientCompany: form.clientCompany.trim(),
        businessType: form.businessType.trim(),
        billingDetails: {
          contactName: form.billingContactName.trim(),
          email: form.billingEmail.trim(),
          terms: form.billingTerms,
          deliveryMethod: form.billingDelivery,
        },
        adminNotes: form.adminNotes.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: adminId,
      };

      const oldSnapshot: Record<string, unknown> = {
        name: person.name,
        preferredName: person.preferredName,
        jobTitle: person.jobTitle,
        department: person.department,
        email: person.email,
        phone: person.phone,
        address: person.address,
        approvalStatus: person.approvalStatus,
        accountStatus: person.accountStatus,
        roles: person.roles,
        primaryPortal: person.primaryPortal,
        hourlyRate: person.hourlyRate,
        serviceArea: person.serviceArea,
        skills: person.skills,
        certifications: person.certifications,
        emergencyContact: person.emergencyContact,
        clientCompany: person.clientCompany,
        businessType: person.businessType,
        billingDetails: person.billingDetails,
        adminNotes: person.adminNotes,
      };

      await auditFieldChange('users', person.id, adminId, adminName, oldSnapshot, updates as Record<string, unknown>);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateDoc(doc(db, 'users', person.id), updates as any);

      toast({ title: 'Profile updated', description: `${form.name}'s profile has been saved.` });
      onClose();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Save failed', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="bg-bg-elevated border-border-main max-w-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border-sub shrink-0">
          <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
            <User size={14} className="text-brand-red" />
            Edit Profile — {person.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-40 shrink-0 border-r border-border-sub bg-bg-secondary py-3 flex flex-col gap-0.5 px-2">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all',
                    'text-[10px] font-black uppercase tracking-wider',
                    section === s.id
                      ? 'bg-brand-red/10 text-brand-red border border-brand-red/20'
                      : 'text-text-muted hover:bg-bg-tertiary hover:text-text-secondary border border-transparent',
                  )}
                >
                  <Icon size={11} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* ── Basic Info ── */}
            {section === 'basic' && (
              <div>
                <h3 className={sectionHeading}><User size={11} /> Basic Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Full Name *</Label>
                      <Input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Preferred Name</Label>
                      <Input className={inputCls} value={form.preferredName} onChange={e => set('preferredName', e.target.value)} placeholder="Goes by..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Job Title</Label>
                      <Input className={inputCls} value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="e.g. Lead Technician" />
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Department / Team</Label>
                      <Input className={inputCls} value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Field Operations" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Email</Label>
                      <div className="relative">
                        <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input className={cn(inputCls, 'pl-7')} value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@example.com" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Phone</Label>
                      <div className="relative">
                        <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input className={cn(inputCls, 'pl-7')} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>Address</Label>
                    <div className="relative">
                      <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <AddressAutocompleteInput className={cn(inputCls, 'pl-7')} value={form.address} onChange={v => set('address', v)} placeholder="Street address, City, State ZIP" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Status & Access ── */}
            {section === 'status' && (
              <div>
                <h3 className={sectionHeading}><Shield size={11} /> Status &amp; Access</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Approval Status</Label>
                      <Select value={form.approvalStatus} onValueChange={v => set('approvalStatus', v as FormState['approvalStatus'])}>
                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          <SelectItem value="pending" className="text-[11px]">Pending</SelectItem>
                          <SelectItem value="approved" className="text-[11px]">Approved</SelectItem>
                          <SelectItem value="denied" className="text-[11px]">Denied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Account Status</Label>
                      <Select value={form.accountStatus} onValueChange={v => set('accountStatus', v)}>
                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          {accountStatusOptions.map(s => (
                            <SelectItem key={s} value={s} className="text-[11px]">{s.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className={labelCls}>Subroles</Label>
                      <p className="text-[9px] text-text-muted normal-case tracking-normal mt-1 leading-relaxed">
                        Selecting a subrole unlocks its portal and applies its preset permissions. Removing the last subrole in a portal removes access to that portal.
                      </p>
                    </div>

                    {PORTAL_GROUPS.map(group => {
                      const GroupIcon = group.icon;
                      return (
                        <div key={group.portal} className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <GroupIcon size={11} className={group.accent} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{group.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {SUBROLES_BY_PORTAL[group.portal].map(role => {
                              const def = SUBROLE_DEFINITIONS[role];
                              const Icon = ROLE_ICONS[role] ?? Shield;
                              const selected = form.roles.includes(role);
                              return (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => toggleRole(role)}
                                  className={cn(
                                    'flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                                    selected
                                      ? 'bg-brand-red/10 border-brand-red/30 text-text-primary'
                                      : 'border-border-sub bg-bg-secondary text-text-muted hover:border-border-main',
                                  )}
                                >
                                  <div className={cn('w-3 h-3 mt-0.5 rounded border flex items-center justify-center shrink-0',
                                    selected ? 'bg-brand-red border-brand-red' : 'border-border-main bg-bg-primary')}>
                                    {selected && <div className="w-1.5 h-1.5 rounded-sm bg-white" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <Icon size={11} className={selected ? group.accent : 'text-text-muted'} />
                                      <span className="text-[10px] font-bold uppercase truncate">{def.label}</span>
                                    </div>
                                    <p className="text-[9px] text-text-muted leading-tight mt-0.5">{def.permissions.length} permissions</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <Label className={labelCls}>Portal Access (derived from subroles)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PORTAL_GROUPS.map(group => {
                        const unlocked = form.roles.some(r => SUBROLE_DEFINITIONS[r]?.portal === group.portal);
                        return (
                          <span key={group.portal} className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border',
                            unlocked ? cn('border-current', group.accent, 'bg-bg-secondary') : 'border-border-sub text-text-muted/40',
                          )}>
                            <group.icon size={10} /> {group.portal} {unlocked ? '' : '· locked'}
                          </span>
                        );
                      })}
                    </div>
                    {form.roles.length === 0 && (
                      <p className="text-[9px] text-brand-red/80 normal-case tracking-normal">No portal access. Select a subrole to assign portal access and preset permissions.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className={labelCls}>Primary Portal <span className="text-text-muted/60 normal-case tracking-normal">— default landing after login</span></Label>
                    <Select
                      value={form.primaryPortal || '__none__'}
                      onValueChange={v => set('primaryPortal', v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger className={inputCls}><SelectValue placeholder="Auto (first available)" /></SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="__none__" className="text-[11px]">Auto (first available)</SelectItem>
                        {(['admin', 'tech', 'client'] as SubrolePortal[])
                          .filter(portal => form.roles.some(r => SUBROLE_DEFINITIONS[r]?.portal === portal))
                          .map(portal => (
                            <SelectItem key={portal} value={portal} className="text-[11px] capitalize">{portal} Portal</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Only unlocked portals can be chosen. Primary Portal does not grant access.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Work Info ── */}
            {section === 'work' && (
              <div>
                <h3 className={sectionHeading}><Briefcase size={11} /> Work Information</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Hourly Rate ($)</Label>
                      <div className="relative">
                        <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                          className={cn(inputCls, 'pl-7')}
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.hourlyRate}
                          onChange={e => set('hourlyRate', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Service Area</Label>
                      <div className="relative">
                        <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input className={cn(inputCls, 'pl-7')} value={form.serviceArea} onChange={e => set('serviceArea', e.target.value)} placeholder="e.g. Greater NYC" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className={labelCls}>Skills</Label>
                    <div className="flex gap-2">
                      <Input
                        className={cn(inputCls, 'flex-1')}
                        value={skillInput}
                        onChange={e => setSkillInput(e.target.value)}
                        placeholder="Add a skill..."
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                      />
                      <Button size="sm" type="button" onClick={addSkill} className="h-9 px-3 bg-brand-red hover:bg-brand-red/90 text-white">
                        <Plus size={13} />
                      </Button>
                    </div>
                    {form.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {form.skills.map(s => (
                          <Badge key={s} variant="scheduled" className="text-[9px] uppercase px-2 py-0.5 gap-1 h-auto">
                            {s}
                            <button type="button" onClick={() => set('skills', form.skills.filter(x => x !== s))}>
                              <X size={9} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className={labelCls}>Certifications</Label>
                    <div className="flex gap-2">
                      <Input
                        className={cn(inputCls, 'flex-1')}
                        value={certInput}
                        onChange={e => setCertInput(e.target.value)}
                        placeholder="Add a certification..."
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCert(); } }}
                      />
                      <Button size="sm" type="button" onClick={addCert} className="h-9 px-3 bg-brand-red hover:bg-brand-red/90 text-white">
                        <Plus size={13} />
                      </Button>
                    </div>
                    {form.certifications.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {form.certifications.map(c => (
                          <Badge key={c} className="text-[9px] uppercase px-2 py-0.5 gap-1 h-auto bg-text-green/10 text-text-green border-text-green/20">
                            {c}
                            <button type="button" onClick={() => set('certifications', form.certifications.filter(x => x !== c))}>
                              <X size={9} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Emergency Contact ── */}
            {section === 'emergency' && (
              <div>
                <h3 className={sectionHeading}><Heart size={11} /> Emergency Contact</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className={labelCls}>Contact Name</Label>
                    <Input className={inputCls} value={form.ecName} onChange={e => set('ecName', e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>Relationship</Label>
                    <Input className={inputCls} value={form.ecRelation} onChange={e => set('ecRelation', e.target.value)} placeholder="e.g. Spouse, Parent" />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>Phone Number</Label>
                    <div className="relative">
                      <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <Input className={cn(inputCls, 'pl-7')} value={form.ecPhone} onChange={e => set('ecPhone', e.target.value)} placeholder="+1 (555) 000-0000" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Client Details ── */}
            {section === 'client' && (
              <div>
                <h3 className={sectionHeading}><Building2 size={11} /> Client Details</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Company Name</Label>
                      <Input className={inputCls} value={form.clientCompany} onChange={e => set('clientCompany', e.target.value)} placeholder="Acme Corp" />
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Business Type</Label>
                      <Input className={inputCls} value={form.businessType} onChange={e => set('businessType', e.target.value)} placeholder="e.g. Retail, Healthcare" />
                    </div>
                  </div>
                  <div className="border-t border-border-sub pt-3">
                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">Billing Details</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className={labelCls}>Billing Contact Name</Label>
                          <Input className={inputCls} value={form.billingContactName} onChange={e => set('billingContactName', e.target.value)} placeholder="AP / Contact Name" />
                        </div>
                        <div className="space-y-1">
                          <Label className={labelCls}>Billing Email</Label>
                          <div className="relative">
                            <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            <Input className={cn(inputCls, 'pl-7')} value={form.billingEmail} onChange={e => set('billingEmail', e.target.value)} placeholder="ap@company.com" />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className={labelCls}>Payment Terms</Label>
                          <Select value={form.billingTerms} onValueChange={v => set('billingTerms', v)}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                              {['Net 15', 'Net 30', 'Net 60', 'Due on Receipt'].map(t => (
                                <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={labelCls}>Invoice Delivery</Label>
                          <Select value={form.billingDelivery} onValueChange={v => set('billingDelivery', v)}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                              <SelectItem value="Email" className="text-[11px]">Email</SelectItem>
                              <SelectItem value="Portal" className="text-[11px]">Portal</SelectItem>
                              <SelectItem value="Both" className="text-[11px]">Email &amp; Portal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Admin Notes ── */}
            {section === 'notes' && (
              <div>
                <h3 className={sectionHeading}><FileText size={11} /> Admin Notes</h3>
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[200px] text-[11px] bg-bg-secondary border-border-main resize-none focus-visible:ring-brand-red"
                    placeholder="Internal notes about this user. Not visible to the user."
                    value={form.adminNotes}
                    onChange={e => set('adminNotes', e.target.value)}
                  />
                  <p className="text-[9px] text-text-muted uppercase tracking-wider">
                    These notes are only visible to administrators and are never shown to the user.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border-sub shrink-0 flex justify-between items-center">
          <p className="text-[9px] text-text-muted uppercase tracking-wider">
            Changes saved to Firestore with audit log.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="text-[10px] font-black uppercase">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
              {saving ? <><Loader2 size={11} className="mr-1.5 animate-spin" /> Saving…</> : 'Save Changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
