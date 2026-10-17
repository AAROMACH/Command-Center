'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Client Portal Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
      <div className="p-4 bg-brand-red-dim border border-border-alert rounded-full">
        <AlertTriangle size={32} className="text-text-red" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
        <p className="text-sm text-text-muted max-w-sm">
          We couldn't load this page. Please try again.
        </p>
      </div>
      <Button
        onClick={reset}
      >
        <RotateCcw size={14} className="mr-2" />
        Try again
      </Button>
    </div>
  );
}
