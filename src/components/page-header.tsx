import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The top of every page: small eyebrow, title, one-line description and an
 * actions slot (buttons, search, filters). Optional back link for detail
 * pages. Uses the shared .page-* classes in globals.css.
 */
export function PageHeader({ eyebrow, icon: Icon, title, subtitle, actions, back, className }: {
    eyebrow?: string;
    icon?: LucideIcon;
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    back?: { href: string; label: string };
    className?: string;
}) {
    return (
        <header className={cn('page-header', className)}>
            <div className="min-w-0 text-left">
                {back && (
                    <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text-primary">
                        <ChevronLeft size={14} /> {back.label}
                    </Link>
                )}
                {eyebrow && (
                    <p className="page-eyebrow flex items-center gap-1.5">
                        {Icon && <Icon size={12} />}
                        {eyebrow}
                    </p>
                )}
                <h1 className="page-title">{title}</h1>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="page-header-right">{actions}</div>}
        </header>
    );
}
