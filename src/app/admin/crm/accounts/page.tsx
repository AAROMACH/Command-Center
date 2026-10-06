'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import type { CrmCompany, CrmContact, Lead, Quote } from '@/lib/types';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import {
  Building2, Search, Plus, Target, Users, Phone, Mail, MapPin, Globe, Star, Pencil, Trash2, Loader2,
  DatabaseZap, FileText, ArrowLeft,
} from 'lucide-react';
import { INDUSTRIES, STAGES, isOpen, formatMoney } from '@/lib/crm';
import { useCrmPaths } from '@/lib/crm-paths';
import { CONTACT_ROLES, contactRoleLabel, saveCompany, saveContact, backfillAccountsFromLeads, findCompany } from '@/lib/crm-accounts';

const thCls = 'text-[9px] font-black uppercase tracking-widest text-text-muted';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-text-muted';
const inputCls = 'h-9 text-xs bg-bg-tertiary border-border-main';

type CompanyForm = { id?: string; name: string; industry: string; website: string; address: string; phone: string; notes: string };
type ContactForm = { id?: string; name: string; title: string; email: string; phone: string; role: string; notes: string };
const EMPTY_COMPANY: CompanyForm = { name: '', industry: '', website: '', address: '', phone: '', notes: '' };
const EMPTY_CONTACT: ContactForm = { name: '', title: '', email: '', phone: '', role: '', notes: '' };

