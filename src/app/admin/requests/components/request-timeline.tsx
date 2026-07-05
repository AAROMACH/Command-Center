import { cn } from '@/lib/utils';
import { fmtDate, type NormalizedItem } from '../lib/helpers';

export function RequestTimeline({ item }: { item: NormalizedItem }) {
  const status = item.status;
  const isApproved = ['approved', 'converted_to_work_order', 'converted_to_project', 'converted_to_client'].includes(status);
  const isConverted = ['converted_to_work_order', 'converted_to_project', 'converted_to_client'].includes(status);
  const isArchived = ['archived', 'closed'].includes(status);

  const steps = [
    { label: 'Submitted', detail: fmtDate(item.date, true), done: true, active: false },
    { label: 'Received', detail: fmtDate(item.date, true), done: true, active: false },
    { label: 'Under Review', detail: status === 'reviewed' || status === 'contacted' ? 'Admin' : undefined, done: status === 'reviewed' || status === 'contacted', active: status === 'pending_review' || status === 'needs_more_info' },
    { label: 'Approved', detail: undefined, done: isApproved, active: false },
    { label: 'Converted to Job', detail: undefined, done: isConverted, active: false },
    { label: 'Archived', detail: undefined, done: isArchived, active: false },
  ];

  return (
    <div className="space-y-4">
      {steps.map(step => (
        <div key={step.label} className="flex items-start gap-2.5">
          <div className={cn(
            'mt-0.5 h-2.5 w-2.5 rounded-full border-2 shrink-0',
            step.done ? 'bg-brand-red border-brand-red' :
            step.active ? 'bg-transparent border-amber-400' :
            'bg-transparent border-border-sub'
          )} />
          <div>
            <p className={cn('text-[9px] font-bold uppercase tracking-widest', step.done ? 'text-text-primary' : step.active ? 'text-amber-400' : 'text-text-muted')}>
              {step.label}
            </p>
            {step.detail && <p className="text-[8px] text-text-muted mt-0.5">{step.detail}</p>}
            {!step.done && !step.detail && <p className="text-[8px] text-text-muted mt-0.5">—</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
