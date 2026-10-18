'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { FONT_OPTIONS } from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

// The preview sets the same CSS variables the app uses (globals.css
// [data-font]), so font-sans and font-mono inside it render exactly like the
// real pages would with that option.
const FONT_VARS: Record<string, { sans: string; mono: string }> = {
  default: { sans: "'Inter', sans-serif", mono: "'JetBrains Mono', monospace" },
  atkinson: { sans: "'Atkinson Hyperlegible', sans-serif", mono: "'Atkinson Hyperlegible', sans-serif" },
  lexend: { sans: "'Lexend', sans-serif", mono: "'Lexend', sans-serif" },
  plex: { sans: "'IBM Plex Sans', sans-serif", mono: "'IBM Plex Sans', sans-serif" },
};

/**
 * Account-level "Display Font" picker. Writes straight to the user's own
 * Firestore doc — AuthProvider applies the change app-wide (and to every
 * device that account signs into) the instant it lands, no page reload
 * needed. Drop this into any portal's Settings page.
 */
export function FontPreferenceSetting() {
  const { user } = useAuth();
  const { toast } = useToast();
  const current = user?.uiFontPreference || 'default';
  // Hovering/focusing an option previews it here without changing the
  // account's actual selection — only a click commits.
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const previewOpt = FONT_OPTIONS.find(o => o.value === (previewValue ?? current)) || FONT_OPTIONS[0];

  const handleSelect = async (value: string) => {
    if (!user || value === current) return;
    try {
      await updateDoc(doc(db, 'users', user.id), { uiFontPreference: value });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save font', description: e.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Type size={14} /> Display font
        </CardTitle>
        <CardDescription>
          Choose the font used across the app on your account. Applies only to you, on every device you sign into.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg border border-border-sub bg-bg-primary space-y-3"
          style={{ ['--app-font' as string]: (FONT_VARS[previewOpt.value] || FONT_VARS.default).sans, ['--app-mono-font' as string]: (FONT_VARS[previewOpt.value] || FONT_VARS.default).mono, fontFamily: 'var(--app-font)' } as React.CSSProperties}>
          <p className="text-[12px] font-medium text-text-muted">
            Preview — {previewOpt.label}{!previewValue && ' (current)'}
          </p>

          {/* A job card, as on Jobs and the dashboard */}
          <div className="rounded-xl border border-border-sub bg-bg-secondary p-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="id-text">18000777</span>
              <StatusBadge kind="job" value="in-progress" />
            </div>
            <p className="text-[15px] font-semibold text-text-primary">Cameras — Service call</p>
            <p className="text-[12px] text-text-muted">Lakeside Medical · Troy, MI · 0.16 mi</p>
            <div className="flex items-center justify-between text-[12px] text-text-muted">
              <span className="font-mono">10-22-2026 · 1:00 PM</span>
              <span className="font-mono font-semibold text-text-green">$150.00</span>
            </div>
          </div>

          {/* Status badges used across the app */}
          <div className="flex flex-wrap gap-1.5">
            {(['assigned', 'on-my-way', 'in-progress', 'completed'] as const).map(v => <StatusBadge key={v} kind="job" value={v} />)}
            <StatusBadge kind="log" value="submitted" />
            <StatusBadge kind="log" value="rejected" />
          </div>

          {/* A stat tile and a pay row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border-sub bg-bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Pending logs</p>
              <p className="text-2xl font-bold text-accent-gold">8</p>
              <p className="text-[12px] text-text-muted">Waiting for review</p>
            </div>
            <div className="rounded-xl border border-border-sub bg-bg-secondary p-3 space-y-1 text-[12px]">
              <div className="flex justify-between"><span className="text-text-muted">Week of 10-12-2026</span></div>
              <div className="flex justify-between"><span>WO 086613</span><span className="font-mono">$285.00</span></div>
              <div className="flex justify-between"><span>Mileage 46.8 mi</span><span className="font-mono">$31.36</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono text-text-green">$316.36</span></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm">Check in</Button>
            <Button size="sm" variant="outline">Submit log</Button>
          </div>
          <p className="text-[12px] text-text-muted">Easy to confuse: 0 O · 1 l I · 6 8 B · 5 S</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FONT_OPTIONS.map(opt => {
            const active = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setPreviewValue(opt.value)}
                onMouseLeave={() => setPreviewValue(null)}
                onFocus={() => setPreviewValue(opt.value)}
                onBlur={() => setPreviewValue(null)}
                className={cn(
                  'text-left p-3 rounded-md border transition-colors',
                  active
                    ? 'border-brand-red bg-brand-red-dim'
                    : 'border-border-sub bg-bg-secondary hover:border-border-main'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={cn('text-[13px] font-semibold', opt.sample)}>{opt.label}</span>
                  {active && <Check size={14} className="text-brand-red shrink-0" />}
                </div>
                <p className={cn('text-lg tracking-wide mb-1', opt.sample)}>0123456789</p>
                <p className="text-[12px] text-text-muted">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
