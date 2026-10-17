import { Suspense } from 'react';
import { DispatchPageClient } from './components/dispatch-page-client';
import { PageLoading } from '@/components/empty-state';

export default function DispatchPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading dispatch…" />}>
      <DispatchPageClient />
    </Suspense>
  );
}