'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FieldIntelligenceRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/reports?tab=analytics');
    }, [router]);

    return (
        <div className="flex h-screen items-center justify-center bg-bg-primary">
            <div className="text-center space-y-4">
                <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Loading Field Intelligence...</p>
            </div>
        </div>
    );
}
