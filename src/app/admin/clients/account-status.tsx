import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TONE_BADGE, statusLabel, type Tone } from '@/lib/status-styles';

/**
 * Client account status → shared status tone (lib/status-styles.ts), used by
 * the clients list, client detail, sites and directory pages so an account
 * status reads the same color everywhere.
 */
export const ACCOUNT_STATUS_TONE: Record<string, Tone> = {
    active: 'done',
    vip: 'done',
    lead: 'info',
    prospect: 'info',
    on_hold: 'progress',
    inactive: 'neutral',
    past_client: 'neutral',
    collections: 'problem',
    do_not_service: 'problem',
};

export const accountStatusTone = (status?: string | null): Tone => ACCOUNT_STATUS_TONE[status || 'active'] || 'neutral';

const LABELS: Record<string, string> = { vip: 'VIP', do_not_service: 'Do not service' };
export const accountStatusLabel = (status?: string | null) => LABELS[status || 'active'] || statusLabel(status || 'active');

export function AccountStatusBadge({ status, className }: { status?: string | null; className?: string }) {
    return (
        <Badge variant={TONE_BADGE[accountStatusTone(status)]} className={cn('h-5 shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide', className)}>
            {accountStatusLabel(status)}
        </Badge>
    );
}
