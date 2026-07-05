import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, FileText, MoreHorizontal, Phone, Mail } from 'lucide-react';
import { KIND_CFG, statusCls, priorityCls, priorityLabel, fmtDate, type NormalizedItem } from '../lib/helpers';
import { Pill } from './pill';

export function UnifiedRequestCard({
  item, onOpen, onApprove, onReject,
}: {
  item: NormalizedItem;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const kindCfg = KIND_CFG[item.kind];
  const pLabel = priorityLabel(item.priority);
  const statusDisplay = (item.status || '').replace(/_/g, ' ');

  const primaryActionLabel = item.kind === 'client' ? 'Approve Client'
    : item.kind === 'access' ? 'Approve User'
    : item.kind === 'subscription' ? 'Create Quote'
    : 'Approve';

  return (
    <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3 hover:border-border-main transition-colors flex flex-col">
      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill cls={kindCfg.cls} label={kindCfg.label} />
        <Pill cls={statusCls(item.status)} label={statusDisplay} />
        {item.priority && item.priority !== 'medium' && item.priority !== 'normal' && (
          <Pill cls={priorityCls(item.priority)} label={pLabel} />
        )}
      </div>

      {/* Title + company + contact */}
      <div className="space-y-0.5">
        <p className="text-[13px] font-bold text-text-primary leading-snug">{item.title}</p>
        {item.company && <p className="text-[10px] text-text-secondary">{item.company}</p>}
        {item.contactName && item.contactName !== item.title && (
          <p className="text-[10px] text-text-muted">{item.contactName}</p>
        )}
      </div>

      {/* Phone + email */}
      {(item.phone || item.email) && (
        <div className="flex items-center gap-3 flex-wrap">
          {item.phone && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Phone size={8} className="shrink-0" />{item.phone}
            </span>
          )}
          {item.email && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted truncate">
              <Mail size={8} className="shrink-0" />{item.email}
            </span>
          )}
        </div>
      )}

      {/* Source + date */}
      <p className="text-[9px] text-text-muted">
        Source: {item.source} · {fmtDate(item.date, true)}
      </p>

      {/* Description */}
      {item.description && (
        <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{item.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border-sub mt-auto flex-wrap">
        <Button size="sm" variant="outline"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest"
          onClick={onOpen}>
          <FileText size={9} className="mr-1" />Open
        </Button>
        <Button size="sm"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
          onClick={item.kind === 'access' ? onOpen : onApprove}>
          <CheckCircle2 size={9} className="mr-1" />{primaryActionLabel}
        </Button>
        <Button size="sm" variant="outline"
          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
          onClick={onReject}>
          <XCircle size={9} className="mr-1" />Reject
        </Button>
        <button type="button" className="ml-auto h-7 w-7 flex items-center justify-center rounded-md border border-border-sub hover:bg-bg-tertiary transition-colors shrink-0">
          <MoreHorizontal size={12} className="text-text-muted" />
        </button>
      </div>
    </div>
  );
}
