'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { makeLeadId } from '@/lib/doc-ids';
import type { CrmCompany, CrmContact, Lead } from '@/lib/types';
import { findCompany, resolveLeadAccount } from '@/lib/crm-accounts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, Target, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteLead } from '@/lib/crm-actions';
import { SOURCES, SERVICE_LINES, INDUSTRIES, STAGES, findDuplicates, probabilityOf } from '@/lib/crm';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after the lead being edited is deleted. */
  onDeleted?: (leadId: string) => void;
  currentUserId: string;
  currentUserName?: string;
  /** Pass a lead to edit it; omit to create a new one. */
  lead?: Lead | null;
  /** All leads — used to warn about duplicates. */
  leads?: Lead[];
  companies?: CrmCompany[];
  contacts?: CrmContact[];
  /** Prefill company for "New deal" from an account. */
  presetCompany?: CrmCompany | null;
};

type Form = {
  companyName: string; contactName: string; contactTitle: string; contactEmail: string; contactPhone: string;
  website: string; address: string; industry: string; source: Lead['source']; serviceLines: string[];
  estimatedValue: string; probability: string; expectedCloseDate: string; followUpDate: string;
  nextStep: string; notes: string; tags: string;
};

const EMPTY: Form = {
  companyName: '', contactName: '', contactTitle: '', contactEmail: '', contactPhone: '',
  website: '', address: '', industry: '', source: 'other', serviceLines: [],
  estimatedValue: '', probability: '', expectedCloseDate: '', followUpDate: '',
  nextStep: '', notes: '', tags: '',
};

function fromLead(l: Lead): Form {
  return {
    companyName: l.companyName || '', contactName: l.contactName || '', contactTitle: l.contactTitle || '',
    contactEmail: l.contactEmail || '', contactPhone: l.contactPhone || '', website: l.website || '',
    address: l.address || '', industry: l.industry || '', source: l.source || 'other',
    serviceLines: l.serviceLines || [], estimatedValue: l.estimatedValue ? String(l.estimatedValue) : '',
    probability: typeof l.probability === 'number' ? String(l.probability) : '',
    expectedCloseDate: l.expectedCloseDate || '', followUpDate: l.followUpDate || '',
    nextStep: l.nextStep || '', notes: l.notes || '', tags: (l.tags || []).join(', '),
  };
}

const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-text-muted';
const inputCls = 'h-9 text-xs bg-bg-tertiary border-border-main';

