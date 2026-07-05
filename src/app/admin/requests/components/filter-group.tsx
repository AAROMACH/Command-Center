import { cn } from '@/lib/utils';

export function FilterGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest mr-0.5">{label}:</span>
      {options.map(o => (
        <button key={o.value} type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
            value === o.value
              ? 'bg-bg-tertiary text-text-primary border-border-main'
              : 'text-text-muted border-border-sub hover:border-border-main hover:text-text-secondary'
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