export default function AccountsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const paths = useCrmPaths();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'pipeline' | 'won' | 'recent'>('pipeline');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, 'crmCompanies'), s => { setCompanies(s.docs.map(d => ({ ...d.data(), id: d.id } as CrmCompany))); setLoading(false); }, () => setLoading(false)),
      onSnapshot(collection(db, 'crmContacts'), s => setContacts(s.docs.map(d => ({ ...d.data(), id: d.id } as CrmContact)))),
      onSnapshot(collection(db, 'leads'), s => setLeads(s.docs.map(d => ({ ...d.data(), id: d.id } as Lead)))),
      onSnapshot(collection(db, 'quotes'), s => setQuotes(s.docs.map(d => ({ ...d.data(), id: d.id } as Quote))), () => {}),
    ];
    return () => subs.forEach(u => u());
  }, []);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return companies.map(c => {
      const deals = leads.filter(l => l.companyId === c.id);
      const cts = contacts.filter(x => x.companyId === c.id);
      return {
        company: c,
        contacts: cts,
        primary: cts.find(x => x.isPrimary) || cts[0],
        deals,
        openCount: deals.filter(isOpen).length,
        pipeline: deals.filter(isOpen).reduce((s, l) => s + (l.estimatedValue || 0), 0),
        won: deals.filter(l => l.stage === 'won').reduce((s, l) => s + (l.estimatedValue || 0), 0),
        last: deals.reduce((m, l) => ((l.lastActivityAt || l.updatedAt || '') > m ? (l.lastActivityAt || l.updatedAt || '') : m), c.updatedAt || ''),
      };
    }).filter(r => !q || [r.company.name, r.company.industry, r.company.address, ...r.contacts.flatMap(x => [x.name, x.email])]
      .some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === 'name' ? a.company.name.localeCompare(b.company.name)
        : sort === 'won' ? b.won - a.won
        : sort === 'recent' ? b.last.localeCompare(a.last)
        : b.pipeline - a.pipeline || b.won - a.won);
  }, [companies, contacts, leads, search, sort]);
  const pager = usePaged(rows, PAGE_SIZES_LARGE, 'crm-accounts', []);

  const unlinkedLeads = leads.filter(l => l.companyName?.trim() && !l.companyId).length;
  const selected = rows.find(r => r.company.id === selectedId) || null;
  const selectedQuotes = selected
    ? quotes.filter(q => (q.leadId && selected.deals.some(d => d.id === q.leadId)) || (q.customerCompany && findCompany([selected.company], q.customerCompany)))
    : [];

  async function runBackfill() {
    setBackfilling(true);
    try {
      const r = await backfillAccountsFromLeads(leads, companies, contacts);
      toast({ title: 'Accounts built', description: `${r.companies} companies, ${r.contacts} contacts created · ${r.leads} deals linked.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Backfill failed', description: e.message });
    } finally {
      setBackfilling(false);
    }
  }

  async function submitCompany() {
    if (!companyForm?.name.trim()) { toast({ variant: 'destructive', title: 'Company name required' }); return; }
    if (!companyForm.id && findCompany(companies, companyForm.name)) {
      toast({ variant: 'destructive', title: 'That account already exists' }); return;
    }
    setSaving(true);
    try {
      const { id, ...rest } = companyForm;
      const newId = await saveCompany(id ? { ...rest, id, name: rest.name.trim() } : { ...rest, name: rest.name.trim(), ownerId: user?.id, ownerName: user?.name });
      // Keep the copied company name on deals in step with a rename.
      if (id) {
        const old = companies.find(c => c.id === id);
        if (old && old.name !== rest.name.trim()) {
          const batch = writeBatch(db);
          leads.filter(l => l.companyId === id).forEach(l => batch.update(doc(db, 'leads', l.id), { companyName: rest.name.trim() }));
          await batch.commit();
        }
      }
      setCompanyForm(null);
      setSelectedId(newId);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function submitContact() {
    if (!selected || !contactForm?.name.trim()) { toast({ variant: 'destructive', title: 'Contact name required' }); return; }
    setSaving(true);
    try {
      const { id, role, ...rest } = contactForm;
      await saveContact({
        ...rest, ...(role ? { role: role as CrmContact['role'] } : {}), ...(id ? { id } : {}),
        name: rest.name.trim(), companyId: selected.company.id,
        ...(id ? {} : { isPrimary: selected.contacts.length === 0 }),
      });
      setContactForm(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(c: CrmContact) {
    if (!selected) return;
    const batch = writeBatch(db);
    selected.contacts.forEach(x => batch.update(doc(db, 'crmContacts', x.id), { isPrimary: x.id === c.id }));
    await batch.commit();
  }

  async function removeContact(c: CrmContact) {
    if (!confirm(`Remove ${c.name} from this account?`)) return;
    try {
      await deleteDoc(doc(db, 'crmContacts', c.id));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  }

  return (
    <div className="space-y-5 min-h-full">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Target size={12} /> Sales Intelligence</p>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Companies, their people, and every deal you've worked with them.</p>
        </div>
        <div className="page-header-right gap-2">
          <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main" onClick={() => router.push(paths.pipeline)}>
            <ArrowLeft size={12} className="mr-1.5" /> Pipeline
          </Button>
          <Button size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setCompanyForm(EMPTY_COMPANY)}>
            <Plus size={12} className="mr-1.5" /> New Account
          </Button>
        </div>
      </header>

      {unlinkedLeads > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-400/30 bg-amber-400/10">
          <DatabaseZap size={16} className="text-amber-400 shrink-0" />
          <p className="text-[11px] text-text-secondary flex-1">
            <span className="font-black text-amber-400">{unlinkedLeads} deals</span> aren't attached to an account yet.
            Build accounts from them — deals with the same company name are grouped, and each contact is added once.
          </p>
          <Button size="sm" onClick={runBackfill} disabled={backfilling} className="h-8 text-[10px] font-bold uppercase bg-amber-500 hover:bg-amber-500/90 text-white">
            {backfilling ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Build Accounts
          </Button>
        </div>
      )}

      <div className="bg-bg-secondary p-3 rounded-xl border border-border-sub flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red"
            placeholder="Search accounts or contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="h-9 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase tracking-widest"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pipeline" className="text-[10px] uppercase font-bold">Open Pipeline</SelectItem>
            <SelectItem value="won" className="text-[10px] uppercase font-bold">Won Revenue</SelectItem>
            <SelectItem value="recent" className="text-[10px] uppercase font-bold">Recent Activity</SelectItem>
            <SelectItem value="name" className="text-[10px] uppercase font-bold">Name</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-auto">{companies.length} accounts · {contacts.length} contacts</span>
      </div>

      <div className="rounded-xl border border-border-sub overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border-sub">
              <TableHead className={thCls}>Account</TableHead>
              <TableHead className={thCls}>Primary Contact</TableHead>
              <TableHead className={thCls}>Contacts</TableHead>
              <TableHead className={thCls}>Open Deals</TableHead>
              <TableHead className={thCls}>Pipeline</TableHead>
              <TableHead className={thCls}>Won</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.items.map(r => (
              <TableRow key={r.company.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => setSelectedId(r.company.id)}>
                <TableCell className="font-bold text-[11px] uppercase text-text-primary">
                  {r.company.name}
                  {r.company.industry && <span className="block text-[9px] font-normal normal-case text-text-muted">{r.company.industry}</span>}
                </TableCell>
                <TableCell className="text-[10px] text-text-muted">
                  {r.primary ? <>{r.primary.name}{r.primary.title && <span className="block text-[9px]">{r.primary.title}</span>}</> : '—'}
                </TableCell>
                <TableCell className="text-[10px] font-bold text-text-primary">{r.contacts.length}</TableCell>
                <TableCell className="text-[10px] font-bold text-text-primary">{r.openCount}</TableCell>
                <TableCell className="text-[11px] font-black font-mono text-text-primary">{r.pipeline ? formatMoney(r.pipeline) : '—'}</TableCell>
                <TableCell className="text-[11px] font-black font-mono text-text-green">{r.won ? formatMoney(r.won) : '—'}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">
                {companies.length ? 'No matches' : 'No accounts yet'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <ListPager pager={pager} noun="accounts" />
      </div>

      {/* Account detail */}
      <Sheet open={!!selected} onOpenChange={v => !v && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl bg-bg-secondary border-border-main overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="pb-4 border-b border-border-sub">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-brand-red/10 rounded-lg shrink-0"><Building2 size={18} className="text-brand-red" /></div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-sm font-black uppercase tracking-widest text-text-primary">{selected.company.name}</SheetTitle>
                    <SheetDescription className="text-[10px] text-text-muted uppercase tracking-wider">
                      {[selected.company.industry, selected.company.ownerName && `Owner: ${selected.company.ownerName}`].filter(Boolean).join(' · ') || 'Account'}
                    </SheetDescription>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase"
                    onClick={() => setCompanyForm({
                      id: selected.company.id, name: selected.company.name, industry: selected.company.industry || '',
                      website: selected.company.website || '', address: selected.company.address || '',
                      phone: selected.company.phone || '', notes: selected.company.notes || '',
                    })}>
                    <Pencil size={10} className="mr-1.5" /> Edit
                  </Button>
                </div>
              </SheetHeader>

              <div className="py-5 space-y-6">
                <div className="grid grid-cols-3 gap-2">
                  {([['Open Pipeline', formatMoney(selected.pipeline)], ['Won Revenue', formatMoney(selected.won)], ['Deals', String(selected.deals.length)]] as [string, string][]).map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-border-sub bg-bg-primary px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{l}</p>
                      <p className="text-[13px] font-black text-text-primary tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {selected.company.phone && <a href={`tel:${selected.company.phone}`} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"><Phone size={11} className="text-brand-red" />{selected.company.phone}</a>}
                  {selected.company.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(selected.company.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"><MapPin size={11} className="text-brand-red" />{selected.company.address}</a>}
                  {selected.company.website && <a href={selected.company.website.startsWith('http') ? selected.company.website : `https://${selected.company.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"><Globe size={11} className="text-brand-red" />{selected.company.website}</a>}
                  {selected.company.notes && <p className="text-xs text-text-muted whitespace-pre-wrap pt-1">{selected.company.notes}</p>}
                </div>

                {/* Contacts */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5"><Users size={10} /> Contacts ({selected.contacts.length})</p>
                    <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setContactForm(EMPTY_CONTACT)}>
                      <Plus size={10} className="mr-1" /> Add Contact
                    </Button>
                  </div>
                  {selected.contacts.length === 0 && <p className="text-[10px] text-text-muted uppercase tracking-wider">No contacts yet.</p>}
                  {[...selected.contacts].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary) || a.name.localeCompare(b.name)).map(c => (
                    <div key={c.id} className="rounded-lg border border-border-sub bg-bg-primary p-3 group">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black uppercase text-text-primary flex items-center gap-1.5">
                            {c.name}
                            {c.isPrimary && <Star size={10} className="text-amber-400 fill-amber-400" />}
                          </p>
                          <p className="text-[10px] text-text-muted">{[c.title, contactRoleLabel(c.role)].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!c.isPrimary && <button title="Make primary" onClick={() => makePrimary(c)} className="p-1 text-text-muted hover:text-amber-400"><Star size={11} /></button>}
                          <button title="Edit" onClick={() => setContactForm({ id: c.id, name: c.name, title: c.title || '', email: c.email || '', phone: c.phone || '', role: c.role || '', notes: c.notes || '' })} className="p-1 text-text-muted hover:text-text-primary"><Pencil size={11} /></button>
                          <button title="Remove" onClick={() => removeContact(c)} className="p-1 text-text-muted hover:text-text-red"><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"><Phone size={9} />{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"><Mail size={9} />{c.email}</a>}
                      </div>
                      {c.notes && <p className="text-[10px] text-text-muted mt-1">{c.notes}</p>}
                    </div>
                  ))}
                </div>

                {/* Deals */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5"><Target size={10} /> Deals ({selected.deals.length})</p>
                    <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => router.push(`${paths.pipeline}?newDealFor=${selected.company.id}`)}>
                      <Plus size={10} className="mr-1" /> New Deal
                    </Button>
                  </div>
                  {[...selected.deals].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(d => {
                    const s = STAGES.find(x => x.key === d.stage);
                    return (
                      <button key={d.id} onClick={() => router.push(`${paths.pipeline}?lead=${d.id}`)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border-sub bg-bg-primary hover:border-border-main text-left">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] font-bold text-text-primary truncate">{(d.serviceLines || []).join(' / ') || d.nextStep || 'Deal'}</span>
                          <span className="block text-[9px] text-text-muted">{d.contactName}{d.createdAt ? ` · ${d.createdAt.slice(0, 10)}` : ''}</span>
                        </span>
                        <span className="text-[11px] font-black tabular-nums text-text-green">{d.estimatedValue ? formatMoney(d.estimatedValue) : '—'}</span>
                        <Badge className={cn('text-[8px] h-5 uppercase border border-current/20', s?.bg, s?.color)}>{s?.label}</Badge>
                      </button>
                    );
                  })}
                </div>

                {/* Quotes */}
                {selectedQuotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5"><FileText size={10} /> Quotes ({selectedQuotes.length})</p>
                    {selectedQuotes.map(q => (
                      <button key={q.id} onClick={() => router.push(paths.quotes)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border-sub bg-bg-primary hover:border-border-main text-left">
                        <span className="flex-1 min-w-0 text-[11px] font-bold text-text-primary truncate">{q.title}</span>
                        <span className="text-[11px] font-black tabular-nums text-text-green">{formatMoney(q.total || 0)}</span>
                        <span className="text-[8px] font-black uppercase text-text-muted">{q.status.replace(/_/g, ' ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Company form */}
      <Dialog open={!!companyForm} onOpenChange={v => !v && setCompanyForm(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-lg">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-widest">{companyForm?.id ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
          {companyForm && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label className={labelCls}>Company Name *</Label><Input value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Industry</Label>
                  <Select value={companyForm.industry || undefined} onValueChange={v => setCompanyForm({ ...companyForm, industry: v })}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className={labelCls}>Main Phone</Label><Input value={companyForm.phone} onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="space-y-1.5"><Label className={labelCls}>Website</Label><Input value={companyForm.website} onChange={e => setCompanyForm({ ...companyForm, website: e.target.value })} className={inputCls} /></div>
              <div className="space-y-1.5"><Label className={labelCls}>Address</Label><Input value={companyForm.address} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })} className={inputCls} /></div>
              <div className="space-y-1.5"><Label className={labelCls}>Notes</Label><Textarea value={companyForm.notes} onChange={e => setCompanyForm({ ...companyForm, notes: e.target.value })} className="text-xs bg-bg-tertiary border-border-main" /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setCompanyForm(null)}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={submitCompany} disabled={saving}>
              {saving && <Loader2 size={12} className="animate-spin mr-1.5" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact form */}
      <Dialog open={!!contactForm} onOpenChange={v => !v && setContactForm(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-lg">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-widest">{contactForm?.id ? 'Edit Contact' : 'Add Contact'}</DialogTitle></DialogHeader>
          {contactForm && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className={labelCls}>Name *</Label><Input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} className={inputCls} /></div>
                <div className="space-y-1.5"><Label className={labelCls}>Title</Label><Input value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })} className={inputCls} /></div>
                <div className="space-y-1.5"><Label className={labelCls}>Email</Label><Input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} className={inputCls} /></div>
                <div className="space-y-1.5"><Label className={labelCls}>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Role in the Deal</Label>
                <Select value={contactForm.role || undefined} onValueChange={v => setContactForm({ ...contactForm, role: v })}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">{CONTACT_ROLES.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className={labelCls}>Notes</Label><Input value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} className={inputCls} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setContactForm(null)}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={submitContact} disabled={saving}>
              {saving && <Loader2 size={12} className="animate-spin mr-1.5" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
