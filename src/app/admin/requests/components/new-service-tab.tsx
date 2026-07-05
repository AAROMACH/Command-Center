import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { NewServiceRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CheckCircle2, ExternalLink, FileText, Mail, MapPin, Phone, XCircle } from 'lucide-react';
import { priorityCls, statusCls, fmtDate, mapSource } from '../lib/helpers';
import { Pill } from './pill';

export function NewServiceTab({ requests, viewMode = 'grid' }: { requests: NewServiceRequest[]; viewMode?: 'grid' | 'list' }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<NewServiceRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const pending = requests.filter(r => ['pending_review', 'contacted', 'needs_more_info'].includes(r.status));
  const resolved = requests.filter(r => !['pending_review', 'contacted', 'needs_more_info'].includes(r.status));

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
        <span className="text-[12px] font-bold text-text-primary">{(req.serviceTypes || [])[0] || req.fullName}</span>
        {req.companyName && <span className="text-[10px] text-text-muted ml-2">{req.companyName}</span>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', pCls(req.priorityLevel))}>{req.priorityLevel}</span>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>{(req.status || '').replace(/_/g, ' ')}</span>
      </div>
    </button>
  );

  const card = (req: NewServiceRequest) => (
    <button key={req.id} type="button" onClick={() => { setSelected(req); setNotes(req.internalNotes || ''); }}
      className="w-full rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-2.5 text-left hover:border-border-main transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text-primary truncate">{(req.serviceTypes || [])[0] || req.fullName}</p>
          {req.companyName && <p className="text-[10px] text-text-muted truncate">{req.companyName}</p>}
          <p className="text-[10px] text-text-muted">{req.fullName}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', pCls(req.priorityLevel))}>{req.priorityLevel}</span>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(req.status))}>{(req.status || '').replace(/_/g, ' ')}</span>
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
                  <Pill cls={statusCls(selected.status)} label={(selected.status || '').replace(/_/g, ' ')} />
                  <Pill cls={pCls(selected.priorityLevel)} label={selected.priorityLevel || ''} />
                </div>
                <p className="text-[15px] font-black text-text-primary">{(selected.serviceTypes || [])[0] || selected.fullName}</p>
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
              {(selected.serviceTypes || []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {(selected.serviceTypes || []).map(t => (
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
