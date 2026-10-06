'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { CrmContact, Lead, LeadActivity, Quote, SiteSurvey } from '@/lib/types';
import { SiteSurveyDialog } from './site-survey-dialog';
import { totalDrops } from '@/lib/crm-survey';
import { contactRoleLabel } from '@/lib/crm-accounts';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Phone, Mail, MessageSquare, Calendar, FileText, CheckCircle2, TrendingUp, XCircle, Loader2, Users,
  Clock, ArrowRight, Maximize2, Paperclip, ExternalLink, Pencil, MapPin, Globe, ListTodo, Footprints,
  RotateCcw, UserCheck, AlertTriangle, Briefcase,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  STAGES, STAGE_LABELS, STAGE_COLORS, OPEN_STAGES, ACTIVITY_TYPES, CALL_OUTCOMES, sourceLabel,
  probabilityOf, weightedValue, daysSince, lastTouch, isStale, todayKey, formatMoney,
} from '@/lib/crm';
import { changeLeadStage, logLeadActivity, handOffToOps } from '@/lib/crm-actions';

const ACTIVITY_ICONS: Record<LeadActivity['type'], React.ElementType> = {
  call: Phone,
  email: Mail,
  note: MessageSquare,
  meeting: Users,
  proposal: FileText,
  follow_up: Calendar,
  site_walk: Footprints,
  task: ListTodo,
};

type Props = {
  lead: Lead | null;
  activities: LeadActivity[];
  quotes: Quote[];
  contacts?: CrmContact[];
  surveys?: SiteSurvey[];
  currentUserId: string;
  currentUserName?: string;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onCloseDeal: (lead: Lead, outcome: 'won' | 'lost') => void;
  onConvert: (lead: Lead) => void;
};

const sectionLabel = 'text-[9px] font-black uppercase tracking-[0.2em] text-text-muted';

function safeFormat(iso: string | undefined, fmt: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), fmt); } catch { return iso; }
}

