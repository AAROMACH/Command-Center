'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SiteWalkPage } from '@/components/site-walk/site-walk-page';

/** Tech Portal: one site walk (or /new to start one). */
export default function TechSiteWalk() {
    const { id } = useParams<{ id: string }>();
    return <Suspense><SiteWalkPage walkId={id} basePath="/tech/site-walks" backHref="/tech/site-walks" /></Suspense>;
}
