'use client';

import { useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/search-field';
import { SiteWalkWizard } from '@/components/site-walk/site-walk-wizard';
import { SiteWalkList, useSiteWalks } from '@/components/site-walk/site-walk-list';
import { newSiteWalk } from '@/lib/site-walk-actions';
import type { SiteWalk } from '@/lib/estimating';

/** Tech Portal: walk a site (or scope it remotely) and send it to the office for a quote. */
export default function TechSiteWalksPage() {
    const { user } = useAuth();
    const { walks, loading } = useSiteWalks({ techId: user?.id || null });
    const [open, setOpen] = useState<SiteWalk | null>(null);
    const [search, setSearch] = useState('');
    const start = () => user && setOpen(newSiteWalk({ id: user.id, name: user.name || 'Tech' }, { assignedTechId: user.id, assignedTechName: user.name || null }));

    return (
        <div className="space-y-5">
            <PageHeader eyebrow="Sales" icon={ClipboardCheck} title="Site walks"
                subtitle="Walk the site with your tablet — drops, conditions, equipment, photos. The office prices it and sends the quote."
                actions={<Button className="h-11 px-5 bg-brand-red hover:bg-brand-red/90 text-white text-[15px]" onClick={start} disabled={!user}><Plus size={16} className="mr-1.5" /> New site walk</Button>} />
            <SearchField value={search} onChange={setSearch} placeholder="Search customer, site, walk #…" className="max-w-md" />
            <SiteWalkList walks={walks} loading={loading} onOpen={setOpen} search={search} />
            <SiteWalkWizard open={!!open} initial={open} onClose={() => setOpen(null)} />
        </div>
    );
}