export function NewLeadDialog({ open, onClose, currentUserId, currentUserName, lead, leads = [], companies = [], contacts = [], presetCompany, onDeleted }: Props) {
  const { toast } = useToast();
  const editing = !!lead;
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (lead) setForm(fromLead(lead));
    else if (presetCompany) {
      const primary = contacts.find(c => c.companyId === presetCompany.id && c.isPrimary) || contacts.find(c => c.companyId === presetCompany.id);
      setForm({
        ...EMPTY, companyName: presetCompany.name, industry: presetCompany.industry || '', website: presetCompany.website || '',
        address: presetCompany.address || '', contactName: primary?.name || '', contactTitle: primary?.title || '',
        contactEmail: primary?.email || '', contactPhone: primary?.phone || '', source: 'existing_client',
      });
    } else setForm(EMPTY);
  }, [open, lead?.id, presetCompany?.id]);

  const matchedCompany = useMemo(() => findCompany(companies, form.companyName), [companies, form.companyName]);
  const companyContacts = useMemo(
    () => (matchedCompany ? contacts.filter(c => c.companyId === matchedCompany.id) : []),
    [contacts, matchedCompany?.id],
  );

  // Picking a known account fills blanks from it.
  function onCompanyChange(name: string) {
    const co = findCompany(companies, name);
    setForm(f => ({
      ...f, companyName: name,
      ...(co && !editing ? {
        industry: f.industry || co.industry || '', website: f.website || co.website || '', address: f.address || co.address || '',
      } : {}),
    }));
  }

  function onContactChange(name: string) {
    const ct = companyContacts.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    setForm(f => ({
      ...f, contactName: name,
      ...(ct ? { contactTitle: ct.title || f.contactTitle, contactEmail: ct.email || f.contactEmail, contactPhone: ct.phone || f.contactPhone } : {}),
    }));
  }

  const dupes = useMemo(
    () => findDuplicates(leads, form, lead?.id),
    [leads, form.companyName, form.contactEmail, form.contactPhone, lead?.id],
  );

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleService(s: string) {
    setForm(f => ({ ...f, serviceLines: f.serviceLines.includes(s) ? f.serviceLines.filter(x => x !== s) : [...f.serviceLines, s] }));
  }

  async function handleSave() {
    if (!form.companyName.trim()) {
      toast({ title: 'Company name required', variant: 'destructive' });
      return;
    }
    const prob = form.probability === '' ? null : Math.max(0, Math.min(100, Number(form.probability) || 0));
    const now = new Date().toISOString();
    const fields = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      contactTitle: form.contactTitle.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      website: form.website.trim(),
      address: form.address.trim(),
      industry: form.industry,
      source: form.source,
      serviceLines: form.serviceLines,
      estimatedValue: Number(form.estimatedValue) || 0,
      expectedCloseDate: form.expectedCloseDate,
      followUpDate: form.followUpDate,
      nextStep: form.nextStep.trim(),
      notes: form.notes,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      updatedAt: now,
    };
    setSaving(true);
    try {
      let account: { companyId?: string; contactId?: string } = {};
      try {
        account = await resolveLeadAccount(
          { ...fields, companyId: editing && lead!.companyName === fields.companyName ? lead!.companyId : undefined },
          companies, contacts, { id: currentUserId, name: currentUserName },
        );
      } catch {
        // Account linking is additive — never block saving the deal on it.
      }
      Object.assign(fields, account);
      if (editing) {
        // Firestore rejects undefined — clear a removed override with null instead.
        await updateDoc(doc(db, 'leads', lead!.id), { ...fields, probability: prob });
        toast({ title: 'Lead updated' });
      } else {
        const id = await makeLeadId();
        await addDoc(collection(db, 'leads'), {
          ...fields,
          ...(prob !== null ? { probability: prob } : {}),
          id,
          stage: 'new',
          assignedTo: currentUserId,
          assignedToName: currentUserName || '',
          createdAt: now,
          stageChangedAt: now,
        });
        toast({ title: 'Lead created', description: `${fields.companyName} added to pipeline.` });
      }
      onClose();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const stageDefault = lead ? probabilityOf({ ...lead, probability: undefined }) : STAGES[0].probability;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-bg-secondary border-border-main sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary">
            <Target size={16} className="text-brand-red" />
            {editing ? 'Edit Lead' : 'New Lead'}
          </DialogTitle>
          <DialogDescription className="text-[10px] text-text-muted uppercase tracking-wider">
            {editing ? lead!.companyName : 'Add a prospect to the sales pipeline.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-5 pb-4">
            {dupes.length > 0 && (
              <div className="flex gap-2 p-3 rounded-lg border border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-400">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-black uppercase tracking-wider">Possible duplicate</p>
                  {dupes.slice(0, 3).map(d => (
                    <p key={d.id}>{d.companyName}{d.contactName ? ` · ${d.contactName}` : ''} — {STAGES.find(s => s.key === d.stage)?.label}{d.assignedToName ? ` · ${d.assignedToName}` : ''}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Company */}
            <section className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Company</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Company Name *</Label>
                <Input placeholder="Acme Corp" list="crm-company-options" value={form.companyName} onChange={e => onCompanyChange(e.target.value)} className={inputCls} />
                <datalist id="crm-company-options">
                  {companies.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
                {matchedCompany && (
                  <p className="text-[9px] uppercase font-bold tracking-wider text-text-green">
                    Existing account · {companyContacts.length} contact{companyContacts.length === 1 ? '' : 's'} · {leads.filter(l => l.companyId === matchedCompany.id && l.id !== lead?.id).length} other deals
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Industry</Label>
                  <Select value={form.industry || undefined} onValueChange={v => set('industry', v)}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                      {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Website</Label>
                  <Input placeholder="acme.com" value={form.website} onChange={e => set('website', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Site Address</Label>
                <Input placeholder="123 Main St, Troy, MI" value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} />
              </div>
            </section>

            {/* Contact */}
            <section className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Primary Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Name</Label>
                  <Input placeholder="John Smith" list="crm-contact-options" value={form.contactName} onChange={e => onContactChange(e.target.value)} className={inputCls} />
                  <datalist id="crm-contact-options">
                    {companyContacts.map(c => <option key={c.id} value={c.name}>{c.title || ''}</option>)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Title</Label>
                  <Input placeholder="Facilities Manager" value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Email</Label>
                  <Input type="email" placeholder="john@acme.com" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Phone</Label>
                  <Input placeholder="(555) 123-4567" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Deal */}
            <section className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Deal</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Services in Scope</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICE_LINES.map(s => {
                    const on = form.serviceLines.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleService(s)}
                        className={cn(
                          'px-2.5 h-7 rounded-md border text-[9px] font-bold uppercase tracking-wider transition-colors',
                          on ? 'bg-brand-red/15 border-brand-red/40 text-text-primary' : 'border-border-main text-text-muted hover:text-text-primary',
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Est. Value ($)</Label>
                  <Input type="number" min="0" placeholder="0" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Win %</Label>
                  <Input type="number" min="0" max="100" placeholder={`${stageDefault} (stage)`} value={form.probability} onChange={e => set('probability', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Source</Label>
                  <Select value={form.source} onValueChange={v => set('source', v as Lead['source'])}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                      {SOURCES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Expected Close</Label>
                  <Input type="date" value={form.expectedCloseDate} onChange={e => set('expectedCloseDate', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Next Follow-Up</Label>
                  <Input type="date" value={form.followUpDate} onChange={e => set('followUpDate', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Next Step</Label>
                <Input placeholder="Schedule site walk with facilities" value={form.nextStep} onChange={e => set('nextStep', e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Tags</Label>
                <Input placeholder="multi-site, union, rush" value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Notes</Label>
                <Textarea placeholder="Initial context, referral info, scope details..." value={form.notes} onChange={e => set('notes', e.target.value)} className="text-xs bg-bg-tertiary border-border-main min-h-[80px]" />
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 p-6 pt-3 border-t border-border-sub">
          {editing && (
            <Button
              variant="ghost"
              size="sm"
              className="sm:mr-auto text-[10px] uppercase font-bold text-text-muted hover:text-text-red"
              onClick={() => setConfirmDelete(true)}
              disabled={saving || deleting}
            >
              <Trash2 size={12} className="mr-1.5" /> Delete Lead
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Target size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={v => !deleting && setConfirmDelete(v)}>
        <AlertDialogContent className="bg-bg-elevated border-border-main">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[13px] font-black uppercase tracking-widest">Delete {lead?.companyName}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-text-muted space-y-2">
              <span className="block">This permanently removes the lead and its activity timeline and tasks. It can't be undone.</span>
              {(lead?.quoteIds?.length || lead?.projectId) ? (
                <span className="block text-amber-400">
                  Its {[lead?.quoteIds?.length ? 'quotes' : '', lead?.projectId ? `ops project (${lead.projectId})` : ''].filter(Boolean).join(' and ')} will stay — delete those separately if needed.
                </span>
              ) : null}
              <span className="block">The account and its contacts are kept. If the deal just didn't work out, Mark Lost keeps it in your win/loss numbers instead.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="text-[10px] font-black uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-text-red hover:bg-text-red/90 text-white text-[10px] font-black uppercase"
              onClick={async e => {
                e.preventDefault();
                if (!lead) return;
                setDeleting(true);
                try {
                  await deleteLead(lead.id);
                  toast({ title: 'Lead deleted', description: lead.companyName });
                  setConfirmDelete(false);
                  onDeleted?.(lead.id);
                  onClose();
                } catch {
                  toast({ variant: 'destructive', title: 'Delete failed' });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting && <Loader2 size={12} className="animate-spin mr-1.5" />} Delete Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
