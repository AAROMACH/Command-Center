import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * "Nothing here" — one look everywhere. Use `filtered` when filters hide
 * everything ("No jobs match these filters" + Reset) so it reads differently
 * from a truly empty list ("No jobs yet").
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: {
    icon?: LucideIcon;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
    compact?: boolean;
}) {
    return (
        <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border-main text-center',
            compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
            <Icon size={compact ? 22 : 28} className="mb-3 text-text-muted/60" />
            <p className="text-[14px] font-semibold text-text-primary">{title}</p>
            {description && <p className="mt-1 max-w-sm text-[12px] text-text-muted">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

/** Loading placeholder: skeleton rows plus plain text ("Loading jobs…"). */
export function LoadingState({ label = 'Loading…', rows = 4, className }: { label?: string; rows?: number; className?: string }) {
    return (
        <div className={cn('space-y-2', className)} role="status" aria-live="polite">
            {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            <p className="pt-1 text-center text-[12px] text-text-muted">{label}</p>
        </div>
    );
}

/** Full-page loading (route-level), centered. */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
    return (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-red border-t-transparent" />
            <p className="text-[12px] text-text-muted">{label}</p>
        </div>
    );
}
