'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/search-field';
import { SiteWalkList, useSiteWalks } from '@/components/site-walk/site-walk-list';

/** Tech Portal: walk a site (or scope it remotely) and send it to the office for a quote. */
export default function TechSiteWalksPage() {
    const router = useRouter();
    const { user, hasPermission } = useAuth();
    const { walks, loading } = useSiteWalks({ techId: user?.id || null });
    const [search, setSearch] = useState('');
    return (
        <div className="space-y-5">
            <PageHeader eyebrow="Sales" icon={ClipboardCheck} title="Site walks"
                subtitle="Walk the site with your tablet — the job, drops, devices, tests and photos. It saves as you go; the office prices it and sends the quote."
                actions={hasPermission('tech.site_walks.create') && (
                    <Button asChild className="h-12 px-5 bg-brand-red hover:bg-brand-red/90 text-white text-[15px]">
                        <Link href="/tech/site-walks/new"><Plus size={16} className="mr-1.5" /> New site walk</Link>
                    </Button>
                )} />
            <SearchField value={search} onChange={setSearch} placeholder="Search customer, site, walk #…" className="max-w-md" />
            <SiteWalkList walks={walks} loading={loading} onOpen={w => router.push(`/tech/site-walks/${w.id}`)} search={search} />
        </div>
    );
}
