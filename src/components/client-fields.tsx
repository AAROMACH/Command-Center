'use client';

import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, MapPin } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { isClient } from '@/lib/permissions';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { useAuth } from '@/contexts/auth-context';
import { Input } from '@/components/ui/input';
import type { Technician } from '@/lib/types';

/**
 * Client and address fields used by every form that asks for a client:
 *  - ClientField: type-ahead of IN-APP clients (Field Nation customer names on
 *    imported jobs aren't clients and aren't listed). A typed name is still
 *    accepted — for an imported job's customer, or someone not in the app yet.
 *  - SiteAddressField: type-ahead of the chosen client's saved sites (the
 *    Sites list and older account-level sites), or type any address. Takes a
 *    ref so a form can keep Google address autocomplete on the same input.
 */

export type DirClient = { id: string; company: string; name: string; email: string; phone: string };
export type DirSite = { id: string; clientId: string; name: string; location: string };

let apiCache: Promise<{ clients: DirClient[]; sites: DirSite[] }> | null = null;

/** In-app clients and their sites. Admins read them live; others via the server. */
export function useClientDirectory(): { clients: DirClient[]; sites: DirSite[] } {
  const { isAdmin, loading } = useAuth();
  const [users, setUsers] = useState<Technician[]>([]);
  const [siteDocs, setSiteDocs] = useState<{ id: string; name?: string; location?: string; clientId?: string; clientName?: string; status?: string }[]>([]);
  const [api, setApi] = useState<{ clients: DirClient[]; sites: DirSite[] } | null>(null);
  useEffect(() => {
    if (loading) return;
    if (isAdmin) {
      const u1 = onSharedSnapshot('users', s => setUsers(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician))), () => setUsers([]));
      const u2 = onSharedSnapshot('sites', s => setSiteDocs(s.docs.map(d => ({ ...(d.data() as object), id: d.id }))), () => setSiteDocs([]));
      return () => { u1(); u2(); };
    }
    let alive = true;
    if (!apiCache) {
      apiCache = (async () => {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/site-walk/clients', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('clients');
        return res.json();
      })();
      apiCache.catch(() => { apiCache = null; });
    }
    apiCache.then(d => alive && setApi(d)).catch(() => {});
    return () => { alive = false; };
  }, [isAdmin, loading]);

  return useMemo(() => {
    if (!isAdmin) return api || { clients: [], sites: [] };
    const active = users.filter(u => isClient(u) && u.approvalStatus !== 'pending' && u.approvalStatus !== 'denied'
      && u.accountStatus !== 'inactive' && (u.clientCompany || u.name));
    const clients: DirClient[] = active.map(u => ({ id: u.id, company: u.clientCompany || u.name || '', name: u.name || '', email: u.email || '', phone: u.phone || '' }))
      .sort((a, b) => a.company.localeCompare(b.company));
    const byCompany = new Map(clients.map(c => [c.company.trim().toLowerCase(), c.id]));
    const ids = new Set(clients.map(c => c.id));
    const sites: DirSite[] = siteDocs.filter(s => s.status !== 'inactive').map(s => ({
      id: s.id, name: s.name || '', location: s.location || '',
      clientId: (s.clientId && ids.has(s.clientId) ? s.clientId : byCompany.get((s.clientName || '').trim().toLowerCase())) || '',
    })).filter(s => s.clientId && (s.name || s.location));
    active.forEach(u => (u.managedSites || []).forEach((m, i) => {
      if (!(m.name || m.location) || sites.some(x => x.clientId === u.id && x.location === m.location)) return;
      sites.push({ id: m.id || `${u.id}-site-${i}`, clientId: u.id, name: m.name || '', location: m.location || '' });
    }));
    return { clients, sites };
  }, [isAdmin, api, users, siteDocs]);
}

/** Find the in-app client a stored name belongs to (forms that only keep the name). */
export const clientByName = (clients: DirClient[], name: string | null | undefined) =>
  clients.find(c => c.company.trim().toLowerCase() === (name || '').trim().toLowerCase()) || null;

function Dropdown({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border-main bg-bg-elevated shadow-xl">{children}</div>;
}

export function ClientField({ value, clientId, onChange, clients, placeholder = 'Start typing a client…', className, hint = true }: {
  /** The client name shown in the box. */
  value: string;
  /** The picked in-app client's id, when known. */
  clientId?: string | null;
  /** Typing → (text, null). Picking → (company, client). */
  onChange: (name: string, client: DirClient | null) => void;
  clients: DirClient[];
  placeholder?: string;
  className?: string;
  /** Show "App client" / "Not an app client" under the box. */
  hint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const shown = clients.filter(c => !q || `${c.company} ${c.name} ${c.email}`.toLowerCase().includes(q)).slice(0, 12);
  const linked = clientId ? clients.find(c => c.id === clientId) : clientByName(clients, value);
  return (
    <div className="relative">
      <Input value={value} placeholder={placeholder} className={className} autoComplete="off"
        onChange={e => { onChange(e.target.value, null); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <Dropdown open={open && shown.length > 0}>
        {shown.map(c => (
          <button key={c.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(c.company, c); setOpen(false); }}
            className={cn('w-full text-left px-3 py-2.5 border-b border-border-sub last:border-0 hover:bg-bg-tertiary', c.id === linked?.id && 'bg-bg-tertiary')}>
            <span className="block text-[13px] font-semibold text-text-primary">{c.company}</span>
            {(c.name || c.email) && <span className="block text-[11px] text-text-muted">{[c.name !== c.company ? c.name : '', c.email].filter(Boolean).join(' · ')}</span>}
          </button>
        ))}
      </Dropdown>
      {hint && value.trim() && (linked
        ? <p className="mt-1 text-[11px] text-text-green flex items-center gap-1"><Check size={11} /> App client</p>
        : <p className="mt-1 text-[11px] text-text-muted">Not an app client (typed name).</p>)}
    </div>
  );
}

export const SiteAddressField = forwardRef<HTMLInputElement, {
  value: string;
  /** The client whose saved sites to offer. */
  clientId?: string | null;
  /** Typing → (text, null). Picking a site → (its address, site). */
  onChange: (address: string, site: DirSite | null) => void;
  sites: DirSite[];
  placeholder?: string;
  className?: string;
  /** e.g. a "verify address" button inside the box. */
  right?: ReactNode;
}>(function SiteAddressField({ value, clientId, onChange, sites, placeholder, className, right }, ref) {
  const [open, setOpen] = useState(false);
  const mine = sites.filter(s => s.clientId === clientId);
  const q = value.trim().toLowerCase();
  // Their sites while the box is empty or matches one; otherwise get out of the
  // way of address autocomplete.
  const shown = mine.filter(s => !q || `${s.name} ${s.location}`.toLowerCase().includes(q));
  return (
    <div className="relative">
      <Input ref={ref} value={value} autoComplete="off" className={className}
        placeholder={placeholder || (mine.length ? 'Pick one of their sites, or type an address' : 'Full address…')}
        onChange={e => { onChange(e.target.value, null); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {right}
      <Dropdown open={open && shown.length > 0}>
        <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Their sites</p>
        {shown.map(s => (
          <button key={s.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(s.location || s.name, s); setOpen(false); }}
            className="w-full text-left px-3 py-2.5 border-b border-border-sub last:border-0 hover:bg-bg-tertiary flex items-start gap-2">
            <MapPin size={13} className="text-brand-red mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-text-primary">{s.name || s.location}</span>
              {s.name && <span className="block text-[11px] text-text-muted">{s.location}</span>}
            </span>
          </button>
        ))}
      </Dropdown>
    </div>
  );
});
