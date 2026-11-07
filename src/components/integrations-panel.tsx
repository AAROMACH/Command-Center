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
  untested: { label: 'Set up', cls: 'text-accent-gold', Icon: CircleDashed },
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
  const checkPayments = async () => {
    setBusy('refresh');
    try {
      const d = await authed('/api/quickbooks/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'payments' }) });
      toast({ title: d.paid ? `${d.paid} invoice${d.paid === 1 ? '' : 's'} marked paid` : 'No new payments', description: `Checked ${d.checked} open invoice${d.checked === 1 ? '' : 's'} in QuickBooks.` });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not check', description: e.message }); }
    finally { setBusy(null); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Invoices stop syncing until someone connects again. Nothing in QuickBooks is deleted.')) return;
    setBusy('disconnect');
    try { await authed('/api/quickbooks/disconnect', { method: 'POST' }); toast({ title: 'QuickBooks disconnected' }); await load(); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not disconnect', description: e.message }); }
    finally { setBusy(null); }
  };

  if (error) return <p className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-2 text-[13px] text-brand-red">{error}</p>;
  if (!list) return <p className="text-[13px] text-text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Checking connections…</p>;

  const problems = list.filter(i => i.state === 'failed').length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('text-[13px] font-medium', problems ? 'text-brand-red' : 'text-text-secondary')}>
          {problems ? `${problems} connection${problems === 1 ? ' needs' : 's need'} attention` : 'Everything the app connects to, and whether it’s working.'}
        </p>
        <Button variant="outline" size="sm" className="h-8" disabled={!!busy} onClick={async () => { setBusy('refresh'); await load(); setBusy(null); }}>
          <RefreshCw size={13} className={cn('mr-1.5', busy === 'refresh' && 'animate-spin')} /> Check again
        </Button>
      </div>
      {list.map(i => {
        const b = BADGE[i.state];
        const plain = PLAIN[i.id];
        const summary = plainSummary(i, qbo);
        return (
          <Card key={i.id} id={i.id === 'quickbooks' ? 'quickbooks' : undefined} className="bg-bg-secondary border-border-main">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-start gap-3">
                <b.Icon size={18} className={cn('mt-0.5 shrink-0', b.cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-text-primary">{plain?.name || i.name}</p>
                    <span className={cn('text-[11px] font-semibold', b.cls)}>{b.label}</span>
                  </div>
                  <p className="text-[12px] text-text-muted">{plain?.what || i.purpose}</p>
                  {summary && <p className={cn('text-[12px] mt-1', i.state === 'failed' ? 'text-brand-red' : 'text-text-secondary')}>{summary}</p>}
                </div>
                {i.id === 'quickbooks' && qbo?.configured && (
                  qbo.connected ? (
                    <div className="flex flex-wrap gap-2">
                    {qbo.live && (
                      <Button variant="outline" size="sm" className="h-9" disabled={!!busy} onClick={checkPayments} title="Mark invoices paid that were paid in QuickBooks">
                        <RefreshCw size={13} className="mr-1.5" /> Check payments
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-9" disabled={!!busy} onClick={disconnect}>
                      {busy === 'disconnect' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Unplug size={13} className="mr-1.5" />} Disconnect
                    </Button>
                    </div>
                  ) : (
                    <Button size="sm" className="h-9 bg-text-green hover:bg-text-green/90 text-white" disabled={!!busy} onClick={connect}>
                      {busy === 'connect' ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Link2 size={13} className="mr-1.5" />} Connect
                    </Button>
                  )
                )}
              </div>
              {/* The technical part (exact error, key names) — for whoever sets up hosting. */}
              <details className="pl-8 group">
                <summary className="cursor-pointer select-none text-[11px] text-text-muted hover:text-text-primary">Technical details</summary>
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-[11px] text-text-muted break-words">{i.detail}</p>
                  {i.lastUse && (
                    <p className={cn('text-[11px]', i.lastUse.ok ? 'text-text-muted' : 'text-brand-red')}>
                      Last used {when(i.lastUse.at)}: {i.lastUse.ok ? 'worked' : `failed — ${i.lastUse.error}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {i.vars.map(x => (
                      <span key={x.name} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]',
                        x.set ? 'border-text-green/30 text-text-green' : x.optional ? 'border-border-sub text-text-muted' : 'border-brand-red/40 text-brand-red')}>
                        {x.set ? '✓' : x.optional ? '○' : '✕'} {x.name}
                      </span>
                    ))}
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-[11px] text-text-muted">Super Admins get an alert if a connection stops working. Keys are kept in Firebase hosting — this page never shows them.</p>
    </div>
  );
}

/** Plain names and what each one does for the business. */
const PLAIN: Record<string, { name: string; what: string }> = {
  resend: { name: 'Email', what: 'Sends invoices, notifications and the daily sales email.' },
  quickbooks: { name: 'QuickBooks', what: 'Accounting: customers, invoices and payments.' },
  twilio: { name: 'Text messages', what: 'Sends text alerts to staff and clients.' },
  maps: { name: 'Google Maps', what: 'Address lookup, job maps and routes.' },
  push: { name: 'Phone notifications', what: 'Pop-up alerts on phones and browsers.' },
  digest: { name: 'Daily sales email', what: 'The scheduled morning sales summary.' },
};

/** One short sentence an office user understands. */
function plainSummary(i: IntegrationStatus, qbo: QboStatus | null): string {
  if (i.id === 'quickbooks') {
    if (!qbo?.configured) return 'Not set up yet.';
    if (!qbo.connected) return 'Ready — press Connect and sign in to QuickBooks.';
    if (!qbo.live) return 'Lost the connection. Disconnect, then connect again.';
    return `Connected to ${qbo.companyName || 'your company'}${qbo.env === 'production' ? '' : ' (test company)'}${qbo.connectedByName ? ` by ${qbo.connectedByName}` : ''}.`;
  }
  switch (i.state) {
    case 'connected': return i.lastUse && !i.lastUse.ok ? 'Working now, but it failed recently — see details.' : 'Working.';
    case 'failed': return 'Not working right now — see details, or ask whoever manages hosting.';
    case 'missing': return 'Not set up, so this is turned off.';
    case 'untested': return 'Set up. It can’t be tested from here.';
    case 'unused': return 'Not used by the app — safe to remove.';
  }
}
