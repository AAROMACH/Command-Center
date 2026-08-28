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

const SAMPLE_TEXT = 'The quick brown fox jumps over 608 lazy dogs — Job #086613, Unit 8B, 0.16 miles';

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
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Type size={14} /> Display Font
        </CardTitle>
        <CardDescription>
          Choose the font used across the app on your account. Applies only to you, on every device you sign into.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg border border-border-sub bg-bg-primary">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">
            Preview — {previewOpt.label}{!previewValue && ' (current)'}
          </p>
          <p className={cn('text-2xl tracking-wide text-text-primary mb-1', previewOpt.sample)}>0123456789</p>
          <p className={cn('text-sm text-text-secondary', previewOpt.sample)}>{SAMPLE_TEXT}</p>
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
                  'text-left p-3 rounded-lg border transition-colors',
                  active
                    ? 'border-brand-red bg-brand-red-dim'
                    : 'border-border-sub bg-bg-secondary hover:border-border-main'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={cn('text-xs font-bold', opt.sample)}>{opt.label}</span>
                  {active && <Check size={14} className="text-brand-red shrink-0" />}
                </div>
                <p className={cn('text-lg tracking-wide mb-1', opt.sample)}>0123456789</p>
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
