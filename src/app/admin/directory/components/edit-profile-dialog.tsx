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
import { isValidLast4, WORKER_TYPE_LABELS } from '@/lib/accounting-readiness';
import { useAuth } from '@/contexts/auth-context';
import { canEditUserAccess, canEditUserPay } from '@/lib/profile-permissions';
import { ROLE_DATA } from '@/lib/constants/roles';
import type { Technician, AppRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  User, Phone, Mail, MapPin, Briefcase, Shield, Heart,
  FileText, Plus, X, Building2, DollarSign, Loader2, Globe,
  ShieldCheck, Wrench, Handshake, Landmark,
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
  [...ROLE_DATA.admin, ...ROLE_DATA.external, ...ROLE_DATA.tech, ...ROLE_DATA.client].map(r => [r.id, r.icon])
) as Partial<Record<AppRole, typeof User>>;

const PORTAL_GROUPS: { portal: SubrolePortal; label: string; icon: typeof User; accent: string }[] = [
  { portal: 'admin', label: 'Admin Subroles', icon: ShieldCheck, accent: 'text-brand-red' },
  { portal: 'sales', label: 'External Access', icon: Handshake, accent: 'text-amber-400' },
  { portal: 'tech', label: 'Tech Subroles', icon: Wrench, accent: 'text-brand-blue' },
  { portal: 'client', label: 'Client Subroles', icon: Building2, accent: 'text-brand-emerald' },
];

// Which kinds of account a section applies to. Sections that don't apply are
// hidden AND not saved, so a tech no longer gets client billing defaults
// (Net 30 / Portal) written onto their profile and vice versa.
type AccountKinds = { tech: boolean; client: boolean; personnel: boolean };

const SECTIONS = [
  { id: 'basic', label: 'Basic Info', icon: User, show: (_: AccountKinds) => true },
  { id: 'status', label: 'Status & Access', icon: Shield, show: (_: AccountKinds) => true },
  { id: 'work', label: 'Work Info', icon: Briefcase, show: (k: AccountKinds) => k.personnel },
  { id: 'pay', label: 'Pay & Tax', icon: Landmark, show: (k: AccountKinds) => k.tech },
  { id: 'emergency', label: 'Emergency', icon: Heart, show: (k: AccountKinds) => k.personnel },
  { id: 'client', label: 'Billing & Tax', icon: Building2, show: (k: AccountKinds) => k.client },
  { id: 'notes', label: 'Admin Notes', icon: FileText, show: (_: AccountKinds) => true },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const PAYOUT_METHODS = ['ACH', 'Check', 'Zelle', 'Venmo', 'Other'];

/** Read a dotted path ('accounting.workerType') off the person for the audit diff. */
function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

// '' / null / undefined all mean "not set" — so re-saving an untouched form
// doesn't register as a change (and doesn't trip the pay/access rules).
const sameValue = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v === undefined || v === null || v === '' ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};
const ACCESS_FIELDS = ['roles', 'primaryPortal'];
const PAY_FIELDS = ['hourlyRate', 'payoutPreferences'];
const isPayField = (k: string) => PAY_FIELDS.includes(k) || k.startsWith('accounting.');

