'use client';
import { Suspense } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { SiteWalkPage } from '@/components/site-walk/site-walk-page';

/** Admin / Sales: one site walk (or /new to start one). Reviewing happens on Quotes & Invoices → Site walks. */
export default function OfficeSiteWalk() {
    const { id } = useParams<{ id: string }>();
    const sales = (usePathname() || '').startsWith('/sales');
    const base = sales ? '/sales/site-walks' : '/admin/site-walks';
    return <Suspense><SiteWalkPage walkId={id} basePath={base} backHref={sales ? '/sales/quotes' : '/admin/quotes'} /></Suspense>;
}
