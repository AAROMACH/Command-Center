'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { ClipboardList, MapPin } from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import type { SiteWalk, SiteWalkStatus } from '@/lib/estimating';
import type { Technician } from '@/lib/types';

export const WALK_STATUS: Record<SiteWalkStatus, { label: string; variant: 'draft' | 'info' | 'disputed' | 'approved' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'draft' },
  submitted: { label: 'Needs approval', variant: 'info' },
  returned: { label: 'Sent back', variant: 'disputed' },
  approved: { label: 'Quoted', variant: 'approved' },
  archived: { label: 'Archived', variant: 'outline' },
};

/** Live site walks: every walk (office), or a tech's own + assigned ones. */
export function useSiteWalks(scope: { all: true } | { techId: string | null }) {
  const [walks, setWalks] = useState<SiteWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const techId = 'techId' in scope ? scope.techId : null;
  const all = 'all' in scope;
  useEffect(() => {
    if (!all && !techId) return;
    const byId = new Map<string, Map<string, SiteWalk>>();
    const emit = () => {
      const merged = new Map<string, SiteWalk>();
      byId.forEach(m => m.forEach((v, k) => merged.set(k, v)));
      setWalks([...merged.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
      setLoading(false);
    };
    const listen = (key: string, q: ReturnType<typeof query>): Unsubscribe => onSnapshot(q, snap => {
      byId.set(key, new Map(snap.docs.map(d => [d.id, { ...(d.data() as SiteWalk), id: d.id }])));
      emit();
    }, () => setLoading(false));
    const subs = all
      ? [listen('all', query(collection(db, 'siteWalks')))]
      : [listen('mine', query(collection(db, 'siteWalks'), where('createdBy', '==', techId))),
         listen('assigned', query(collection(db, 'siteWalks'), where('assignedTechId', '==', techId)))];
    return () => subs.forEach(u => u());
  }, [all, techId]);
  return { walks, loading };
}

export function SiteWalkList({ walks, loading, onOpen, techs, search = '' }: {
  walks: SiteWalk[];
  loading: boolean;
  onOpen: (w: SiteWalk) => void;
  /** Office view: assign a draft walk to a tech (for a walk they'll do on site). */
  techs?: Technician[];
  search?: string;
}) {
  const [filter, setFilter] = useState<'open' | 'submitted' | 'approved' | 'all'>('open');
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => walks
    .filter(w => filter === 'all' || (filter === 'open' ? ['draft', 'returned', 'submitted'].includes(w.status) : w.status === filter))
    .filter(w => !q || [w.id, w.customerCompany, w.siteName, w.siteAddress, w.createdByName, w.assignedTechName, w.quoteId].some(v => (v || '').toLowerCase().includes(q))),
    [walks, filter, q]);
  const count = (f: typeof filter) => walks.filter(w => f === 'all' || (f === 'open' ? ['draft', 'returned', 'submitted'].includes(w.status) : w.status === f)).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto">
        {([['open', 'Open'], ['submitted', 'Needs approval'], ['approved', 'Quoted'], ['all', 'All']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={cn('shrink-0 h-10 px-4 rounded-full border text-[13px] font-medium', filter === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
            {label} <span className="opacity-70">{count(k)}</span>
          </button>
        ))}
      </div>
      {!loading && !shown.length && <EmptyState icon={ClipboardList} title="No site walks here" description="Start a site walk to scope a job on site or from plans." />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map(w => {
          const st = WALK_STATUS[w.status];
          return (
            <div key={w.id} className="rounded-xl border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
              <button type="button" onClick={() => onOpen(w)} className="w-full text-left p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-semibold text-text-primary min-w-0 break-words">{w.customerCompany || w.siteName || 'Untitled walk'}</p>
                  <Badge variant={st.variant} className="shrink-0 text-[10px] uppercase tracking-wide">{st.label}</Badge>
                </div>
                {w.siteName && w.customerCompany && <p className="text-[13px] text-text-secondary">{w.siteName}</p>}
                <p className="text-[12px] text-text-muted flex items-center gap-1"><MapPin size={12} /> {[w.siteAddress, w.siteState].filter(Boolean).join(', ') || '—'}</p>
                <p className="text-[12px] text-text-muted">
                  <span className="font-mono">{w.id}</span> · {w.mode === 'remote' ? 'Remote' : 'On site'} · {w.createdByName}{w.assignedTechName && w.assignedTechName !== w.createdByName ? ` → ${w.assignedTechName}` : ''} · {(w.updatedAt || '').slice(0, 10)}
                  {w.quoteId && <> · quote <span className="font-mono">{w.quoteId}</span></>}
                </p>
                {w.status === 'returned' && w.returnNote && <p className="text-[12px] text-accent-gold">Sent back: {w.returnNote}</p>}
              </button>
              {techs && w.status === 'draft' && (
                <div className="px-4 pb-3">
                  <Select value={w.assignedTechId || 'none'} onValueChange={async v => {
                    const t = techs.find(x => x.id === v);
                    await updateDoc(doc(db, 'siteWalks', w.id), { assignedTechId: t?.id ?? null, assignedTechName: t?.name ?? null, updatedAt: new Date().toISOString() });
                  }}>
                    <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="Assign to a tech…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not assigned</SelectItem>
                      {techs.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
