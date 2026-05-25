'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  ScrollText,
  Coins,
} from 'lucide-react';
import { UserNav } from '@/components/user-nav';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useState, useEffect } from 'react';
import type { Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { hasPermission, type Permission } from '@/lib/permissions';

type NavItem = {
  href: string;
  label: string;
  icon: any;
  permission: Permission;
};

const navItems: NavItem[] = [
  { href: '/tech/assignments', label: 'Assignments', icon: Calendar, permission: 'view_assigned_work_only' },
  { href: '/tech/projects', label: 'Projects', icon: Briefcase, permission: 'view_assigned_projects_only' },
  { href: '/tech/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { href: '/tech/logs', label: 'Logs', icon: ScrollText, permission: 'field_logs' },
  { href: '/tech/earnings', label: 'Billing', icon: Coins, permission: 'field_logs' },
];

export function TechNavbar() {
  const pathname = usePathname();
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  const [currentUser, setCurrentUser] = useState<Technician | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId));
    }
  }, []);
  
  const isActive = (href: string) => {
    if (href === '/tech/dashboard') return pathname === href;
    return pathname.startsWith(href);
  };

  const visibleItems = mounted 
    ? navItems.filter(item => hasPermission(currentUser, item.permission))
    : [];

  const dashboardIndex = visibleItems.findIndex(i => i.label === 'Dashboard');
  let leftItems: NavItem[] = [];
  let centerItem: NavItem | null = null;
  let rightItems: NavItem[] = [];

  if (dashboardIndex !== -1) {
    leftItems = visibleItems.slice(0, dashboardIndex);
    centerItem = visibleItems[dashboardIndex];
    rightItems = visibleItems.slice(dashboardIndex + 1);
  } else {
    leftItems = visibleItems;
  }

  return (
    <nav className="flex h-[52px] items-center border-b border-border-main bg-[#0f0f0f] px-6 w-full">
      <div className="flex w-1/4 items-center">
        <Link href="/tech/dashboard" className="flex items-center gap-2">
           {logo && (
            <Image 
              src={logo.imageUrl} 
              alt="Aaromach Logo" 
              width={100} 
              height={50} 
              className="object-contain"
              data-ai-hint={logo.imageHint}
              priority
              style={{ height: '40px', width: "auto" }}
            />
          )}
          <div className="flex flex-col">
            <span className="font-mono text-lg font-bold uppercase leading-none text-text-primary">Aaromach</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-red">Technician Portal</span>
          </div>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1">
         {leftItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888888] transition-all',
              isActive(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </Link>
        ))}

        {centerItem && (
          <Link
            href={centerItem.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#888888] transition-all border border-transparent',
              isActive(centerItem.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <centerItem.icon className="h-4 w-4" />
            <span>{centerItem.label}</span>
          </Link>
        )}

        {rightItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888888] transition-all',
              isActive(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="flex w-1/4 items-center justify-end gap-2.5">
        <UserNav />
      </div>
    </nav>
  );
}
