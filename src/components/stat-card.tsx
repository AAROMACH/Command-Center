import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_TEXT, type Tone } from '@/lib/status-styles';

/** KPI tile (dashboards, Insights, Activity, payroll): label, big number, one-line context. */
export function StatCard({ label, value, sub, tone, icon: Icon, onClick, className }: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    tone?: Tone;
    icon?: LucideIcon;
    onClick?: () => void;
    className?: string;
}) {
    const Comp = onClick ? 'button' : 'div';
    return (
        <Comp onClick={onClick} className={cn('min-w-0 rounded-xl border border-border-main bg-bg-secondary p-4 text-left shadow-sm',
            onClick && 'transition-colors hover:border-text-muted', className)}>
            <p className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {Icon && <Icon size={12} />}{label}
            </p>
            <p className={cn('mt-1 truncate text-2xl font-bold tabular-nums leading-tight', tone ? TONE_TEXT[tone] : 'text-text-primary')}>{value}</p>
            {sub && <p className="mt-0.5 truncate text-[12px] text-text-muted">{sub}</p>}
        </Comp>
    );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6', className)}>{children}</div>;
}
