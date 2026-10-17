import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusLabel, statusTone, TONE_BADGE, type StatusKind } from '@/lib/status-styles';

/** A status chip colored by the shared status map (lib/status-styles.ts). */
export function StatusBadge({ kind, value, label, className }: { kind: StatusKind; value: string | null | undefined; label?: string; className?: string }) {
    return (
        <Badge variant={TONE_BADGE[statusTone(kind, value)]} className={cn('text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', className)}>
            {label ?? statusLabel(value)}
        </Badge>
    );
}
