'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, Link2, Loader2, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { IntegrationState, IntegrationStatus } from '@/app/api/integrations/status/route';

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

const BADGE: Record<IntegrationState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: 'Connected', cls: 'text-text-green', Icon: CheckCircle2 },
  failed: { label: 'Not working', cls: 'text-brand-red', Icon: TriangleAlert },
  missing: { label: 'Not set up', cls: 'text-text-muted', Icon: CircleDashed },
  untested: { label: 'Set — not tested', cls: 'text-accent-gold', Icon: CircleDashed },
  unused: { label: 'Not used', cls: 'text-text-muted', Icon: CircleDashed },
};

const when = (iso: string) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };

/**
 * The Maps key is a browser key locked to the site's address, so it's tested
 * here: load the Maps script and listen for Google's auth-failure hook.
 */
function testMapsKey(key: string): Promise<{ ok: boolean; detail: string }> {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve({ ok: !w.__mapsAuthFailed, detail: w.__mapsAuthFailed ? 'Google rejected the key on this page' : 'Loaded on this page without errors' });
  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean, detail: string) => { if (!done) { done = true; resolve({ ok, detail }); } };
    w.gm_authFailure = () => { w.__mapsAuthFailed = true; finish(false, 'Google rejected the key (invalid, billing off, or not allowed for app.aaromach.com)'); };
    w.__ccMapsTest = () => setTimeout(() => finish(!w.__mapsAuthFailed, 'Key accepted by Google Maps in your browser'), 2500);
    const sc = document.createElement('script');
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__ccMapsTest&loading=async`;
    sc.async = true;
    sc.onerror = () => finish(false, 'Couldn’t load Google Maps');
    document.head.appendChild(sc);
    setTimeout(() => finish(false, 'Google Maps didn’t answer in time'), 12000);
  });
}

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
      setQbo(b);
      const items: IntegrationStatus[] = a.integrations;
      setList(items);
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (key && items.some(i => i.id === 'maps')) {
        const r = await testMapsKey(key);
        setList(cur => (cur || []).map(i => (i.id === 'maps' ? { ...i, state: r.ok ? 'connected' : 'failed', detail: r.detail } : i)));
      }
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
        const b = BADGE[i.state];
        return (
          <Card key={i.id} id={i.id === 'quickbooks' ? 'quickbooks' : undefined} className="bg-bg-secondary border-border-main">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-start gap-3">
                <b.Icon size={18} className={cn('mt-0.5 shrink-0', b.cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-text-primary">{i.name}</p>
                    <Badge variant={i.state === 'connected' ? 'active' : 'outline'} className={cn('text-[10px] h-4 px-2', i.state === 'failed' && 'border-brand-red/50 text-brand-red')}>{b.label}</Badge>
                  </div>
                  <p className="text-[12px] text-text-muted">{i.purpose}</p>
                  <p className={cn('text-[12px] mt-1', i.state === 'failed' ? 'text-brand-red' : 'text-text-secondary')}>{i.detail}</p>
                  {i.lastUse && (
                    <p className={cn('text-[11px] mt-0.5', i.lastUse.ok ? 'text-text-muted' : 'text-brand-red')}>
                      Last real use {when(i.lastUse.at)}: {i.lastUse.ok ? 'worked' : `failed — ${i.lastUse.error}`}
                    </p>
                  )}
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
                  <span key={x.name} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]',
                    x.set ? 'border-text-green/30 text-text-green' : x.optional ? 'border-border-sub text-text-muted' : 'border-brand-red/40 text-brand-red')}
                    title={x.set ? 'Set in hosting' : x.optional ? 'Not set — the built-in default is used' : 'Required — not set in hosting'}>
                    {x.set ? '✓' : x.optional ? '○' : '✕'} {x.name}{x.secret ? ' (secret)' : ''}{!x.set && x.optional ? ' · default' : ''}{!x.set && !x.optional ? ' · missing' : ''}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-[11px] text-text-muted">Checked live just now: Connected means the service answered a real test. Failures in everyday use (an email or QuickBooks call that didn’t go through) also show here, and Super Admins get an alert when a service stops working. Keys are set in Firebase App Hosting (secrets in Google Secret Manager). This page only shows whether each is set — never the value.</p>
    </div>
  );
}
