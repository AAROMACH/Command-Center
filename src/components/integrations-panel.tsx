'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, Link2, Loader2, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { IntegrationStatus } from '@/app/api/integrations/status/route';

type QboStatus = {
  connected: boolean; configured: boolean; env: string; live?: boolean; error?: string;
  companyName?: string; connectedByName?: string; connectedAt?: string; refreshExpiresAt?: string;
};

const authed = async (url: string, init: RequestInit = {}) => {
  const t = await auth.currentUser?.getIdToken();
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
};

const BADGE: Record<IntegrationStatus['status'], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ready: { label: 'Ready', cls: 'text-text-green', Icon: CheckCircle2 },
  partial: { label: 'Needs setup', cls: 'text-accent-gold', Icon: TriangleAlert },
  missing: { label: 'Not set up', cls: 'text-text-muted', Icon: CircleDashed },
  unused: { label: 'Not used', cls: 'text-text-muted', Icon: CircleDashed },
};

/**
 * Settings → Integrations (Super Admins): every outside service the app uses,
 * whether this deployment has its keys (never the values), and QuickBooks
 * Connect / Disconnect.
 */
export function IntegrationsPanel() {
  const { toast } = useToast();
  const [list, setList] = useState<IntegrationStatus[] | null>(null);
  const [qbo, setQbo] = useState<QboStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'refresh' | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, b] = await Promise.all([authed('/api/integrations/status'), authed('/api/quickbooks/status')]);
      setList(a.integrations); setQbo(b);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Back from Intuit: ?qbo=connected | error&msg=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('qbo');
    if (!r) return;
    toast(r === 'connected' ? { title: 'QuickBooks connected' } : { variant: 'destructive', title: 'QuickBooks not connected', description: p.get('msg') || undefined });
    window.history.replaceState(null, '', window.location.pathname + '#quickbooks');
  }, [toast]);

  const connect = async () => {
    setBusy('connect');
    try { window.location.href = (await authed('/api/quickbooks/connect', { method: 'POST' })).url; }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not start', description: e.message }); setBusy(null); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Invoices stop syncing until someone connects again. Nothing in QuickBooks is deleted.')) return;
    setBusy('disconnect');
    try { await authed('/api/quickbooks/disconnect', { method: 'POST' }); toast({ title: 'QuickBooks disconnected' }); await load(); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not disconnect', description: e.message }); }
    finally { setBusy(null); }
  };

  if (error) return <p className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-2 text-[13px] text-brand-red">{error}</p>;
  if (!list) return <p className="text-[13px] text-text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Checking integrations…</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-8" disabled={!!busy} onClick={async () => { setBusy('refresh'); await load(); setBusy(null); }}>
          <RefreshCw size={13} className={cn('mr-1.5', busy === 'refresh' && 'animate-spin')} /> Recheck
        </Button>
      </div>
      {list.map(i => {
        const b = BADGE[i.status];
        return (
          <Card key={i.id} id={i.id === 'quickbooks' ? 'quickbooks' : undefined} className="bg-bg-secondary border-border-main">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-start gap-3">
                <b.Icon size={18} className={cn('mt-0.5 shrink-0', b.cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-text-primary">{i.name}</p>
                    <Badge variant={i.status === 'ready' ? 'active' : 'outline'} className="text-[10px] h-4 px-2">{b.label}</Badge>
                  </div>
                  <p className="text-[12px] text-text-muted">{i.purpose}</p>
                  <p className="text-[12px] text-text-secondary mt-1">{i.detail}</p>
                </div>
                {i.id === 'quickbooks' && qbo?.configured && (
                  qbo.connected ? (
                    <Button variant="outline" size="sm" className="h-9" disabled={!!busy} onClick={disconnect}>
                      {busy === 'disconnect' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Unplug size={13} className="mr-1.5" />} Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" className="h-9 bg-text-green hover:bg-text-green/90 text-white" disabled={!!busy} onClick={connect}>
                      {busy === 'connect' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Link2 size={13} className="mr-1.5" />} Connect to QuickBooks
                    </Button>
                  )
                )}
              </div>
              {i.id === 'quickbooks' && qbo?.connected && (
                <p className={cn('text-[12px] pl-8', qbo.live ? 'text-text-muted' : 'text-brand-red')}>
                  {qbo.live
                    ? `Connected by ${qbo.connectedByName || 'an admin'}${qbo.connectedAt ? ` on ${new Date(qbo.connectedAt).toLocaleDateString()}` : ''} · ${qbo.env === 'production' ? 'live books' : 'sandbox (test company)'}`
                    : `Connected, but QuickBooks isn't answering: ${qbo.error}. Disconnect and connect again.`}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pl-8">
                {i.vars.map(x => (
                  <span key={x.name} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', x.set ? 'border-text-green/30 text-text-green' : 'border-border-sub text-text-muted')}
                    title={x.set ? 'Set in hosting' : 'Not set'}>
                    {x.set ? '✓' : '—'} {x.name}{x.secret ? ' (secret)' : ''}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-[11px] text-text-muted">Keys are set in Firebase App Hosting (secrets in Google Secret Manager). This page only shows whether each is set — never the value.</p>
    </div>
  );
}
