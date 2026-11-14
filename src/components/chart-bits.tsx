'use client';

// Small chart helpers with no chart library, shared by Insights and the
// tech Activity page (kept out of customer-dashboard so pages that only need
// these don't pull in recharts).
import { cn } from '@/lib/utils';

export function Tip({ title, lines }: { title: string; lines: string[] }) {
    return (
        <div className="rounded-md border border-border-main bg-bg-elevated px-3 py-2 shadow-xl text-[10px]">
            <p className="font-bold text-text-primary mb-0.5">{title}</p>
            {lines.map(l => <p key={l} className="text-text-muted">{l}</p>)}
        </div>
    );
}

/** Clickable horizontal bars (customer / type rankings). */
export function HBars({ items, fmt, selected, onPick, color, empty }: {
    items: { key: string; value: number; extra?: string; tip?: string }[];
    fmt: (v: number) => string;
    selected: string | null;
    onPick: (key: string) => void;
    color: string;
    empty: string;
}) {
    if (!items.length) return <p className="py-16 text-center text-[11px] text-text-muted">{empty}</p>;
    const max = Math.max(1e-9, ...items.map(i => i.value));
    return (
        <div className="space-y-1">
            {items.map(i => (
                <button key={i.key} onClick={() => onPick(i.key)} title={i.tip}
                    className={cn('w-full grid grid-cols-[minmax(0,38%)_1fr] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg-tertiary/40',
                        selected && i.key !== selected && 'opacity-45', i.key === selected && 'bg-bg-tertiary/50')}>
                    <span className="truncate text-[11px] font-bold text-text-primary">{i.key}</span>
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="h-4 rounded-sm shrink-0" style={{ width: `${Math.max(1, (70 * i.value) / max)}%`, background: color }} />
                        <span className="min-w-0 text-[10px] tabular-nums text-text-secondary whitespace-nowrap truncate">
                            {fmt(i.value)}{i.extra ? <span className="text-text-muted"> · {i.extra}</span> : null}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}
