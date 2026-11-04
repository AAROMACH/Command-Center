'use client';

import { useMemo, useState } from 'react';
import { BadgePercent, Check, ChevronDown, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { describeDiscount, planDiscountFor } from '@/lib/price-lines';
import type { ServicePlan, Subscription } from '@/lib/billing';
import type { Technician } from '@/lib/types';

const clientName = (c: Technician) => c.clientCompany || c.name || c.email || c.id;

/**
 * Choose an app client: a button showing the choice, opening a searchable
 * list (company, contact, email) that shows each client's service plan
 * discount. Replaces a plain dropdown that listed every client with no search
 * and was hard to pick from inside the quote / invoice dialog.
 */
export function ClientPicker({ clients, value, onChange, subscriptions = [], plans = [], disabled, className }: {
    clients: Technician[];
    value: string;
    onChange: (clientId: string) => void;
    subscriptions?: Subscription[];
    plans?: ServicePlan[];
    disabled?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = clients.find(c => c.id === value);
    const shown = useMemo(() => {
        const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return clients.filter(c => words.every(w => [c.clientCompany, c.name, c.email, c.phone].some(v => (v || '').toLowerCase().includes(w))));
    }, [clients, search]);
    const pick = (id: string) => { onChange(id); setOpen(false); setSearch(''); };

    return (
        <>
            <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}
                className={cn('h-9 w-full justify-between text-[12px] font-normal bg-bg-secondary border-border-main', className)}>
                <span className={cn('truncate', !selected && 'text-text-muted')}>{selected ? clientName(selected) : 'Select client…'}</span>
                <ChevronDown size={14} className="shrink-0 opacity-60" />
            </Button>
            <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch(''); }}>
                <DialogContent className="bg-bg-elevated border-border-main sm:max-w-lg max-h-[85svh] flex flex-col gap-3">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-base">Choose a client</DialogTitle>
                        <DialogDescription className="text-[12px]">Clients on a service plan get its discount automatically.</DialogDescription>
                    </DialogHeader>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, contact or email" className="h-10 pl-8 text-[13px]" />
                    </div>
                    <div className="flex-1 min-h-[120px] overflow-y-auto space-y-1 -mx-1 px-1">
                        {shown.map(c => {
                            const d = planDiscountFor(c.id, subscriptions, plans);
                            return (
                                <button key={c.id} type="button" onClick={() => pick(c.id)}
                                    className={cn('w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                                        c.id === value ? 'border-brand-red bg-brand-red/5' : 'border-border-sub hover:bg-bg-tertiary')}>
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-text-primary break-words">{clientName(c)}</span>
                                        <span className="block text-[11px] text-text-muted break-words">{[c.clientCompany && c.name, c.email].filter(Boolean).join(' · ')}</span>
                                        {d && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text-green"><BadgePercent size={11} /> {d.planName}: {describeDiscount(d)}</span>}
                                    </span>
                                    {c.id === value && <Check size={15} className="text-brand-red shrink-0" />}
                                </button>
                            );
                        })}
                        {!shown.length && <p className="text-[12px] text-text-muted py-8 text-center">{clients.length ? 'No clients match.' : 'No clients yet.'}</p>}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