export function LeadDetailDrawer({ lead, activities, quotes, contacts = [], surveys = [], currentUserId, currentUserName, onClose, onEdit, onCloseDeal, onConvert }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [activityType, setActivityType] = useState<LeadActivity['type']>('call');
  const [callOutcome, setCallOutcome] = useState('');
  const [activityNote, setActivityNote] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [isFullDetailOpen, setIsFullDetailOpen] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [surveyOpen, setSurveyOpen] = useState<SiteSurvey | 'new' | null>(null);

  if (!lead) return null;

  const leadActivities = activities
    .filter(a => a.leadId === lead.id && a.type !== 'task')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tasks = activities
    .filter(a => a.leadId === lead.id && a.type === 'task')
    .sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || (a.scheduledAt || '9').localeCompare(b.scheduledAt || '9'));

  const leadQuotes = quotes
    .filter(q => q.leadId === lead.id || (lead.quoteIds || []).includes(q.id))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const open = OPEN_STAGES.includes(lead.stage);
  const today = todayKey();
  const followUpOverdue = !!lead.followUpDate && lead.followUpDate < today && open;
  const stageDays = daysSince(lead.stageChangedAt || lead.createdAt);
  const touchDays = daysSince(lastTouch(lead));
  const isMine = lead.assignedTo === currentUserId;

  async function patch(fields: Partial<Lead>, msg?: string) {
    try {
      await updateDoc(doc(db, 'leads', lead!.id), { ...fields, updatedAt: new Date().toISOString() });
      if (msg) toast({ title: msg });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  }

  async function logActivity() {
    if (!activityNote.trim() && !(activityType === 'call' && callOutcome)) return;
    setSavingActivity(true);
    try {
      await logLeadActivity(lead!.id, {
        type: activityType,
        description: activityNote.trim() || callOutcome,
        createdBy: currentUserId,
        outcome: activityType === 'call' && callOutcome ? callOutcome : undefined,
      });
      // First real touch on a brand-new lead moves it to Contacted automatically.
      if (lead!.stage === 'new' && ['call', 'email', 'meeting', 'site_walk'].includes(activityType)) {
        await changeLeadStage(lead!, 'contacted', currentUserId);
      }
      setActivityNote('');
      setCallOutcome('');
      toast({ title: 'Activity logged' });
    } catch {
      toast({ title: 'Failed to log activity', variant: 'destructive' });
    } finally {
      setSavingActivity(false);
    }
  }

  async function addTask() {
    if (!taskText.trim()) return;
    try {
      await logLeadActivity(lead!.id, {
        type: 'task', description: taskText.trim(), createdBy: currentUserId, scheduledAt: taskDue || undefined,
      }, false);
      setTaskText('');
      setTaskDue('');
    } catch {
      toast({ title: 'Failed to add task', variant: 'destructive' });
    }
  }

  async function toggleTask(t: LeadActivity) {
    try {
      await updateDoc(doc(db, 'leadActivities', t.id), { completedAt: t.completedAt ? null : new Date().toISOString() });
      if (!t.completedAt) await patch({ lastActivityAt: new Date().toISOString() });
    } catch {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    }
  }

  async function moveStage(stage: Lead['stage']) {
    setMovingStage(true);
    try {
      await changeLeadStage(lead!, stage, currentUserId);
      toast({ title: `Moved to ${STAGE_LABELS[stage]}` });
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    } finally {
      setMovingStage(false);
    }
  }

  async function handOff() {
    setMovingStage(true);
    try {
      const id = await handOffToOps(lead!, quotes, currentUserId, surveys);
      toast({ title: 'Handed off to ops', description: `Project ${id} created (on hold).` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Hand-off failed', description: e?.code === 'permission-denied' ? 'Deploy the latest Firestore rules, or ask an admin.' : e?.message });
    } finally {
      setMovingStage(false);
    }
  }

  async function reopen() {
    setMovingStage(true);
    try {
      await changeLeadStage(lead!, 'negotiating', currentUserId, { closedAt: null as any, probability: null as any });
      toast({ title: 'Deal reopened' });
    } catch {
      toast({ title: 'Failed to reopen', variant: 'destructive' });
    } finally {
      setMovingStage(false);
    }
  }

  const currentIdx = OPEN_STAGES.indexOf(lead.stage);
  const nextStage = currentIdx >= 0 && currentIdx < OPEN_STAGES.length - 1 ? OPEN_STAGES[currentIdx + 1] : null;

  return (
    <Sheet open={!!lead} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl bg-bg-secondary border-border-main overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border-sub">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-brand-red/10 rounded-lg shrink-0">
              <TrendingUp size={18} className="text-brand-red" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-sm font-black uppercase tracking-widest text-text-primary leading-tight">
                {lead.companyName}
              </SheetTitle>
              <SheetDescription className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
                {[lead.contactName, lead.contactTitle].filter(Boolean).join(', ') || 'No contact'}
                {lead.industry ? ` · ${lead.industry}` : ''}
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={cn('text-[10px] font-black uppercase tracking-widest', STAGE_COLORS[lead.stage])}>
              ● {STAGE_LABELS[lead.stage]}
            </span>
            {isStale(lead) && (
              <Badge className="text-[8px] h-5 uppercase bg-amber-400/10 text-amber-400 border border-amber-400/20">
                <AlertTriangle size={9} className="mr-1" /> Stale {touchDays}d
              </Badge>
            )}
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase tracking-wider" onClick={() => onEdit(lead)}>
                <Pencil size={10} className="mr-1.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase tracking-wider" onClick={() => setIsFullDetailOpen(true)}>
                <Maximize2 size={10} className="mr-1.5" /> Full
                {(lead.attachments?.length ?? 0) > 0 && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-text-muted"><Paperclip size={9} />{lead.attachments!.length}</span>
                )}
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="py-5 space-y-6">
          {/* Stage stepper */}
          <div className="flex gap-1">
            {STAGES.filter(s => s.key !== 'lost').map((s, i) => {
              const reached = lead.stage === 'won' || (lead.stage !== 'lost' && i <= STAGES.findIndex(x => x.key === lead.stage));
              return (
                <button
                  key={s.key}
                  disabled={movingStage || !open || s.key === 'won'}
                  onClick={() => moveStage(s.key)}
                  title={s.label}
                  className={cn('flex-1 h-1.5 rounded-full transition-colors', reached ? 'bg-brand-red' : 'bg-bg-tertiary', open && s.key !== 'won' && 'hover:bg-brand-red/60')}
                />
              );
            })}
          </div>

          {/* Deal snapshot */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['Value', formatMoney(lead.estimatedValue || 0)],
              ['Win %', `${probabilityOf(lead)}%`],
              ['Weighted', formatMoney(weightedValue(lead))],
              ['Close Date', lead.expectedCloseDate ? safeFormat(lead.expectedCloseDate, 'MMM d, yyyy') : '—'],
              ['In Stage', stageDays !== null ? `${stageDays}d` : '—'],
              ['Last Touch', touchDays !== null ? (touchDays === 0 ? 'Today' : `${touchDays}d ago`) : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border-sub bg-bg-primary px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</p>
                <p className="text-[12px] font-black text-text-primary mt-0.5 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Owner */}
          <div className="flex items-center gap-2 text-[10px] text-text-muted uppercase tracking-wider">
            <Briefcase size={11} />
            Owner: <span className="font-bold text-text-primary">{lead.assignedToName || (isMine ? currentUserName || 'You' : lead.assignedTo ? 'Another rep' : 'Unassigned')}</span>
            {!isMine && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[9px] font-bold uppercase ml-auto"
                onClick={() => patch({ assignedTo: currentUserId, assignedToName: currentUserName || '' }, 'Lead assigned to you')}>
                Take Ownership
              </Button>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-2">
            <p className={sectionLabel}>Contact</p>
            <div className="space-y-1.5">
              {lead.contactPhone && (
                <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <Phone size={11} className="text-brand-red shrink-0" /> {lead.contactPhone}
                </a>
              )}
              {lead.contactEmail && (
                <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <Mail size={11} className="text-brand-red shrink-0" /> {lead.contactEmail}
                </a>
              )}
              {lead.address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <MapPin size={11} className="text-brand-red shrink-0" /> {lead.address}
                </a>
              )}
              {lead.website && (
                <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <Globe size={11} className="text-brand-red shrink-0" /> {lead.website}
                </a>
              )}
              {!lead.contactPhone && !lead.contactEmail && !lead.address && (
                <p className="text-[10px] text-text-muted uppercase tracking-wider">No contact info — click Edit to add.</p>
              )}
            </div>
            {(lead.serviceLines?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {lead.serviceLines!.map(s => (
                  <Badge key={s} className="text-[8px] h-5 uppercase bg-bg-tertiary border-border-sub text-text-secondary">{s}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Other people at this account */}
          {lead.companyId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>People at {lead.companyName}</p>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[9px] font-bold uppercase" onClick={() => router.push('/admin/crm/accounts')}>
                  Account →
                </Button>
              </div>
              {contacts.filter(c => c.companyId === lead.companyId && c.id !== lead.contactId).length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase tracking-wider">No other contacts — add the IT lead, facilities, or AP on the account.</p>
              ) : contacts.filter(c => c.companyId === lead.companyId && c.id !== lead.contactId).map(c => (
                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold text-text-primary">{c.name}</span>
                  <span className="text-text-muted truncate">{[c.title, contactRoleLabel(c.role)].filter(Boolean).join(' · ')}</span>
                  <span className="ml-auto flex gap-2 shrink-0">
                    {c.phone && <a href={`tel:${c.phone}`} className="text-text-muted hover:text-text-primary"><Phone size={10} /></a>}
                    {c.email && <a href={`mailto:${c.email}`} className="text-text-muted hover:text-text-primary"><Mail size={10} /></a>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Next step + follow-up */}
          {open && (
            <div className="space-y-2">
              <p className={sectionLabel}>Next Step</p>
              <Input
                key={`ns-${lead.id}-${lead.nextStep}`}
                defaultValue={lead.nextStep || ''}
                placeholder="What has to happen next?"
                onBlur={e => e.target.value !== (lead.nextStep || '') && patch({ nextStep: e.target.value.trim() })}
                className="h-9 text-xs bg-bg-tertiary border-border-main"
              />
              <div className="flex items-center gap-2">
                <Calendar size={11} className={followUpOverdue ? 'text-brand-red' : 'text-text-muted'} />
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', followUpOverdue ? 'text-brand-red' : 'text-text-muted')}>
                  Follow-up{followUpOverdue ? ' (overdue)' : ''}
                </span>
                <Input
                  type="date"
                  value={lead.followUpDate || ''}
                  onChange={e => patch({ followUpDate: e.target.value })}
                  className="h-8 text-xs bg-bg-tertiary border-border-main w-[150px]"
                />
                {[1, 3, 7].map(d => (
                  <Button key={d} size="sm" variant="ghost" className="h-7 px-2 text-[9px] font-bold uppercase"
                    onClick={() => { const t = new Date(); t.setDate(t.getDate() + d); patch({ followUpDate: todayKey(t) }, `Follow-up set +${d}d`); }}>
                    +{d}d
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Stage Actions */}
          <div className="space-y-2">
            <p className={sectionLabel}>Pipeline Actions</p>
            <div className="flex flex-wrap gap-2">
              {open ? (
                <>
                  {nextStage && (
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => moveStage(nextStage)} disabled={movingStage}>
                      <ArrowRight size={11} className="mr-1.5" /> Move to {STAGE_LABELS[nextStage]}
                    </Button>
                  )}
                  <Button size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider bg-text-green/20 hover:bg-text-green/30 text-text-green border border-text-green/30" onClick={() => onCloseDeal(lead, 'won')} disabled={movingStage}>
                    <CheckCircle2 size={11} className="mr-1.5" /> Mark Won
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-red" onClick={() => onCloseDeal(lead, 'lost')} disabled={movingStage}>
                    <XCircle size={11} className="mr-1.5" /> Mark Lost
                  </Button>
                </>
              ) : (
                <>
                  {lead.stage === 'won' && (lead.projectId ? (
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => router.push(`/admin/projects/${lead.projectId}`)}>
                      <Briefcase size={11} className="mr-1.5" /> View Project
                    </Button>
                  ) : (
                    <Button size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white" onClick={handOff} disabled={movingStage}>
                      <Briefcase size={11} className="mr-1.5" /> Hand off to Ops
                    </Button>
                  ))}
                  {lead.stage === 'won' && !lead.convertedToClient && (
                    <Button size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider bg-text-green/20 hover:bg-text-green/30 text-text-green border border-text-green/30" onClick={() => onConvert(lead)}>
                      <UserCheck size={11} className="mr-1.5" /> Convert to Client
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={reopen} disabled={movingStage}>
                    <RotateCcw size={11} className="mr-1.5" /> Reopen
                  </Button>
                </>
              )}
            </div>
            {lead.stage === 'lost' && (lead.lostReasonCategory || lead.lostReason) && (
              <p className="text-[10px] text-text-red">Lost: {[lead.lostReasonCategory, lead.lostReason].filter(Boolean).join(' — ')}</p>
            )}
          </div>

          {/* Site surveys */}
          {(() => {
            const leadSurveys = surveys.filter(s => s.leadId === lead.id).sort((a, b) => (b.surveyDate || '').localeCompare(a.surveyDate || ''));
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className={sectionLabel}>Site Surveys ({leadSurveys.length})</p>
                  <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase tracking-wider" onClick={() => setSurveyOpen('new')}>
                    <Footprints size={10} className="mr-1.5" /> New Survey
                  </Button>
                </div>
                {leadSurveys.map(s => (
                  <button key={s.id} onClick={() => setSurveyOpen(s)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border-sub bg-bg-primary hover:border-border-main text-left">
                    <Footprints size={12} className="text-brand-red shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-bold text-text-primary truncate">{s.title}</span>
                      <span className="block text-[9px] text-text-muted">{[s.surveyDate, s.surveyedBy, `${totalDrops(s)} drops`, `${s.photos.length} photos`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Badge className={cn('text-[8px] h-5 uppercase border', s.status === 'complete' ? 'bg-text-green/10 text-text-green border-text-green/20' : 'bg-amber-400/10 text-amber-400 border-amber-400/20')}>{s.status}</Badge>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Quotes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>Quotes ({leadQuotes.length})</p>
              <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase tracking-wider"
                onClick={() => router.push(`/admin/quotes?leadId=${encodeURIComponent(lead.id)}`)}>
                <FileText size={10} className="mr-1.5" /> Create Quote
              </Button>
            </div>
            {leadQuotes.map(q => (
              <button key={q.id} onClick={() => router.push('/admin/quotes')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border-sub bg-bg-primary hover:border-border-main text-left">
                <FileText size={12} className="text-brand-red shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold text-text-primary truncate">{q.title}</span>
                  <span className="block text-[9px] text-text-muted font-mono">{q.quoteNumber}</span>
                </span>
                <span className="text-[11px] font-black text-text-green tabular-nums">{formatMoney(q.total || 0)}</span>
                <Badge className={cn('text-[8px] h-5 uppercase border',
                  q.status === 'approved' || q.status.startsWith('converted') ? 'bg-text-green/10 text-text-green border-text-green/20'
                  : q.status === 'rejected' || q.status === 'expired' ? 'bg-text-red/10 text-text-red border-text-red/20'
                  : 'bg-amber-400/10 text-amber-400 border-amber-400/20')}>
                  {q.status.replace(/_/g, ' ')}
                </Badge>
              </button>
            ))}
          </div>

          {/* Tasks */}
          <div className="space-y-2">
            <p className={sectionLabel}>Tasks ({tasks.filter(t => !t.completedAt).length} open)</p>
            <div className="flex gap-2">
              <Input placeholder="Send cable spec sheet..." value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} className="h-9 text-xs bg-bg-tertiary border-border-main flex-1" />
              <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="h-9 text-xs bg-bg-tertiary border-border-main w-[140px]" />
              <Button size="sm" variant="outline" className="h-9 text-[10px] font-bold uppercase px-3" onClick={addTask} disabled={!taskText.trim()}>Add</Button>
            </div>
            {tasks.map(t => {
              const overdue = !t.completedAt && t.scheduledAt && t.scheduledAt < today;
              return (
                <label key={t.id} className="flex items-center gap-2.5 text-[11px] cursor-pointer py-0.5">
                  <Checkbox checked={!!t.completedAt} onCheckedChange={() => toggleTask(t)} />
                  <span className={cn('flex-1', t.completedAt ? 'line-through text-text-muted' : 'text-text-secondary')}>{t.description}</span>
                  {t.scheduledAt && (
                    <span className={cn('text-[9px] uppercase font-bold', overdue ? 'text-brand-red' : 'text-text-muted')}>
                      {safeFormat(t.scheduledAt, 'MMM d')}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="space-y-2">
              <p className={sectionLabel}>Notes</p>
              <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap line-clamp-6">{lead.notes}</p>
            </div>
          )}

          {/* Log Activity */}
          <div className="space-y-2">
            <p className={sectionLabel}>Log Activity</p>
            <div className="flex gap-2">
              <Select value={activityType} onValueChange={v => setActivityType(v as LeadActivity['type'])}>
                <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-tertiary border-border-main w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {ACTIVITY_TYPES.map(a => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {activityType === 'call' && (
                <Select value={callOutcome || undefined} onValueChange={setCallOutcome}>
                  <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-tertiary border-border-main w-[140px]">
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    {CALL_OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="What happened?"
                value={activityNote}
                onChange={e => setActivityNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && logActivity()}
                className="h-9 text-xs bg-bg-tertiary border-border-main flex-1"
              />
              <Button
                size="sm"
                className="h-9 text-[10px] font-bold bg-brand-red hover:bg-brand-red/90 text-white px-3"
                onClick={logActivity}
                disabled={savingActivity || (!activityNote.trim() && !(activityType === 'call' && callOutcome))}
              >
                {savingActivity ? <Loader2 size={12} className="animate-spin" /> : 'Log'}
              </Button>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="space-y-3">
            <p className={sectionLabel}>Activity Timeline ({leadActivities.length})</p>
            {leadActivities.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase tracking-wider">No activity logged yet.</p>
            ) : (
              <div className="space-y-3">
                {leadActivities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
                  return (
                    <div key={activity.id} className="flex gap-3 text-xs">
                      <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center">
                        <Icon size={11} className="text-text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">{activity.type.replace('_', ' ')}</span>
                          {activity.outcome && <span className="text-[9px] font-bold uppercase text-blue-400">{activity.outcome}</span>}
                          <span className="text-[9px] text-text-muted flex items-center gap-1">
                            <Clock size={9} /> {safeFormat(activity.createdAt, 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5">{activity.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <SiteSurveyDialog
          open={!!surveyOpen}
          lead={lead}
          survey={surveyOpen === 'new' ? null : surveyOpen}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setSurveyOpen(null)}
        />

        {/* Full Detail dialog — every field plus the original uploaded files
            so sales can recover anything the import extraction missed. */}
        <Dialog open={isFullDetailOpen} onOpenChange={setIsFullDetailOpen}>
          <DialogContent className="bg-bg-elevated border-border-main sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-4 border-b border-border-sub">
              <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} className="text-brand-red" /> {lead.companyName}
              </DialogTitle>
              <DialogDescription className="text-[10px] uppercase font-bold text-text-muted">
                Full lead record{lead.importedFrom ? ` · imported from ${lead.importedFrom}` : ''}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {([
                    ['Company', lead.companyName],
                    ['Industry', lead.industry],
                    ['Contact', lead.contactName],
                    ['Title', lead.contactTitle],
                    ['Email', lead.contactEmail],
                    ['Phone', lead.contactPhone],
                    ['Address', lead.address],
                    ['Website', lead.website],
                    ['Stage', STAGE_LABELS[lead.stage]],
                    ['Source', sourceLabel(lead.source)],
                    ['Services', (lead.serviceLines || []).join(', ')],
                    ['Estimated Value', lead.estimatedValue ? formatMoney(lead.estimatedValue) : ''],
                    ['Win Probability', `${probabilityOf(lead)}%`],
                    ['Expected Close', lead.expectedCloseDate || ''],
                    ['Owner', lead.assignedToName || lead.assignedTo],
                    ['Next Step', lead.nextStep],
                    ['Follow-Up', lead.followUpDate || ''],
                    ['Lost Reason', [lead.lostReasonCategory, lead.lostReason].filter(Boolean).join(' — ')],
                    ['Created', safeFormat(lead.createdAt, 'MMM d, yyyy · h:mm a')],
                    ['Updated', safeFormat(lead.updatedAt, 'MMM d, yyyy · h:mm a')],
                    ['Closed', safeFormat(lead.closedAt, 'MMM d, yyyy')],
                    ['Tags', (lead.tags || []).join(', ')],
                  ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</p>
                      <p className="text-[11px] text-text-primary mt-0.5 break-words">{value}</p>
                    </div>
                  ))}
                </div>

                {lead.notes && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">Notes / Extracted Text</p>
                    <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap rounded-lg border border-border-sub bg-bg-secondary p-3">{lead.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5 flex items-center gap-1.5">
                    <Paperclip size={9} /> Original Files ({lead.attachments?.length ?? 0})
                  </p>
                  {(lead.attachments?.length ?? 0) === 0 ? (
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">No files attached to this lead.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {lead.attachments!.map((att, i) => (
                        <a key={i} href={att.downloadUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red/40 transition-colors group">
                          <FileText size={13} className="text-brand-red shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] font-bold text-text-primary truncate group-hover:text-brand-red transition-colors">{att.fileName}</span>
                            <span className="block text-[9px] text-text-muted">
                              {[att.contentType, att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : null].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <ExternalLink size={11} className="text-text-muted group-hover:text-text-primary shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
