import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { ClientIntakeRequest, SiteRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Building2, CheckCircle2, ChevronDown, ExternalLink, Globe, Mail, MapPin, Phone, UserCheck, XCircle,
} from 'lucide-react';
import { statusCls } from '../lib/helpers';

export function ClientIntakeTab({ requests, siteReqs, viewMode = 'grid' }: {
  requests: ClientIntakeRequest[]; siteReqs: SiteRequest[]; viewMode?: 'grid' | 'list';
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<ClientIntakeRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSiteReqs, setShowSiteReqs] = useState(false);

  const pendingIntake = requests.filter(r => ['pending_review', 'contacted'].includes(r.status));
  const resolvedIntake = requests.filter(r => !['pending_review', 'contacted'].includes(r.status));

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
      {(req.serviceInterests || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(req.serviceInterests || []).slice(0, 3).map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-muted">{t}</span>
          ))}
          {(req.serviceInterests || []).length > 3 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-muted">+{(req.serviceInterests || []).length - 3}</span>
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
                    {selected.subscriptionTier === 'not_sure' ? 'Tier TBD' : selected.subscriptionTier ? `${selected.subscriptionTier} tier` : 'Tier N/A'}
                  </span>
                  <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest', statusCls(selected.status))}>
                    {(selected.status || '').replace(/_/g, ' ')}
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
                <p className="text-[11px] text-text-secondary">{selected.industryType || '—'}{selected.numberOfLocations ? ` · ${selected.numberOfLocations} location${selected.numberOfLocations !== '1' ? 's' : ''}` : ''}</p>
                {selected.totalEmployeeCount && <p className="text-[11px] text-text-muted">{selected.totalEmployeeCount} employees</p>}
                <p className="text-[11px] text-text-muted flex items-center gap-1"><MapPin size={10} />{selected.primaryOperatingRegion}</p>
              </div>
              {selected.currentPainPoints && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pain Points</p>
                  <p className="text-[12px] text-text-primary leading-relaxed">{selected.currentPainPoints}</p>
                </div>
              )}
              {(selected.serviceInterests?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Service Interests</p>
                  <div className="flex flex-wrap gap-1">
                    {(selected.serviceInterests || []).map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
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
