'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  ScrollText,
  User,
  Power,
  Coins,
} from 'lucide-react';
import { UserNav } from '@/components/user-nav';
import { Button } from './ui/button';

const navItems = [
  { href: '/tech/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tech/assignments', label: 'Assignments', icon: Calendar },
  { href: '/tech/projects', label: 'Projects', icon: Briefcase },
  { href: '/tech/logs', label: 'Logs', icon: ScrollText },
  { href: '/tech/earnings', label: 'Earnings', icon: Coins },
  { href: '/tech/profile', label: 'Profile', icon: User },
];

export function TechNavbar() {
  const pathname = usePathname();
  
  const isActive = (href: string) => {
    if (href === '/tech/dashboard') return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center gap-4 border-b border-border-default bg-[#0f0f0f] px-6">
      <Link href="/tech/dashboard" className="mr-4 flex items-center gap-2">
        <Icons.logo className="h-6 w-6 text-brand-red" />
        <span className="font-mono text-lg font-bold uppercase text-text-primary">Aaromach</span>
         <span className="text-sm font-semibold text-text-muted">/ Tech</span>
      </Link>

      <div className="flex items-center gap-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[#888888] transition-all',
              isActive(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <item.icon className="nav-icon h-3.5 w-3.5 opacity-70" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <UserNav />
         <Link href="/login">
            <Button variant="outline" size="sm" className="!text-xs !normal-case">
                <Power size={14} className="mr-2"/>
                Sign Out
            </Button>
        </Link>
      </div>
    </nav>
  );
}
