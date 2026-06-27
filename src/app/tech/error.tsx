'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function TechError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Tech Portal Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
      <div className="p-4 bg-brand-red-dim border border-border-alert rounded-full">
        <AlertTriangle size={32} className="text-text-red" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold uppercase tracking-widest text-text-primary">Connection Error</h2>
        <p className="text-sm text-text-muted max-w-sm">
          Unable to load your dashboard. Check your connection and try again.
        </p>
      </div>
      <Button
        onClick={reset}
        className="h-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white"
      >
        <RotateCcw size={14} className="mr-2" />
        Retry
      </Button>
    </div>
  );
}
