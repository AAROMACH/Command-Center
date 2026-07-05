import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, Loader2, Briefcase, Phone, Mail, FileText, MapPin, User,
} from 'lucide-react';
import { KIND_CFG, fmtDate, statusCls, priorityCls, priorityLabel, type NormalizedItem } from '../lib/helpers';
import { Pill } from './pill';
import { RequestTimeline } from './request-timeline';

export function RequestDetailSheet({
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
  const isPending = ['pending_review', 'pending', 'contacted', 'needs_more_info'].includes(item.status);
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
            <Pill cls={statusCls(item.status)} label={(item.status || '').replace(/_/g, ' ')} />
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
              {(item.description || (sr?.serviceTypes || []).length > 0) && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Request Details</p>
                  {item.description && <p className="text-[11px] text-text-secondary leading-relaxed">{item.description}</p>}
                  {(sr?.serviceTypes || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Requested Services</p>
                      <ul className="space-y-0.5">
                        {(sr?.serviceTypes || []).map(t => (
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
              {(sr?.supportingFiles || []).length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">Attachments</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(sr?.supportingFiles || []).slice(0, 3).map((f, i) => (
                      <a key={i} href={(f as any).downloadUrl || '#'} target="_blank" rel="noreferrer"
                        className="h-14 w-14 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center overflow-hidden hover:border-border-main transition-colors">
                        {(f as any).downloadUrl && (f as any).fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={(f as any).downloadUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FileText size={18} className="text-text-muted" />
                        )}
                      </a>
                    ))}
                    {(sr?.supportingFiles || []).length > 3 && (
                      <div className="h-14 w-14 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center">
                        <span className="text-[11px] font-bold text-text-muted">+{(sr?.supportingFiles || []).length - 3}</span>
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
              <XCircle size={12} className="mr-1.5" />{item.kind === 'access' || item.kind === 'personnel' ? 'Deny' : 'Reject'}
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 text-[9px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
              disabled={acting}
              onClick={async () => { setActing(true); await onApprove(item); setActing(false); }}
            >
              <CheckCircle2 size={12} className="mr-1.5" />Approve
            </Button>
            {(item.kind === 'service' || item.kind === 'client') && (
              <Button
                size="sm"
                className="flex-1 h-9 text-[9px] font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white"
                disabled={acting}
                onClick={() => onConvert(item)}
              >
                <Briefcase size={12} className="mr-1.5" />Convert to Job
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
