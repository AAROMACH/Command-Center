'use client';

import { useState, useMemo, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { NewRequestDialog } from './components/new-request-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Inbox, Plus, Clock, MapPin, Building2, User, Calendar,
  CheckCircle2, XCircle, Loader2, UserCheck, ShieldCheck,
  Briefcase, Search, ExternalLink, Phone, Mail, FileText,
  Globe, ChevronDown, LayoutGrid, LayoutList, RefreshCw,
  AlertCircle, MoreHorizontal, AlertTriangle, Paperclip,
} from 'lucide-react';
import type {
  ServiceRequest, WorkOrder, TimeOffRequest, SiteRequest,
  Technician, NewServiceRequest, ClientIntakeRequest,
} from '@/lib/types';
import type { AppRole } from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────────
const ALL_ROLES: AppRole[] = [
  'super_admin','dispatch_admin','payroll_admin','project_manager',
  'project_lead','field_technician','client','sales',
  'safety_officer','training_coordinator',
];

function priorityCls(p: string) {
  const l = p?.toLowerCase();
  if (l === 'critical' || l === 'urgent') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (l === 'high') return 'bg-orange-400/10 text-orange-400 border-orange-400/30';
  if (l === 'medium') return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
  return 'bg-bg-tertiary text-text-muted border-border-sub';
}

function statusCls(s: string) {
  const l = s?.toLowerCase();
  if (l === 'approved' || l === 'converted_to_client' || l === 'converted_to_work_order' || l === 'converted_to_project') return 'bg-text-green/10 text-text-green border-text-green/30';
  if (l === 'denied' || l === 'rejected') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (l === 'archived' || l === 'closed') return 'bg-bg-tertiary text-text-muted border-border-sub';
  if (l === 'reviewed' || l === 'contacted' || l === 'needs_more_info') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
}

