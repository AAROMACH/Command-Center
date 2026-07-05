'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { makeLeadActivityId } from '@/lib/doc-ids';
import type { Lead, LeadActivity } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Phone, Mail, MessageSquare, Calendar, FileText, CheckCircle2,
  TrendingUp, XCircle, Loader2, Users, DollarSign, Clock, ArrowRight,
  Maximize2, Paperclip, ExternalLink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const STAGE_LABELS: Record<Lead['stage'], string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

const STAGE_COLORS: Record<Lead['stage'], string> = {
  new: 'text-text-muted',
  contacted: 'text-blue-400',
  qualified: 'text-amber-400',
  proposal_sent: 'text-purple-400',
  negotiating: 'text-orange-400',
  won: 'text-text-green',
  lost: 'text-text-red',
};

const ACTIVITY_ICONS: Record<LeadActivity['type'], React.ElementType> = {
  call: Phone,
  email: Mail,
  note: MessageSquare,
  meeting: Users,
  proposal: FileText,
  follow_up: Calendar,
};

type Props = {
  lead: Lead | null;
  activities: LeadActivity[];
  currentUserId: string;
  onClose: () => void;
};

export function LeadDetailDrawer({ lead, activities, currentUserId, onClose }: Props) {
  const { toast } = useToast();
  const [activityType, setActivityType] = useState<LeadActivity['type']>('note');
  const [activityNote, setActivityNote] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [isFullDetailOpen, setIsFullDetailOpen] = useState(false);

  if (!lead) return null;

  const leadActivities = activities
    .filter(a => a.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function logActivity() {
    if (!activityNote.trim()) return;
    setSavingActivity(true);
    try {
      const id = await makeLeadActivityId();
      const activity: LeadActivity = {
        id,
        leadId: lead!.id,
        type: activityType,
        description: activityNote.trim(),
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'leadActivities'), { ...activity });
      await updateDoc(doc(db, 'leads', lead!.id), { updatedAt: new Date().toISOString() });
      setActivityNote('');
      toast({ title: 'Activity logged' });
    } catch {
      toast({ title: 'Failed to log activity', variant: 'destructive' });
    } finally {
      setSavingActivity(false);
    }
  }

  async function moveStage(stage: Lead['stage']) {
    setMovingStage(true);
    try {
      await updateDoc(doc(db, 'leads', lead!.id), {
        stage,
        updatedAt: new Date().toISOString(),
        ...(stage === 'won' || stage === 'lost' ? { closedAt: new Date().toISOString() } : {}),
      });
      const id = await makeLeadActivityId();
      await addDoc(collection(db, 'leadActivities'), {
        id,
        leadId: lead!.id,
        type: 'note',
        description: `Stage changed to ${STAGE_LABELS[stage]}`,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      });
      toast({ title: `Moved to ${STAGE_LABELS[stage]}` });
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    } finally {
      setMovingStage(false);
    }
  }

  const stageKeys = Object.keys(STAGE_LABELS) as Lead['stage'][];
  const currentIdx = stageKeys.indexOf(lead.stage);
  const nextStage = currentIdx < stageKeys.length - 1 ? stageKeys[currentIdx + 1] : null;

  return (
    <Sheet open={!!lead} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl bg-bg-secondary border-border-main overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border-sub">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-brand-red/10 rounded-lg shrink-0">
              <TrendingUp size={18} className="text-brand-red" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-sm font-black uppercase tracking-widest text-text-primary leading-tight">
                {lead.companyName}
              </SheetTitle>
              <SheetDescription className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
                {lead.contactName || 'No contact'} · {STAGE_LABELS[lead.stage]}
              </SheetDescription>
            </div>
          </div>

          {/* Stage badge + estimated value + full detail */}
          <div className="flex items-center gap-3 mt-2">
            <span className={cn('text-[10px] font-black uppercase tracking-widest', STAGE_COLORS[lead.stage])}>
              ● {STAGE_LABELS[lead.stage]}
            </span>
            {lead.estimatedValue > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-text-green uppercase">
                <DollarSign size={10} />
                {lead.estimatedValue.toLocaleString()}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 ml-auto text-[9px] font-bold uppercase tracking-wider"
              onClick={() => setIsFullDetailOpen(true)}
            >
              <Maximize2 size={10} className="mr-1.5" />
              Full Detail
              {(lead.attachments?.length ?? 0) > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-text-muted">
                  <Paperclip size={9} />{lead.attachments!.length}
                </span>
              )}
            </Button>
          </div>
        </SheetHeader>

        <div className="py-5 space-y-6">
          {/* Contact Info */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Contact</p>
            <div className="space-y-1.5">
              {lead.contactEmail && (
                <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <Mail size={11} className="text-brand-red shrink-0" />
                  {lead.contactEmail}
                </a>
              )}
              {lead.contactPhone && (
                <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
                  <Phone size={11} className="text-brand-red shrink-0" />
                  {lead.contactPhone}
                </a>
              )}
            </div>
          </div>

          {/* Stage Actions */}
          {lead.stage !== 'won' && lead.stage !== 'lost' && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Pipeline Actions</p>
              <div className="flex flex-wrap gap-2">
                {nextStage && nextStage !== 'won' && nextStage !== 'lost' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider"
                    onClick={() => moveStage(nextStage)}
                    disabled={movingStage}
                  >
                    <ArrowRight size={11} className="mr-1.5" />
                    Move to {STAGE_LABELS[nextStage]}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-8 text-[10px] font-bold uppercase tracking-wider bg-text-green/20 hover:bg-text-green/30 text-text-green border border-text-green/30"
                  onClick={() => moveStage('won')}
                  disabled={movingStage}
                >
                  <CheckCircle2 size={11} className="mr-1.5" />
                  Mark Won
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-red"
                  onClick={() => moveStage('lost')}
                  disabled={movingStage}
                >
                  <XCircle size={11} className="mr-1.5" />
                  Mark Lost
                </Button>
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Notes</p>
              <p className="text-xs text-text-muted leading-relaxed">{lead.notes}</p>
            </div>
          )}

          {/* Log Activity */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Log Activity</p>
            <div className="flex gap-2">
              <Select value={activityType} onValueChange={v => setActivityType(v as LeadActivity['type'])}>
                <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-tertiary border-border-main w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Add activity note..."
                value={activityNote}
                onChange={e => setActivityNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && logActivity()}
                className="h-9 text-xs bg-bg-tertiary border-border-main flex-1"
              />
              <Button
                size="sm"
                className="h-9 text-[10px] font-bold bg-brand-red hover:bg-brand-red/90 text-white px-3"
                onClick={logActivity}
                disabled={savingActivity || !activityNote.trim()}
              >
                {savingActivity ? <Loader2 size={12} className="animate-spin" /> : 'Log'}
              </Button>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">
              Activity Timeline ({leadActivities.length})
            </p>
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
                          <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                            {activity.type.replace('_', ' ')}
                          </span>
                          <span className="text-[9px] text-text-muted flex items-center gap-1">
                            <Clock size={9} />
                            {format(parseISO(activity.createdAt), 'MMM d, h:mm a')}
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
                {/* Core fields */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {([
                    ['Company', lead.companyName],
                    ['Contact', lead.contactName],
                    ['Email', lead.contactEmail],
                    ['Phone', lead.contactPhone],
                    ['Stage', STAGE_LABELS[lead.stage]],
                    ['Source', lead.source?.replace(/_/g, ' ')],
                    ['Estimated Value', lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : ''],
                    ['Assigned To', lead.assignedTo],
                    ['Created', lead.createdAt ? format(parseISO(lead.createdAt), 'MMM d, yyyy · h:mm a') : ''],
                    ['Updated', lead.updatedAt ? format(parseISO(lead.updatedAt), 'MMM d, yyyy · h:mm a') : ''],
                    ['Follow-Up', lead.followUpDate || ''],
                    ['Tags', (lead.tags || []).join(', ')],
                  ] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</p>
                      <p className="text-[11px] text-text-primary mt-0.5 break-words">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Notes / raw extract */}
                {lead.notes && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5">Notes / Extracted Text</p>
                    <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap rounded-lg border border-border-sub bg-bg-secondary p-3">{lead.notes}</p>
                  </div>
                )}

                {/* Original files */}
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-1.5 flex items-center gap-1.5">
                    <Paperclip size={9} /> Original Files ({lead.attachments?.length ?? 0})
                  </p>
                  {(lead.attachments?.length ?? 0) === 0 ? (
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">No files attached to this lead.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {lead.attachments!.map((att, i) => (
                        <a
                          key={i}
                          href={att.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red/40 transition-colors group"
                        >
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