type FormState = {
  name: string;
  preferredName: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  address: string;
  /** City/region the tech is dispatched from — the tech sets this on their own profile too. */
  workingLocation: string;
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
  customerDisplayName: string;
  billingAddress: string;
  /** '' = not decided yet. */
  taxStatus: '' | 'taxable' | 'exempt';
  taxExemptReason: string;
  payoutMethod: string;
  payoutNotes: string;
  workerType: string;
  payeeLegalName: string;
  payeeBusinessName: string;
  taxIdType: string;
  taxIdLast4: string;
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
    address: p.address || '',
    workingLocation: p.currentLocation || '',
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
    customerDisplayName: p.accounting?.customerDisplayName || '',
    billingAddress: p.accounting?.billingAddress || '',
    taxStatus: p.accounting?.taxExempt === true ? 'exempt' : p.accounting?.taxExempt === false ? 'taxable' : '',
    taxExemptReason: p.accounting?.taxExemptReason || '',
    // Legacy docs stored lowercase ('ach'); normalize to the option labels.
    payoutMethod: PAYOUT_METHODS.find(m => m.toLowerCase() === (p.payoutPreferences?.method || '').toLowerCase())
      || p.payoutPreferences?.method || '',
    payoutNotes: p.payoutPreferences?.notes || '',
    workerType: p.accounting?.workerType || '',
    payeeLegalName: p.accounting?.payeeLegalName || '',
    payeeBusinessName: p.accounting?.payeeBusinessName || '',
    taxIdType: p.accounting?.taxIdType || '',
    taxIdLast4: p.accounting?.taxIdLast4 || '',
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
  // Mirrors firestore.rules: subroles need a super admin, pay/tax needs payroll.
  const { user: me } = useAuth();
  const canAccess = canEditUserAccess(me);
  const canPay = canEditUserPay(me);

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
    (['admin', 'sales', 'tech', 'client'] as SubrolePortal[])
      .filter(portal => roles.some(r => SUBROLE_DEFINITIONS[r]?.portal === portal));

  // Account Status vocabulary depends on the account type. Client accounts use
  // CRM lifecycle terms (lead, prospect, VIP, collections…); personnel
  // (tech / admin / office) use simple workforce states. Mixing them made the
  // dropdown show client-only terms on techs.
  const CLIENT_STATUSES = ['active', 'inactive', 'lead', 'prospect', 'past_client', 'on_hold', 'do_not_service', 'collections', 'vip', 'archived'];
  const PERSONNEL_STATUSES = ['active', 'inactive', 'on_hold', 'archived'];
  const portalsNow = unlockedPortals(form.roles);
  const isClientAccount = portalsNow.includes('client') || !!form.clientCompany;
  const kinds: AccountKinds = {
    tech: portalsNow.includes('tech'),
    client: isClientAccount,
    personnel: portalsNow.some(p => p !== 'client'),
  };
  const visibleSections = SECTIONS.filter(s => s.show(kinds));
  // A subrole change can hide the section being viewed.
  const activeSection: SectionId = visibleSections.some(s => s.id === section) ? section : 'basic';
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
    if (kinds.tech && form.taxIdLast4.trim() && !isValidLast4(form.taxIdLast4.trim())) {
      setSection('pay');
      toast({ variant: 'destructive', title: 'Tax ID last 4', description: 'Enter exactly the last 4 digits — never the full SSN/EIN.' });
      return;
    }
    if (kinds.client && form.taxStatus === 'exempt' && !form.taxExemptReason.trim()) {
      setSection('client');
      toast({ variant: 'destructive', title: 'Exemption reason required', description: 'Say why this customer is tax exempt (e.g. resale certificate on file).' });
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
        approvalStatus: form.approvalStatus,
        accountStatus: form.accountStatus,
        roles: form.roles,
        primaryPortal: form.primaryPortal || null,
        adminNotes: form.adminNotes.trim(),
      };

      if (kinds.personnel) {
        Object.assign(updates, {
          // Separate from the mailing address (it used to be overwritten with it).
          currentLocation: form.workingLocation.trim(),
          serviceArea: form.serviceArea.trim(),
          skills: form.skills,
          certifications: form.certifications,
          ...(ecFilled
            ? { emergencyContact: { name: form.ecName.trim(), relation: form.ecRelation.trim(), phone: form.ecPhone.trim() } }
            : {}),
        });
      }

      if (kinds.tech) {
        // Dotted paths so the QuickBooks link the sync writes onto
        // `accounting` is never overwritten by this (possibly stale) form.
        Object.assign(updates, {
          hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
          payoutPreferences: form.payoutMethod
            ? { method: form.payoutMethod, notes: form.payoutNotes.trim() }
            : null,
          'accounting.workerType': form.workerType || null,
          'accounting.payeeLegalName': orNull(form.payeeLegalName),
          'accounting.payeeBusinessName': orNull(form.payeeBusinessName),
          'accounting.taxIdType': form.taxIdType || null,
          'accounting.taxIdLast4': orNull(form.taxIdLast4),
        });
      }

      if (kinds.client) {
        Object.assign(updates, {
          clientCompany: form.clientCompany.trim(),
          businessType: form.businessType.trim(),
          billingDetails: {
            contactName: form.billingContactName.trim(),
            email: form.billingEmail.trim(),
            terms: form.billingTerms,
            deliveryMethod: form.billingDelivery,
          },
          'accounting.customerDisplayName': orNull(form.customerDisplayName),
          'accounting.billingAddress': orNull(form.billingAddress),
          'accounting.taxExempt': form.taxStatus === 'exempt' ? true : form.taxStatus === 'taxable' ? false : null,
          'accounting.taxExemptReason': form.taxStatus === 'exempt' ? orNull(form.taxExemptReason) : null,
        });
      }

      // Write only what changed, and never fields this admin may not change.
      for (const k of Object.keys(updates)) {
        const locked = (!canAccess && ACCESS_FIELDS.includes(k)) || (!canPay && isPayField(k));
        if (locked || sameValue(readPath(person, k), updates[k])) delete updates[k];
      }
      if (Object.keys(updates).length === 0) {
        toast({ title: 'No changes to save' });
        onClose();
        return;
      }
      // Old values for exactly the keys being written (dotted paths included).
      const oldSnapshot: Record<string, unknown> = Object.fromEntries(
        Object.keys(updates).map(k => [k, readPath(person, k)]));
      Object.assign(updates, { updatedAt: new Date().toISOString(), updatedBy: adminId });

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
            {visibleSections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all',
                    'text-[10px] font-black uppercase tracking-wider',
                    activeSection === s.id
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
            {activeSection === 'basic' && (
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
                      {form.email.trim() !== (person.email || '') && (
                        <p className="text-[9px] text-amber-400 normal-case tracking-normal">Contact email only — this does not change the address they sign in with.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Phone</Label>
                      <div className="relative">
                        <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input className={cn(inputCls, 'pl-7')} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
                      </div>
                    </div>
                  </div>
                  {kinds.personnel && (
                    <div className="space-y-1">
                      <Label className={labelCls}>Working Location</Label>
                      <div className="relative">
                        <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <AddressAutocompleteInput className={cn(inputCls, 'pl-7')} value={form.workingLocation} onChange={v => set('workingLocation', v)} types={['(cities)']} placeholder="City / region they're dispatched from" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className={labelCls}>Mailing Address</Label>
                    <div className="relative">
                      <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <AddressAutocompleteInput className={cn(inputCls, 'pl-7')} value={form.address} onChange={v => set('address', v)} placeholder="Street address, City, State ZIP" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Status & Access ── */}
            {activeSection === 'status' && (
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
                      {!canAccess && (
                        <p className="text-[9px] text-amber-400 normal-case tracking-normal mt-1">Only a super admin can change subroles.</p>
                      )}
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
                                  disabled={!canAccess}
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
                      disabled={!canAccess}
                    >
                      <SelectTrigger className={inputCls}><SelectValue placeholder="Auto (first available)" /></SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="__none__" className="text-[11px]">Auto (first available)</SelectItem>
                        {(['admin', 'sales', 'tech', 'client'] as SubrolePortal[])
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
            {activeSection === 'work' && (
              <div>
                <h3 className={sectionHeading}><Briefcase size={11} /> Work Information</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className={labelCls}>Service Area</Label>
                    <div className="relative">
                      <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <Input className={cn(inputCls, 'pl-7')} value={form.serviceArea} onChange={e => set('serviceArea', e.target.value)} placeholder="e.g. Metro Detroit" />
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

            {/* ── Pay & Tax (tech → QuickBooks Vendor) ── */}
            {activeSection === 'pay' && (
              <div>
                <h3 className={sectionHeading}><Landmark size={11} /> Pay &amp; Tax</h3>
                {!canPay && (
                  <p className="text-[9px] text-amber-400 mb-3">Only payroll admins and super admins can change pay and tax details.</p>
                )}
                <fieldset disabled={!canPay} className="space-y-4 disabled:opacity-60">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={labelCls}>Worker Classification</Label>
                      <Select value={form.workerType || '__unset__'} onValueChange={v => set('workerType', v === '__unset__' ? '' : v)}>
                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          <SelectItem value="__unset__" className="text-[11px]">Not set</SelectItem>
                          {Object.entries(WORKER_TYPE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className={labelCls}>Project Hourly Rate ($)</Label>
                      <div className="relative">
                        <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input className={cn(inputCls, 'pl-7')} type="number" min="0" step="0.01" value={form.hourlyRate}
                          onChange={e => set('hourlyRate', e.target.value)} placeholder="0.00" />
                      </div>
                      <p className="text-[9px] text-text-muted normal-case tracking-normal">Used for hourly project payouts from timesheets.</p>
                    </div>
                  </div>

                  <div className="border-t border-border-sub pt-3 space-y-3">
                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Payout</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className={labelCls}>Payout Method</Label>
                        <Select value={form.payoutMethod || '__unset__'} onValueChange={v => set('payoutMethod', v === '__unset__' ? '' : v)}>
                          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-bg-elevated border-border-main">
                            <SelectItem value="__unset__" className="text-[11px]">Not on file</SelectItem>
                            {(PAYOUT_METHODS.includes(form.payoutMethod) || !form.payoutMethod ? PAYOUT_METHODS : [form.payoutMethod, ...PAYOUT_METHODS]).map(m => (
                              <SelectItem key={m} value={m} className="text-[11px]">{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className={labelCls}>Payout Notes</Label>
                        <Input className={inputCls} value={form.payoutNotes} onChange={e => set('payoutNotes', e.target.value)} placeholder="e.g. Zelle to phone on file" />
                      </div>
                    </div>
                    <p className="text-[9px] text-text-muted normal-case tracking-normal">Shown on paystubs. Never enter bank account or routing numbers here — those are collected by QuickBooks Bill Pay.</p>
                  </div>

                  {form.workerType !== 'w2_employee' && form.workerType !== 'not_paid' && (
                    <div className="border-t border-border-sub pt-3 space-y-3">
                      <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">1099 Payee (from their W-9)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className={labelCls}>Legal Name (W-9 line 1)</Label>
                          <Input className={inputCls} value={form.payeeLegalName} onChange={e => set('payeeLegalName', e.target.value)} placeholder="As shown on their tax return" />
                        </div>
                        <div className="space-y-1">
                          <Label className={labelCls}>Business Name (line 2)</Label>
                          <Input className={inputCls} value={form.payeeBusinessName} onChange={e => set('payeeBusinessName', e.target.value)} placeholder="LLC / DBA, if any" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className={labelCls}>Tax ID Type</Label>
                          <Select value={form.taxIdType || '__unset__'} onValueChange={v => set('taxIdType', v === '__unset__' ? '' : v)}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                              <SelectItem value="__unset__" className="text-[11px]">Not set</SelectItem>
                              <SelectItem value="SSN" className="text-[11px]">SSN (individual)</SelectItem>
                              <SelectItem value="EIN" className="text-[11px]">EIN (business)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={labelCls}>Tax ID — Last 4 Only</Label>
                          <Input className={cn(inputCls, 'font-mono')} inputMode="numeric" maxLength={4} value={form.taxIdLast4}
                            onChange={e => set('taxIdLast4', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
                        </div>
                      </div>
                      <p className="text-[9px] text-text-muted normal-case tracking-normal">The full SSN/EIN stays on the W-9 document and in QuickBooks — never in the app. Mailing address for the 1099 is the address under Basic Info.</p>
                    </div>
                  )}
                </fieldset>
              </div>
            )}

            {/* ── Emergency Contact ── */}
            {activeSection === 'emergency' && (
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
            {activeSection === 'client' && (
              <div>
                <h3 className={sectionHeading}><Building2 size={11} /> Billing &amp; Tax</h3>
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
                  <div className="border-t border-border-sub pt-3">
                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">Accounting (QuickBooks Customer)</p>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className={labelCls}>Customer Name in QuickBooks</Label>
                        <Input className={inputCls} value={form.customerDisplayName} onChange={e => set('customerDisplayName', e.target.value)}
                          placeholder={form.clientCompany.trim() || form.name.trim() || 'Defaults to company name'} />
                      </div>
                      <div className="space-y-1">
                        <Label className={labelCls}>Billing Address</Label>
                        <AddressAutocompleteInput className={inputCls} value={form.billingAddress} onChange={v => set('billingAddress', v)}
                          placeholder={form.address.trim() || 'Defaults to the address under Basic Info'} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className={labelCls}>Sales Tax</Label>
                          <Select value={form.taxStatus || '__unset__'} onValueChange={v => set('taxStatus', (v === '__unset__' ? '' : v) as FormState['taxStatus'])}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                              <SelectItem value="__unset__" className="text-[11px]">Not set</SelectItem>
                              <SelectItem value="taxable" className="text-[11px]">Taxable</SelectItem>
                              <SelectItem value="exempt" className="text-[11px]">Tax exempt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.taxStatus === 'exempt' && (
                          <div className="space-y-1">
                            <Label className={labelCls}>Exemption Reason *</Label>
                            <Input className={inputCls} value={form.taxExemptReason} onChange={e => set('taxExemptReason', e.target.value)} placeholder="e.g. Resale cert on file" />
                          </div>
                        )}
                      </div>
                      {form.taxStatus === 'exempt' && (
                        <p className="text-[9px] text-text-muted normal-case tracking-normal">Upload the exemption certificate under Documents.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Admin Notes ── */}
            {activeSection === 'notes' && (
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
