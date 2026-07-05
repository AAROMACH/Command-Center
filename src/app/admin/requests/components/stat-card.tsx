import { cn } from '@/lib/utils';

export function StatCard({ label, count, icon: Icon, description, variant = 'default' }: {
  label: string; count: number; icon: React.ElementType;
  description: string; variant?: 'default' | 'urgent' | 'approved' | 'muted';
}) {
  const iconCls = variant === 'urgent' ? 'text-brand-red' : variant === 'approved' ? 'text-text-green' : 'text-text-muted';
  const countCls = variant === 'urgent' ? 'text-brand-red' : variant === 'approved' ? 'text-text-green' : 'text-text-primary';
  return (
    <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-1.5">
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">{label}</p>
        <Icon size={14} className={iconCls} />
      </div>
      <p className={cn('text-[28px] font-black leading-none', countCls)}>{count}</p>
      <p className="text-[9px] text-text-muted">{description}</p>
    </div>
  );
}