const KIND_CFG = {
  service:   { label: 'Service',        cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  client:    { label: 'Client',         cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  personnel: { label: 'Personnel',      cls: 'bg-amber-400/10 text-amber-400 border-amber-400/30' },
  access:    { label: 'Account Access', cls: 'bg-text-green/10 text-text-green border-text-green/30' },
  subscription: { label: 'Subscription', cls: 'bg-bg-tertiary text-text-muted border-border-sub' },
} as const;

type Kind = keyof typeof KIND_CFG;

function Pill({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={cn('text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[8px] font-black min-w-[16px] h-4 px-1 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
  } catch { return iso; }
}

function mapSource(raw?: string): 'App' | 'Google Form' | 'Manual' {
  if (!raw) return 'App';
  const l = raw.toLowerCase();
  if (l.includes('google') || l.includes('public') || l.includes('form')) return 'Google Form';
  if (l.includes('manual') || l.includes('admin')) return 'Manual';
  return 'App';
}

function priorityLabel(p: string) {
  const l = p?.toLowerCase();
  if (l === 'critical') return 'Critical';
  if (l === 'high' || l === 'urgent') return 'Urgent';
  if (l === 'medium') return 'Normal';
  if (l === 'low') return 'Low';
  return 'Normal';
}

// ── Normalized item (unified "All" tab) ───────────────────────────────────────
type NormalizedItem = {
  id: string;
  kind: Kind;
  title: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  source: 'App' | 'Google Form' | 'Manual';
  date: string;
  description: string;
  status: string;
  priority: string;
  rawServiceReq?: NewServiceRequest;
  rawClientReq?: ClientIntakeRequest;
  rawTimeOff?: TimeOffRequest;
  rawUser?: Technician;
};

// ── Timeline ──────────────────────────────────────────────────────────────────
function RequestTimeline({ item }: { item: NormalizedItem }) {
  const status = item.status;
  const isApproved = ['approved','converted_to_work_order','converted_to_project','converted_to_client'].includes(status);
  const isConverted = ['converted_to_work_order','converted_to_project','converted_to_client'].includes(status);
  const isArchived = ['archived','closed'].includes(status);

  const steps = [
    { label: 'Submitted', detail: fmtDate(item.date, true), done: true, active: false },
    { label: 'Received', detail: fmtDate(item.date, true), done: true, active: false },
    { label: 'Under Review', detail: status === 'reviewed' || status === 'contacted' ? 'Admin' : undefined, done: status === 'reviewed' || status === 'contacted', active: status === 'pending_review' || status === 'needs_more_info' },
    { label: 'Approved', detail: undefined, done: isApproved, active: false },
    { label: 'Converted to Job', detail: undefined, done: isConverted, active: false },
    { label: 'Archived', detail: undefined, done: isArchived, active: false },
  ];

  return (
    <div className="space-y-4">
      {steps.map(step => (
        <div key={step.label} className="flex items-start gap-2.5">
          <div className={cn(
            'mt-0.5 h-2.5 w-2.5 rounded-full border-2 shrink-0',
            step.done ? 'bg-brand-red border-brand-red' :
            step.active ? 'bg-transparent border-amber-400' :
            'bg-transparent border-border-sub'
          )} />
          <div>
            <p className={cn('text-[9px] font-bold uppercase tracking-widest', step.done ? 'text-text-primary' : step.active ? 'text-amber-400' : 'text-text-muted')}>
              {step.label}
            </p>
            {step.detail && <p className="text-[8px] text-text-muted mt-0.5">{step.detail}</p>}
            {!step.done && !step.detail && <p className="text-[8px] text-text-muted mt-0.5">—</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Unified detail sheet (All tab) ────────────────────────────────────────────
function RequestDetailSheet({
  item, onClose, onApprove, onReject, onConvert,
}: {
  item: NormalizedItem | null;
  onClose: () => void;
  onApprove: (item: NormalizedItem) => Promise<void>;
  onReject: (item: NormalizedItem) => Promise<void>;
  onConvert: (item: NormalizedItem) => void;
}) {
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [acting, setActing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (item) setNoteText(item.rawServiceReq?.internalNotes || (item.rawClientReq as any)?.internalNotes || '');
  }, [item?.id]);

  if (!item) return null;
  const kindCfg = KIND_CFG[item.kind];
  const isPending = ['pending_review','pending','contacted','needs_more_info'].includes(item.status);
  const sr = item.rawServiceReq;

  const saveNote = async () => {
    if (!sr) return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'serviceRequests', sr.id), { internalNotes: noteText, updatedAt: new Date().toISOString() });
      toast({ title: 'Note saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setSavingNote(false); }
  };

  return (
    <Sheet open={!!item} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[640px] max-w-full bg-bg-secondary border-border-main p-0 flex flex-col"
      >
        {/* Tags + title */}
        <div className="px-6 pt-5 pb-4 border-b border-border-sub shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <Pill cls={kindCfg.cls} label={item.kind === 'service' ? 'Service Request' : kindCfg.label} />
            <Pill cls={statusCls(item.status)} label={item.status.replace(/_/g, ' ')} />
            {item.priority && item.priority !== 'normal' && (
              <Pill cls={priorityCls(item.priority)} label={priorityLabel(item.priority)} />
            )}
          </div>
          <h2 className="text-[17px] font-black text-text-primary leading-tight">{item.title}</h2>
          {item.id && <p className="text-[9px] text-text-muted font-mono mt-1">Request # {item.id.toUpperCase()}</p>}
          <div className="flex items-center gap-6 mt-3 flex-wrap">
            <div>
              <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Submitted</p>
              <p className="text-[10px] text-text-primary">{fmtDate(item.date, true)}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Source</p>
              <p className="text-[10px] text-text-primary">{item.source}</p>
            </div>
            {item.priority && (
              <div>
                <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Priority</p>
                <p className={cn('text-[10px] font-bold', item.priority === 'critical' || item.priority === 'high' ? 'text-brand-red' : 'text-text-primary')}>
                  {priorityLabel(item.priority)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Body — two-column */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Contact */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Contact Information</p>
                <p className="text-[13px] font-bold text-text-primary">{item.contactName}</p>
                {item.company && <p className="text-[11px] text-text-secondary">{item.company}</p>}
                {item.phone && <p className="text-[11px] text-text-muted flex items-center gap-1.5 mt-1.5"><Phone size={10} />{item.phone}</p>}
                {item.email && <p className="text-[11px] text-text-muted flex items-center gap-1.5"><Mail size={10} />{item.email}</p>}
                {sr?.preferredContactMethod && (
                  <p className="text-[10px] text-text-muted mt-0.5">Preferred: {sr.preferredContactMethod}</p>
                )}
              </div>

              {/* Request Details */}
              {(item.description || sr?.serviceTypes?.length) && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Request Details</p>
                  {item.description && <p className="text-[11px] text-text-secondary leading-relaxed">{item.description}</p>}
                  {sr?.serviceTypes && sr.serviceTypes.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Requested Services</p>
                      <ul className="space-y-0.5">
                        {sr.serviceTypes.map(t => (
                          <li key={t} className="text-[11px] text-text-secondary flex items-start gap-1.5">
                            <span className="inline-block h-1 w-1 rounded-full bg-text-muted shrink-0 mt-[5px]" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sr?.bestAvailability && (
                    <p className="text-[10px] text-text-muted mt-2"><span className="font-bold">Preferred Window</span> {sr.bestAvailability}</p>
                  )}
                  {sr?.serviceLocation && (
                    <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1.5"><MapPin size={10} />{sr.serviceLocation}</p>
                  )}
                </div>
              )}

              {/* Attachments */}
              {sr?.supportingFiles && sr.supportingFiles.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Attachments</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {sr.supportingFiles.slice(0, 3).map((f, i) => (
                      <a key={i} href={(f as any).downloadUrl || '#'} target="_blank" rel="noreferrer"
                        className="h-14 w-14 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center overflow-hidden hover:border-border-main transition-colors">
                        {(f as any).downloadUrl && (f as any).fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={(f as any).downloadUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FileText size={18} className="text-text-muted" />
                        )}
                      </a>
                    ))}
                    {sr.supportingFiles.length > 3 && (
                      <div className="h-14 w-14 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center">
                        <span className="text-[11px] font-bold text-text-muted">+{sr.supportingFiles.length - 3}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Internal Notes */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Internal Notes</p>
                {noteText && (
                  <div className="mb-3 flex items-start gap-2">
                    <div className="h-6 w-6 rounded-full bg-brand-red/20 flex items-center justify-center shrink-0">
                      <User size={10} className="text-brand-red" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-text-muted">Admin · {fmtDate(item.date, true)}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{noteText}</p>
                    </div>
                  </div>
                )}
                {sr && (
                  <div className="space-y-1.5">
                    <textarea
                      rows={3}
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="+ Add internal note..."
                      className="w-full text-[11px] bg-bg-tertiary border border-border-main rounded-lg p-2.5 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40"
                    />
                    <Button size="sm" variant="outline" className="text-[9px] h-7 font-bold uppercase tracking-widest" onClick={saveNote} disabled={savingNote}>
                      {savingNote ? <Loader2 size={10} className="animate-spin mr-1" /> : null}
                      Save Note
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Timeline column */}
          <div className="w-[170px] shrink-0 border-l border-border-sub p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-4">Timeline</p>
            <RequestTimeline item={item} />
          </div>
        </div>

        {/* Bottom action bar */}
        {isPending && (
          <div className="border-t border-border-sub p-4 flex gap-2.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-[9px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
              disabled={acting}
              onClick={async () => { setActing(true); await onReject(item); setActing(false); }}
            >
              <XCircle size={12} className="mr-1.5" />Reject
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 text-[9px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
              disabled={acting}
              onClick={async () => { setActing(true); await onApprove(item); setActing(false); }}
            >
              <CheckCircle2 size={12} className="mr-1.5" />Approve
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 text-[9px] font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white"
              disabled={acting}
              onClick={() => onConvert(item)}
            >
              <Briefcase size={12} className="mr-1.5" />Convert to Job
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Unified card (All tab) ────────────────────────────────────────────────────
function UnifiedRequestCard({
  item, onOpen, onApprove, onReject,
}: {
  item: NormalizedItem;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const kindCfg = KIND_CFG[item.kind];
  const pLabel = priorityLabel(item.priority);
  const statusDisplay = item.status.replace(/_/g, ' ');

  const primaryActionLabel = item.kind === 'client' ? 'Approve Client'
    : item.kind === 'access' ? 'Approve User'
    : item.kind === 'subscription' ? 'Create Quote'
    : 'Approve';

  return (
    <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3 hover:border-border-main transition-colors flex flex-col">
      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill cls={kindCfg.cls} label={kindCfg.label} />
        <Pill cls={statusCls(item.status)} label={statusDisplay} />
        {item.priority && item.priority !== 'medium' && item.priority !== 'normal' && (
          <Pill cls={priorityCls(item.priority)} label={pLabel} />
        )}
      </div>

      {/* Title + company + contact */}
      <div className="space-y-0.5">
        <p className="text-[13px] font-bold text-text-primary leading-snug">{item.title}</p>
        {item.company && <p className="text-[10px] text-text-secondary">{item.company}</p>}
        {item.contactName && item.contactName !== item.title && (
          <p className="text-[10px] text-text-muted">{item.contactName}</p>
        )}
      </div>

      {/* Phone + email */}
      {(item.phone || item.email) && (
        <div className="flex items-center gap-3 flex-wrap">
          {item.phone && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Phone size={8} className="shrink-0" />{item.phone}
            </span>
          )}
          {item.email && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted truncate">
              <Mail size={8} className="shrink-0" />{item.email}
            </span>
          )}
        </div>
      )}

      {/* Source + date */}
      <p className="text-[9px] text-text-muted">
        Source: {item.source} · {fmtDate(item.date, true)}
      </p>

      {/* Description */}
      {item.description && (
        <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{item.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border-sub mt-auto flex-wrap">
        <Button size="sm" variant="outline"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest"
          onClick={onOpen}>
          <FileText size={9} className="mr-1" />Open
        </Button>
        <Button size="sm"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
          onClick={item.kind === 'access' ? onOpen : onApprove}>
          <CheckCircle2 size={9} className="mr-1" />{primaryActionLabel}
        </Button>
        <Button size="sm" variant="outline"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
          onClick={onReject}>
          <XCircle size={9} className="mr-1" />Reject
        </Button>
        <button type="button" className="ml-auto h-7 w-7 flex items-center justify-center rounded-md border border-border-sub hover:bg-bg-tertiary transition-colors shrink-0">
          <MoreHorizontal size={12} className="text-text-muted" />
        </button>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, count, icon: Icon, description, variant = 'default' }: {
  label: string; count: number; icon: React.ElementType;
  description: string; variant?: 'default' | 'urgent' | 'approved' | 'muted';
}) {
  const iconCls = variant === 'urgent' ? 'text-brand-red' : variant === 'approved' ? 'text-text-green' : 'text-text-muted';
  const countCls = variant === 'urgent' ? 'text-brand-red' : variant === 'approved' ? 'text-text-green' : 'text-text-primary';
  return (
    <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-1.5">
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">{label}</p>
        <Icon size={14} className={iconCls} />
      </div>
      <p className={cn('text-[28px] font-black leading-none', countCls)}>{count}</p>
      <p className="text-[9px] text-text-muted">{description}</p>
    </div>
  );
}

// ── Filter chip row ───────────────────────────────────────────────────────────
function FilterGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest mr-0.5">{label}:</span>
      {options.map(o => (
        <button key={o.value} type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
            value === o.value
              ? 'bg-bg-tertiary text-text-primary border-border-main'
              : 'text-text-muted border-border-sub hover:border-border-main hover:text-text-secondary'
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── PersonnelTab ──────────────────────────────────────────────────────────────
function PersonnelTab({ requests, technicians, viewMode = 'grid' }: {
  requests: TimeOffRequest[]; technicians: Technician[]; viewMode?: 'grid' | 'list';
}) {
  const { toast } = useToast();
  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  const approve = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'approved' });
    toast({ title: 'Time Off Approved' });
  };
  const deny = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'denied' });
    toast({ title: 'Request Denied', variant: 'destructive' } as any);
  };

  const card = (req: TimeOffRequest, showActions: boolean) => {
    const tech = technicians.find(t => t.id === req.techId);
    const initials = tech?.name?.split(' ').map(n => n[0]).join('') || '??';
    return (
      <div key={req.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarImage src={(tech as any)?.avatarUrl} />
            <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-text-primary">{tech?.name || req.techId}</p>
            <p className="text-[10px] text-text-muted">{req.type} · {req.startDate} – {req.endDate}</p>
          </div>
          <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0', statusCls(req.status))}>
            {req.status}
          </span>
        </div>
        {req.reason && (
          <p className="text-[11px] text-text-secondary italic border-l-2 border-border-sub pl-3">&ldquo;{req.reason}&rdquo;</p>
        )}
        {showActions && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white" onClick={() => approve(req.id)}>
              <CheckCircle2 size={12} className="mr-1.5" />Approve
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5" onClick={() => deny(req.id)}>
              <XCircle size={12} className="mr-1.5" />Deny
            </Button>
          </div>
        )}
      </div>
    );
  };

  const listRow = (req: TimeOffRequest, showActions: boolean) => {
    const tech = technicians.find(t => t.id === req.techId);
    const initials = tech?.name?.split(' ').map(n => n[0]).join('') || '??';
    return (
      <div key={req.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarImage src={(tech as any)?.avatarUrl} />
          <AvatarFallback className="text-[9px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-bold text-text-primary">{tech?.name || req.techId}</span>
          <span className="text-[10px] text-text-muted ml-2">{req.type} · {req.startDate} – {req.endDate}</span>
        </div>
        {req.reason && <p className="hidden md:block text-[10px] text-text-muted truncate max-w-[200px] italic">{req.reason}</p>}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase', statusCls(req.status))}>{req.status}</span>
          {showActions && (
            <>
              <Button size="sm" className="h-6 px-2 text-[9px] font-bold bg-text-green hover:bg-text-green/90 text-white" onClick={() => approve(req.id)}><CheckCircle2 size={10} className="mr-1" />Approve</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] font-bold border-brand-red/30 text-brand-red hover:bg-brand-red/5" onClick={() => deny(req.id)}><XCircle size={10} className="mr-1" />Deny</Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (items: TimeOffRequest[], label: string, showActions: boolean) => (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">{label} ({items.length})</p>
      {viewMode === 'list'
        ? <div className="space-y-1">{items.map(r => listRow(r, showActions))}</div>
        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{items.map(r => card(r, showActions))}</div>
      }
    </div>
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && renderGroup(pending, 'Pending', true)}
      {resolved.length > 0 && renderGroup(resolved, 'Resolved', false)}
      {requests.length === 0 && (
        <div className="py-16 text-center text-text-muted">
          <Calendar size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No time-off requests</p>
        </div>
      )}
    </div>
  );
}

// ── AccountAccessTab ──────────────────────────────────────────────────────────
function AccountAccessTab({ pendingUsers }: { pendingUsers: Technician[] }) {
  const { toast } = useToast();
  const [approveTarget, setApproveTarget] = useState<Technician | null>(null);
  const [denyTarget, setDenyTarget] = useState<Technician | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [primaryRole, setPrimaryRole] = useState<AppRole | ''>('');
  const [denyReason, setDenyReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);

  const toggleRole = (role: AppRole) =>
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const handleApprove = async () => {
    if (!approveTarget || selectedRoles.length === 0 || !primaryRole) return;
    setApproving(true);
    try {
      const adminUid = auth.currentUser?.uid || '';
      await updateDoc(doc(db, 'users', approveTarget.id), {
        roles: selectedRoles, role: primaryRole, primaryRole,
        approvalStatus: 'approved', status: 'active',
        approvedAt: new Date().toISOString(), approvedBy: adminUid, updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Granted', description: `${approveTarget.name} approved as ${primaryRole}.` });
      setApproveTarget(null); setSelectedRoles([]); setPrimaryRole('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setApproving(false); }
  };

  const handleDeny = async () => {
    if (!denyTarget) return;
    setDenying(true);
    try {
      await updateDoc(doc(db, 'users', denyTarget.id), {
        approvalStatus: 'denied', status: 'inactive',
        deniedAt: new Date().toISOString(), deniedBy: auth.currentUser?.uid || '',
        denialReason: denyReason.trim(), updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Denied' });
      setDenyTarget(null); setDenyReason('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setDenying(false); }
  };

  return (
    <>
      {pendingUsers.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <ShieldCheck size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No pending account requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendingUsers.map(user => {
            const initials = user.name?.split(' ').map(n => n[0]).join('') || '??';
            return (
              <div key={user.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={(user as any).photoURL || (user as any).avatarUrl} />
                    <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-text-primary truncate">{user.name || 'Unknown'}</p>
                    <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0 bg-amber-400/10 text-amber-400 border-amber-400/30">Pending</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-[9px] font-bold">
                    {(user as any).createdVia === 'google_sso' ? 'Google SSO' : 'Email'}
                  </span>
                  {(user as any).requestedAt && <span>Requested {fmtDate((user as any).requestedAt)}</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
                    onClick={() => { setApproveTarget(user); setSelectedRoles([]); setPrimaryRole(''); }}>
                    <UserCheck size={12} className="mr-1.5" />Approve User
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => { setDenyTarget(user); setDenyReason(''); }}>
                    <XCircle size={12} className="mr-1.5" />Deny
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!approveTarget} onOpenChange={v => !v && setApproveTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">Assign Role — {approveTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Roles</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox id={`role-${role}`} checked={selectedRoles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    <Label htmlFor={`role-${role}`} className="text-[10px] font-bold uppercase cursor-pointer">{role.replace(/_/g, ' ')}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Primary Role</p>
              <Select value={primaryRole} onValueChange={v => setPrimaryRole(v as AppRole)} disabled={selectedRoles.length === 0}>
                <SelectTrigger className="h-8 text-[11px] bg-bg-tertiary border-border-main"><SelectValue placeholder="Select primary role" /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {selectedRoles.map(r => <SelectItem key={r} value={r} className="text-[10px] font-bold uppercase">{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setApproveTarget(null)} disabled={approving}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-text-green hover:bg-text-green/90 text-white"
              onClick={handleApprove} disabled={approving || selectedRoles.length === 0 || !primaryRole}>
              {approving && <Loader2 size={11} className="animate-spin mr-1.5" />}{approving ? 'Granting...' : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!denyTarget} onOpenChange={v => !v && setDenyTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">Deny Access — {denyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Reason (optional)</Label>
            <textarea rows={3} value={denyReason} onChange={e => setDenyReason(e.target.value)}
              placeholder="Explain why access is being denied..."
              className="mt-1.5 w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setDenyTarget(null)} disabled={denying}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={handleDeny} disabled={denying}>
              {denying && <Loader2 size={11} className="animate-spin mr-1.5" />}{denying ? 'Denying...' : 'Deny Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── NewServiceTab ─────────────────────────────────────────────────────────────
function NewServiceTab({ requests, viewMode = 'grid' }: { requests: NewServiceRequest[]; viewMode?: 'grid' | 'list' }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<NewServiceRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const pending = requests.filter(r => ['pending_review','contacted','needs_more_info'].includes(r.status));
  const resolved = requests.filter(r => !['pending_review','contacted','needs_more_info'].includes(r.status));

  const updateStatus = async (id: string, status: string, extra?: Record<string, unknown>) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        status, reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra,
      });
      toast({ title: 'Updated' }); setSelected(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'serviceRequests', selected.id), { internalNotes: notes, updatedAt: new Date().toISOString() });
      toast({ title: 'Notes Saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const pCls = (p: string) => priorityCls(p);

  const listRow = (req: NewServiceRequest) => (
    <button key={req.id} type="button" onClick={() => { setSelected(req); setNotes(req.internalNotes || ''); }}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors text-left">
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-bold text-text-primary">{req.serviceTypes?.[0] || req.fullName}</span>
        {req.companyName && <span className="text-[10px] text-text-muted ml-2">{req.companyName}</span>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', pCls(req.priorityLevel))}>{req.priorityLevel}</span>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>{req.status.replace(/_/g, ' ')}</span>
      </div>
    </button>
  );

  const card = (req: NewServiceRequest) => (
    <button key={req.id} type="button" onClick={() => { setSelected(req); setNotes(req.internalNotes || ''); }}
      className="w-full rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-2.5 text-left hover:border-border-main transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text-primary truncate">{req.serviceTypes?.[0] || req.fullName}</p>
          {req.companyName && <p className="text-[10px] text-text-muted truncate">{req.companyName}</p>}
          <p className="text-[10px] text-text-muted">{req.fullName}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', pCls(req.priorityLevel))}>{req.priorityLevel}</span>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>{req.status.replace(/_/g, ' ')}</span>
        </div>
      </div>
      {req.phoneNumber && (
        <p className="text-[9px] text-text-muted flex items-center gap-1"><Phone size={8} />{req.phoneNumber}</p>
      )}
      <p className="text-[9px] text-text-muted">Source: {mapSource(req.source)} · {fmtDate(req.createdAt, true)}</p>
      {req.detailedDescription && (
        <p className="text-[10px] text-text-secondary line-clamp-2 leading-relaxed">{req.detailedDescription}</p>
      )}
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-text-muted uppercase tracking-wider">Inbound service requests from the public form</p>
        <a href="/public/service-request" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider">
            <ExternalLink size={12} className="mr-1.5" />View Form
          </Button>
        </a>
      </div>
      <div className="space-y-6">
        {pending.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Pending Review ({pending.length})</p>
            {viewMode === 'list'
              ? <div className="space-y-1">{pending.map(r => listRow(r))}</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{pending.map(r => card(r))}</div>
            }
          </div>
        )}
        {resolved.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Resolved ({resolved.length})</p>
            {viewMode === 'list'
              ? <div className="space-y-1">{resolved.map(r => listRow(r))}</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{resolved.map(r => card(r))}</div>
            }
          </div>
        )}
        {requests.length === 0 && (
          <div className="py-16 text-center text-text-muted">
            <FileText size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-[11px]">No service requests</p>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
          {selected && (
            <div className="py-4 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <Pill cls="bg-blue-500/10 text-blue-400 border-blue-500/30" label="Service Request" />
                  <Pill cls={statusCls(selected.status)} label={selected.status.replace(/_/g, ' ')} />
                  <Pill cls={pCls(selected.priorityLevel)} label={selected.priorityLevel} />
                </div>
                <p className="text-[15px] font-black text-text-primary">{selected.serviceTypes?.[0] || selected.fullName}</p>
                <p className="text-[9px] text-text-muted font-mono mt-0.5">{selected.id.toUpperCase()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Contact</p>
                <p className="text-[13px] font-bold text-text-primary">{selected.fullName}</p>
                {selected.companyName && <p className="text-[11px] text-text-secondary">{selected.companyName}</p>}
                <p className="text-[11px] text-text-muted flex items-center gap-1"><Mail size={10} />{selected.email}</p>
                <p className="text-[11px] text-text-muted flex items-center gap-1"><Phone size={10} />{selected.phoneNumber}</p>
                {selected.preferredContactMethod && <p className="text-[10px] text-text-muted">Preferred: {selected.preferredContactMethod}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Request Details</p>
                <p className="text-[12px] text-text-primary leading-relaxed whitespace-pre-wrap">{selected.detailedDescription}</p>
              </div>
              {selected.serviceTypes?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.serviceTypes.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.serviceLocation && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Location</p>
                  <p className="text-[11px] text-text-secondary flex items-center gap-1"><MapPin size={10} />{selected.serviceLocation}</p>
                </div>
              )}
              {selected.bestAvailability && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Availability</p>
                  <p className="text-[11px] text-text-secondary">{selected.bestAvailability}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Internal Notes</p>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  className="w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40" />
                <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={saveNotes} disabled={saving}>Save Notes</Button>
              </div>
              <div className="border-t border-border-sub pt-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8" onClick={() => updateStatus(selected.id, 'contacted')} disabled={saving}>Mark Contacted</Button>
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8" onClick={() => updateStatus(selected.id, 'needs_more_info')} disabled={saving}>Request Info</Button>
                  <Button size="sm" className="text-[10px] font-bold h-8 bg-text-green hover:bg-text-green/90 text-white col-span-2" onClick={() => updateStatus(selected.id, 'approved')} disabled={saving}>
                    <CheckCircle2 size={12} className="mr-1.5" />Approve Request
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5 col-span-2" onClick={() => updateStatus(selected.id, 'rejected')} disabled={saving}>
                    <XCircle size={12} className="mr-1.5" />Reject
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── ClientIntakeTab ───────────────────────────────────────────────────────────
function ClientIntakeTab({ requests, siteReqs, viewMode = 'grid' }: {
  requests: ClientIntakeRequest[]; siteReqs: SiteRequest[]; viewMode?: 'grid' | 'list';
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<ClientIntakeRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSiteReqs, setShowSiteReqs] = useState(false);

  const pendingIntake = requests.filter(r => ['pending_review','contacted'].includes(r.status));
  const resolvedIntake = requests.filter(r => !['pending_review','contacted'].includes(r.status));

  const updateStatus = async (id: string, status: string, extra?: Record<string, unknown>) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clientRequests', id), {
        status, reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra,
      });
      toast({ title: 'Updated' }); setSelected(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clientRequests', selected.id), {
        internalNotes: notes, adminNotes, updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Notes Saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const convertToClient = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const clientId = await createDocId(ID_PREFIXES.CLIENT);
      await setDoc(doc(db, 'clients', clientId), {
        companyName: selected.companyName, primaryContactName: selected.primaryContactName,
        email: selected.email, phoneNumber: selected.phoneNumber,
        companyWebsiteUrl: selected.companyWebsiteUrl || null,
        industryType: selected.industryType || null,
        numberOfLocations: selected.numberOfLocations || null,
        totalEmployeeCount: selected.totalEmployeeCount || null,
        primaryOperatingRegion: selected.primaryOperatingRegion || null,
        serviceInterests: selected.serviceInterests || [],
        subscriptionTier: selected.subscriptionTier || null,
        preferredCommunicationMethod: selected.preferredCommunicationMethod || null,
        sourceClientRequestId: selected.id,
        status: 'active', portalAccessStatus: 'pending_user_setup',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'clientRequests', selected.id), {
        status: 'converted_to_client', convertedClientId: clientId,
        reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Converted to Client', description: `Client record created: ${clientId}` });
      setSelected(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const tierCls = (t: string) => {
    if (t === 'enterprise') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (t === 'professional') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (t === 'essential') return 'bg-text-green/10 text-text-green border-text-green/30';
    return 'bg-bg-tertiary text-text-muted border-border-sub';
  };

  const listRow = (req: ClientIntakeRequest) => (
    <button key={req.id} type="button"
      onClick={() => { setSelected(req); setNotes(req.internalNotes || ''); setAdminNotes((req as any).adminNotes || ''); }}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors text-left">
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-bold text-text-primary">{req.companyName || req.email || 'Unknown'}</span>
        {req.requestCode && <span className="text-[9px] font-mono text-text-muted ml-2">{req.requestCode}</span>}
      </div>
      {req.industryType && <span className="hidden md:block text-[10px] text-text-muted truncate max-w-[160px] shrink-0">{req.industryType}</span>}
      <div className="flex items-center gap-1.5 shrink-0">
        {req.subscriptionTier && (
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', tierCls(req.subscriptionTier))}>
            {req.subscriptionTier === 'not_sure' ? 'TBD' : req.subscriptionTier}
          </span>
        )}
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>
          {(req.status || '').replace(/_/g, ' ') || 'pending'}
        </span>
      </div>
    </button>
  );

  const card = (req: ClientIntakeRequest) => (
    <button key={req.id} type="button"
      onClick={() => { setSelected(req); setNotes(req.internalNotes || ''); setAdminNotes((req as any).adminNotes || ''); }}
      className="w-full rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-2.5 text-left hover:border-border-main transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text-primary truncate">{req.companyName || req.email || 'Unknown'}</p>
          <p className="text-[10px] text-text-muted truncate">
            {req.requestCode && <span className="font-mono mr-1">{req.requestCode} ·</span>}
            {[req.primaryContactName, req.jobTitle].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {req.subscriptionTier && (
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', tierCls(req.subscriptionTier))}>
              {req.subscriptionTier === 'not_sure' ? 'TBD' : req.subscriptionTier}
            </span>
          )}
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>
            {(req.status || '').replace(/_/g, ' ') || 'pending'}
          </span>
        </div>
      </div>
      {req.email && <p className="text-[9px] text-text-muted flex items-center gap-1"><Mail size={8} />{req.email}</p>}
      {(req.industryType || req.numberOfLocations) && (
        <p className="text-[10px] text-text-muted">{[req.industryType, req.numberOfLocations ? `${req.numberOfLocations} location${req.numberOfLocations !== '1' ? 's' : ''}` : null].filter(Boolean).join(' · ')}</p>
      )}
      {req.serviceInterests?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {req.serviceInterests.slice(0, 3).map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-muted">{t}</span>
          ))}
          {req.serviceInterests.length > 3 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-muted">+{req.serviceInterests.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-text-muted uppercase tracking-wider">Client partnership applications and site requests</p>
        <a href="/public/client-intake" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider">
            <ExternalLink size={12} className="mr-1.5" />View Client Form
          </Button>
        </a>
      </div>
      <div className="space-y-6">
        {pendingIntake.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Partnership Applications ({pendingIntake.length})</p>
            {viewMode === 'list'
              ? <div className="space-y-1">{pendingIntake.map(r => listRow(r))}</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{pendingIntake.map(r => card(r))}</div>
            }
          </div>
        )}
        {resolvedIntake.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Resolved ({resolvedIntake.length})</p>
            {viewMode === 'list'
              ? <div className="space-y-1">{resolvedIntake.map(r => listRow(r))}</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{resolvedIntake.map(r => card(r))}</div>
            }
          </div>
        )}
        {requests.length === 0 && (
          <div className="py-10 text-center text-text-muted">
            <Building2 size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-[11px]">No client intake applications</p>
          </div>
        )}
        {siteReqs.length > 0 && (
          <div className="border-t border-border-sub pt-4">
            <button type="button" onClick={() => setShowSiteReqs(v => !v)}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-primary transition-colors mb-3">
              <ChevronDown size={12} className={cn('transition-transform', showSiteReqs && 'rotate-180')} />
              Site Requests from Existing Clients ({siteReqs.length})
            </button>
            {showSiteReqs && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {siteReqs.map(req => (
                  <div key={req.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-bold text-text-primary">{req.siteName}</p>
                        <p className="text-[10px] text-text-muted">{req.clientName}</p>
                      </div>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0', statusCls(req.status))}>
                        {req.status}
                      </span>
                    </div>
                    {req.location && <p className="text-[10px] text-text-muted flex items-center gap-1"><MapPin size={9} />{req.location}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
          {selected && (
            <div className="py-4 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {selected.requestCode && (
                    <span className="text-[9px] px-2 py-0.5 rounded border font-bold font-mono tracking-wider bg-bg-tertiary text-text-muted border-border-sub">{selected.requestCode}</span>
                  )}
                  <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest', tierCls(selected.subscriptionTier))}>
                    {selected.subscriptionTier === 'not_sure' ? 'Tier TBD' : `${selected.subscriptionTier} tier`}
                  </span>
                  <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(selected.status))}>
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[15px] font-black text-text-primary">Partnership Application</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Company</p>
                <p className="text-[14px] font-bold text-text-primary">{selected.companyName}</p>
                <p className="text-[11px] text-text-secondary">{selected.primaryContactName} · {selected.jobTitle}</p>
                <p className="text-[11px] text-text-muted flex items-center gap-1"><Mail size={10} />{selected.email}</p>
                <p className="text-[11px] text-text-muted flex items-center gap-1"><Phone size={10} />{selected.phoneNumber}</p>
                {selected.companyWebsiteUrl && (
                  <a href={selected.companyWebsiteUrl} target="_blank" rel="noreferrer" className="text-[11px] text-text-muted flex items-center gap-1 hover:text-text-primary transition-colors">
                    <Globe size={10} />{selected.companyWebsiteUrl}
                  </a>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Business Profile</p>
                <p className="text-[11px] text-text-secondary">{selected.industryType} · {selected.numberOfLocations} location{selected.numberOfLocations !== '1' ? 's' : ''}</p>
                {selected.totalEmployeeCount && <p className="text-[11px] text-text-muted">{selected.totalEmployeeCount} employees</p>}
                <p className="text-[11px] text-text-muted flex items-center gap-1"><MapPin size={10} />{selected.primaryOperatingRegion}</p>
              </div>
              {selected.currentPainPoints && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pain Points</p>
                  <p className="text-[12px] text-text-primary leading-relaxed">{selected.currentPainPoints}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Service Interests</p>
                <div className="flex flex-wrap gap-1">
                  {selected.serviceInterests.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Internal Notes</p>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..."
                  className="w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40" />
                <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={saveNotes} disabled={saving}>Save Notes</Button>
              </div>
              <div className="border-t border-border-sub pt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8" onClick={() => updateStatus(selected.id, 'contacted')} disabled={saving || selected.status === 'contacted'}>Mark Contacted</Button>
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8" onClick={() => updateStatus(selected.id, 'archived')} disabled={saving || selected.status === 'archived'}>Archive</Button>
                  <Button size="sm" className="text-[10px] font-bold h-8 bg-text-green hover:bg-text-green/90 text-white col-span-2" onClick={() => updateStatus(selected.id, 'approved')} disabled={saving || selected.status === 'approved' || selected.status === 'converted_to_client'}>
                    <CheckCircle2 size={12} className="mr-1.5" />Approve Application
                  </Button>
                  <Button size="sm" className="text-[10px] font-bold h-8 bg-blue-600 hover:bg-blue-600/90 text-white col-span-2" onClick={convertToClient} disabled={saving || selected.status === 'converted_to_client'}>
                    <UserCheck size={12} className="mr-1.5" />Convert to Client
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] font-bold h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5 col-span-2" onClick={() => updateStatus(selected.id, 'denied')} disabled={saving || selected.status === 'denied'}>
                    <XCircle size={12} className="mr-1.5" />Deny Application
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SubscriptionTab() {
  return (
    <div className="py-16 text-center text-text-muted">
      <Briefcase size={28} className="mx-auto mb-3 opacity-20" />
      <p className="text-[12px] font-bold">Subscription Requests</p>
      <p className="text-[11px] mt-1">Subscription and service plan inquiries will appear here.</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RequestsPage() {
  const { toast } = useToast();

  const [serviceRequests, setServiceRequests] = useState<NewServiceRequest[]>([]);
  const [clientIntakeRequests, setClientIntakeRequests] = useState<ClientIntakeRequest[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Technician[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // Filters
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'normal' | 'low'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'App' | 'Google Form' | 'Manual'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'priority'>('newest');

  // Detail sheet (All tab)
  const [detailItem, setDetailItem] = useState<NormalizedItem | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'serviceRequests'), snap => {
      setServiceRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as NewServiceRequest)));
      setLoading(false);
    }, () => setLoading(false));
    const u2 = onSnapshot(collection(db, 'siteRequests'), snap => setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest))));
    const u3 = onSnapshot(collection(db, 'timeOffRequests'), snap => setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest))));
    const u4 = onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
      setTechnicians(all);
      setPendingUsers(all.filter(u => (u as any).approvalStatus === 'pending'));
    });
    const u6 = onSnapshot(collection(db, 'clientRequests'), snap =>
      setClientIntakeRequests(
        snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientIntakeRequest))
          .filter(r => r.source === 'app_client_intake' || r.source === 'public_client_intake' || r.source === 'client_intake_form' || !!r.companyName)
      )
    );
    return () => { u1(); u2(); u3(); u4(); u6(); };
  }, []);

  const handleAddNewRequest = async (request: ServiceRequest) => {
    try {
      await setDoc(doc(db, 'clientRequests', request.id), { ...request });
      toast({ title: 'Request Added' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const servicePending    = serviceRequests.filter(r => ['pending_review','contacted','needs_more_info'].includes(r.status)).length;
  const clientPending     = clientIntakeRequests.filter(r => ['pending_review','contacted'].includes(r.status)).length + siteRequests.filter(r => r.status === 'pending').length;
  const personnelPending  = timeOffRequests.filter(r => r.status === 'pending').length;
  const accessPending     = pendingUsers.length;
  const totalPending      = servicePending + clientPending + personnelPending + accessPending;

  const archivedService   = serviceRequests.filter(r => ['rejected','closed','converted_to_work_order','converted_to_project'].includes(r.status));
  const archivedIntake    = clientIntakeRequests.filter(r => ['rejected','approved','converted_to_client'].includes(r.status));
  const archivedSiteReqs  = siteRequests.filter(r => r.status !== 'pending');
  const archivedPersonnel = timeOffRequests.filter(r => r.status === 'approved' || r.status === 'denied');
  const archivedTotalCount = archivedService.length + archivedIntake.length + archivedSiteReqs.length + archivedPersonnel.length;

  const urgentCount = serviceRequests.filter(r => ['critical','high'].includes(r.priorityLevel) && ['pending_review','contacted'].includes(r.status)).length;
  const approvedCount = [
    ...serviceRequests.filter(r => ['approved','converted_to_work_order'].includes(r.status)),
    ...clientIntakeRequests.filter(r => ['approved','converted_to_client'].includes(r.status)),
    ...timeOffRequests.filter(r => r.status === 'approved'),
  ].length;
  const rejectedCount = [
    ...serviceRequests.filter(r => ['rejected','closed'].includes(r.status)),
    ...clientIntakeRequests.filter(r => ['denied','rejected'].includes(r.status)),
    ...timeOffRequests.filter(r => r.status === 'denied'),
  ].length;

  // ── Normalized items for "All" tab ─────────────────────────────────────────
  const allNormalized = useMemo<NormalizedItem[]>(() => {
    const items: NormalizedItem[] = [];

    serviceRequests.filter(r => ['pending_review','contacted','needs_more_info'].includes(r.status)).forEach(r => {
      items.push({
        id: r.id, kind: 'service',
        title: r.serviceTypes?.[0] || r.fullName || 'Service Request',
        company: r.companyName || '',
        contactName: r.fullName || '',
        phone: r.phoneNumber || '',
        email: r.email || '',
        source: mapSource(r.source),
        date: r.createdAt || '',
        description: r.detailedDescription || '',
        status: r.status,
        priority: r.priorityLevel || 'medium',
        rawServiceReq: r,
      });
    });

    clientIntakeRequests.filter(r => ['pending_review','contacted'].includes(r.status)).forEach(r => {
      items.push({
        id: r.id, kind: 'client',
        title: r.companyName || 'Client Onboarding',
        company: r.companyName || '',
        contactName: r.primaryContactName || '',
        phone: r.phoneNumber || '',
        email: r.email || '',
        source: mapSource(r.source),
        date: r.createdAt || '',
        description: r.currentPainPoints || '',
        status: r.status,
        priority: 'medium',
        rawClientReq: r,
      });
    });

    timeOffRequests.filter(r => r.status === 'pending').forEach(r => {
      const tech = technicians.find(t => t.id === r.techId);
      items.push({
        id: r.id, kind: 'personnel',
        title: `${r.type} Request`,
        company: '',
        contactName: tech?.name || r.techId,
        phone: (tech as any)?.phone || '',
        email: (tech as any)?.email || '',
        source: 'App',
        date: r.startDate || '',
        description: r.reason || '',
        status: r.status,
        priority: 'medium',
        rawTimeOff: r,
      });
    });

    pendingUsers.forEach(u => {
      items.push({
        id: u.id, kind: 'access',
        title: 'Account Access Request',
        company: '',
        contactName: u.name || 'Unknown',
        phone: (u as any).phone || '',
        email: u.email || '',
        source: mapSource((u as any).createdVia),
        date: (u as any).requestedAt || (u as any).createdAt || '',
        description: `Requesting access as ${(u as any).requestedRole || 'a team member'}.`,
        status: 'pending',
        priority: 'medium',
        rawUser: u,
      });
    });

    return items.sort((a, b) => {
      if (sortOrder === 'oldest') return a.date.localeCompare(b.date);
      return b.date.localeCompare(a.date);
    });
  }, [serviceRequests, clientIntakeRequests, siteRequests, timeOffRequests, pendingUsers, technicians, sortOrder]);

  // Apply All-tab filters
  const filteredAll = useMemo(() => {
    let items = allNormalized;
    const q = searchQuery.toLowerCase();
    if (q) items = items.filter(i =>
      i.title.toLowerCase().includes(q) || i.company.toLowerCase().includes(q) ||
      i.contactName.toLowerCase().includes(q) || i.email.toLowerCase().includes(q) ||
      i.phone.includes(q)
    );
    if (statusFilter === 'pending') items = items.filter(i => ['pending_review','pending','contacted','needs_more_info'].includes(i.status));
    if (statusFilter === 'approved') items = items.filter(i => ['approved','converted_to_client','converted_to_work_order'].includes(i.status));
    if (statusFilter === 'rejected') items = items.filter(i => ['rejected','denied','closed'].includes(i.status));
    if (priorityFilter === 'urgent') items = items.filter(i => ['critical','high'].includes(i.priority));
    if (priorityFilter === 'normal') items = items.filter(i => i.priority === 'medium');
    if (priorityFilter === 'low') items = items.filter(i => i.priority === 'low');
    if (sourceFilter !== 'all') items = items.filter(i => i.source === sourceFilter);
    return items;
  }, [allNormalized, searchQuery, statusFilter, priorityFilter, sourceFilter]);

  // Filtered service requests (for Service tab)
  const filteredServiceRequests = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let items = serviceRequests;
    if (q) items = items.filter(r =>
      (r.fullName || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) ||
      (r.companyName || '').toLowerCase().includes(q) || (r.id || '').toLowerCase().includes(q)
    );
    if (statusFilter === 'pending') items = items.filter(r => ['pending_review','contacted','needs_more_info'].includes(r.status));
    if (statusFilter === 'approved') items = items.filter(r => ['approved','converted_to_work_order','converted_to_project'].includes(r.status));
    if (statusFilter === 'rejected') items = items.filter(r => ['rejected','closed'].includes(r.status));
    return items;
  }, [serviceRequests, searchQuery, statusFilter]);

  // All-tab actions
  const handleAllApprove = async (item: NormalizedItem) => {
    try {
      if (item.kind === 'service' && item.rawServiceReq) {
        await updateDoc(doc(db, 'serviceRequests', item.id), { status: 'approved', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'client' && item.rawClientReq) {
        await updateDoc(doc(db, 'clientRequests', item.id), { status: 'approved', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'personnel' && item.rawTimeOff) {
        await updateDoc(doc(db, 'timeOffRequests', item.id), { status: 'approved' });
      }
      toast({ title: 'Approved' });
      setDetailItem(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleAllReject = async (item: NormalizedItem) => {
    try {
      if (item.kind === 'service') {
        await updateDoc(doc(db, 'serviceRequests', item.id), { status: 'rejected', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'client') {
        await updateDoc(doc(db, 'clientRequests', item.id), { status: 'denied', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'personnel') {
        await updateDoc(doc(db, 'timeOffRequests', item.id), { status: 'denied' });
      }
      toast({ title: 'Rejected' });
      setDetailItem(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleAllConvert = (item: NormalizedItem) => {
    toast({ title: 'Convert to Job', description: 'Navigate to the Service tab to convert this request.' });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Inbox size={12} />Universal Intake</p>
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Triage, approve, and route all incoming requests across operations.</p>
        </div>
        <div className="page-header-right items-center gap-2">
          <Button variant="outline" size="default" className="text-[10px] font-bold uppercase tracking-widest h-9" onClick={() => toast({ title: 'Sync Google Forms', description: 'Google Forms sync is not configured.' })}>
            <RefreshCw size={13} className="mr-1.5" />Sync Google Forms
          </Button>
          {activeTab === 'service' && (
            <Button variant="default" size="default" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsNewDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" />New Service Request
            </Button>
          )}
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Pending Review" count={totalPending} icon={AlertCircle} description="Needs admin action" variant="default" />
        <StatCard label="Urgent" count={urgentCount} icon={AlertTriangle} description="High priority items" variant="urgent" />
        <StatCard label="Approved" count={approvedCount} icon={CheckCircle2} description="Recently approved" variant="approved" />
        <StatCard label="Rejected" count={rejectedCount} icon={XCircle} description="Not approved" variant="muted" />
        <StatCard label="Archived" count={archivedTotalCount} icon={Clock} description="Completed / closed" variant="muted" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-3 mb-0">
          <div className="overflow-x-auto">
            <TabsList className="tabs h-auto gap-0 p-0 bg-transparent border-b border-border-sub rounded-none w-max">
              {[
                { value: 'all', label: 'All', count: totalPending },
                { value: 'service', label: 'Service', count: servicePending },
                { value: 'client', label: 'Client', count: clientPending },
                { value: 'personnel', label: 'Personnel', count: personnelPending },
                { value: 'access', label: 'Account Access', count: accessPending },
                { value: 'subscription', label: 'Subscription', count: 0 },
                { value: 'archived', label: 'Archived', count: archivedTotalCount },
              ].map(t => (
                <TabsTrigger key={t.value} value={t.value}
                  className={cn(
                    'relative h-10 px-4 rounded-none border-0 border-b-2 text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0',
                    activeTab === t.value
                      ? 'border-brand-red text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  )}>
                  {t.label}{t.count > 0 && <TabCount n={t.count} />}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'grid' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
              <LayoutGrid size={14} />
            </button>
            <button type="button" onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
              <LayoutList size={14} />
            </button>
          </div>
        </div>

        {/* Filter + search row */}
        <div className="py-3 border-b border-border-sub space-y-2.5">
          <div className="flex items-center gap-4 flex-wrap">
            <FilterGroup
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
            <FilterGroup
              label="Priority"
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <FilterGroup
              label="Source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'App', label: 'App' },
                { value: 'Google Form', label: 'Google Form' },
                { value: 'Manual', label: 'Manual' },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="search-wrap flex-1 !mb-0">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                className="search-input !h-9 !text-xs !w-full bg-bg-primary"
                placeholder="Search requests, company, contact, email, phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={sortOrder} onValueChange={v => setSortOrder(v as typeof sortOrder)}>
              <SelectTrigger className="h-9 w-[170px] text-[10px] font-bold bg-bg-secondary border-border-main shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="newest" className="text-[10px] font-bold">Sort: Newest First</SelectItem>
                <SelectItem value="oldest" className="text-[10px] font-bold">Sort: Oldest First</SelectItem>
                <SelectItem value="priority" className="text-[10px] font-bold">Sort: Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── All ── */}
        <TabsContent value="all" className="mt-4">
          {filteredAll.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Inbox size={28} className="mx-auto mb-3 opacity-20" />
              <p className="text-[11px]">No pending requests across any category</p>
            </div>
          ) : (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
              : 'space-y-1'
            }>
              {filteredAll.map(item => (
                viewMode === 'grid' ? (
                  <UnifiedRequestCard
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onOpen={() => setDetailItem(item)}
                    onApprove={() => handleAllApprove(item)}
                    onReject={() => handleAllReject(item)}
                  />
                ) : (
                  <div key={`${item.kind}-${item.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
                    <Pill cls={KIND_CFG[item.kind].cls} label={KIND_CFG[item.kind].label} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-text-primary truncate">{item.title}</p>
                      <p className="text-[10px] text-text-muted">{item.contactName}{item.company ? ` · ${item.company}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.priority && <Pill cls={priorityCls(item.priority)} label={priorityLabel(item.priority)} />}
                      <Pill cls={statusCls(item.status)} label={item.status.replace(/_/g, ' ')} />
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[9px] font-bold" onClick={() => setDetailItem(item)}>
                        <FileText size={9} className="mr-1" />Open
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Service ── */}
        <TabsContent value="service" className="mt-4">
          <NewServiceTab requests={filteredServiceRequests} viewMode={viewMode} />
        </TabsContent>

        {/* ── Client ── */}
        <TabsContent value="client" className="mt-4">
          <ClientIntakeTab requests={clientIntakeRequests} siteReqs={siteRequests} viewMode={viewMode} />
        </TabsContent>

        {/* ── Personnel ── */}
        <TabsContent value="personnel" className="mt-4">
          <PersonnelTab requests={timeOffRequests} technicians={technicians} viewMode={viewMode} />
        </TabsContent>

        {/* ── Account Access ── */}
        <TabsContent value="access" className="mt-4">
          <AccountAccessTab pendingUsers={pendingUsers} />
        </TabsContent>

        {/* ── Subscription ── */}
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionTab />
        </TabsContent>

        {/* ── Archived ── */}
        <TabsContent value="archived" className="mt-4">
          <div className="space-y-8">
            {archivedService.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Service Requests ({archivedService.length})</p>
                <NewServiceTab requests={archivedService} viewMode={viewMode} />
              </div>
            )}
            {archivedIntake.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Client Applications ({archivedIntake.length})</p>
                <ClientIntakeTab requests={archivedIntake} siteReqs={[]} viewMode={viewMode} />
              </div>
            )}
            {archivedPersonnel.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Personnel ({archivedPersonnel.length})</p>
                <PersonnelTab requests={archivedPersonnel} technicians={technicians} viewMode={viewMode} />
              </div>
            )}
            {archivedTotalCount === 0 && (
              <div className="py-16 text-center text-text-muted">
                <Clock size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-[11px]">No archived requests yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail sheet (All tab) */}
      <RequestDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onApprove={handleAllApprove}
        onReject={handleAllReject}
        onConvert={handleAllConvert}
      />

      <NewRequestDialog
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddNewRequest}
      />
    </div>
  );
}
