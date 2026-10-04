import { cn } from '@/lib/utils';

/**
 * Bouncing "!" shown on a tab or nav item when new items have entered that
 * list since the admin last looked (see hooks/use-new-arrivals.ts).
 */
export function NewArrivalPing({ count, className }: { count: number; className?: string }) {
    if (count <= 0) return null;
    const label = `${count} new item${count !== 1 ? 's' : ''}`;
    return (
        <span
            role="status"
            aria-label={label}
            title={label}
            className={cn(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-red text-[10px] font-black leading-none text-white animate-bounce motion-reduce:animate-none',
                className,
            )}
        >
            !
        </span>
    );
}
