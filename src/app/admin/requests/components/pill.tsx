import { cn } from '@/lib/utils';

export function Pill({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={cn('text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

export function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[8px] font-black min-w-[16px] h-4 px-1 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}
