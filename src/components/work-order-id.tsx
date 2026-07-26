import { ExternalLink } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';
import { fieldNationUrl, displayWorkOrderNumber, isImported } from '@/lib/work-order-identity';

/**
 * Canonical rendering of a job's identifier — the single source of truth so the
 * two identifier colors never get confused:
 *   - Imported (Field Nation) jobs show the EXTERNAL work-order number in cyan
 *     with a prominent ↗ chip that opens the Field Nation work order.
 *   - Manual / client jobs show the INTERNAL document id in red.
 */
export function WorkOrderId({ wo, className = '' }: { wo: WorkOrder; className?: string }) {
  const imported = isImported(wo);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`cell-id font-mono font-bold ${imported ? 'text-brand-cyan' : 'text-brand-red'} ${className}`}>
        {displayWorkOrderNumber(wo)}
      </span>
      {imported && (
        <a
          href={fieldNationUrl(wo)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open in Field Nation"
          className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] border border-brand-cyan text-brand-cyan transition-colors hover:bg-brand-cyan hover:text-white"
        >
          <ExternalLink size={11} />
        </a>
      )}
    </span>
  );
}
