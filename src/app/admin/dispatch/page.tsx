import { Suspense } from 'react';
import { DispatchPageClient } from './components/dispatch-page-client';

export default function DispatchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-text-muted text-[10px] uppercase tracking-widest">Initializing Dispatch Terminal...</div>}>
      <DispatchPageClient />
    </Suspense>
  );
}