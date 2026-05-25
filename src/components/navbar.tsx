'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Briefcase,
  LayoutDashboard,
  Wrench,
  ClipboardList,
  Users,
  Banknote,
  MapPin,
  FileText,
  Activity
} from 'lucide-react';
import { UserNav } from '@/components/user-nav';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useState, useEffect } from 'react';
import type { Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { hasPermission, type Permission } from '@/lib/permissions';
import { TERMINOLOGY } from '@/lib/constants';

type NavItem = {
  href: string;
  label: string;
  icon: any;
  permission: Permission;
};

const adminNavItems: NavItem[] = [
  { href: '/admin/dispatch', label: 'Dispatch', icon: Wrench, permission: 'manage_assignments' },
  { href: '/admin/projects', label: 'Projects', icon: Briefcase, permission: 'view_projects' },
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { href: '/admin/reports', label: 'Activity', icon: Activity, permission: 'view_reports' },
  { href: '/admin/directory', label: 'Directory', icon: Users, permission: 'view_directory' },
  { href: '/admin/financials', label: 'Financials', icon: Banknote, permission: 'view_financials' },
];

const clientNavItems: NavItem[] = [
  { href: '/client/tickets', label: 'Tickets', icon: ClipboardList, permission: 'client_portal' },
  { href: '/client/projects', label: 'Projects', icon: Briefcase, permission: 'client_portal' },
  { href: '/client/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'client_portal' },
  { href: '/client/sites', label: 'Sites', icon: MapPin, permission: 'client_portal' },
  { href: '/client/financials', label: 'Financials', icon: FileText, permission: 'client_portal' },
];

export function Navbar() {
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

  if (!mounted) return null;

  const isClientPortal = pathname.startsWith('/client');
  const navItems = isClientPortal ? clientNavItems : adminNavItems;
  const portalLabel = isClientPortal ? TERMINOLOGY.CLIENT : TERMINOLOGY.PORTAL.ADMIN;
  const dashboardHref = isClientPortal ? '/client/dashboard' : '/admin/dashboard';
  
  const visibleItems = navItems.filter(item => hasPermission(currentUser, item.permission));

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
    <nav className="flex h-[52px] items-center border-b border-border-default bg-[#0f0f0f] px-6 w-full">
      <div className="flex w-1/4 items-center">
        <Link href={dashboardHref} className="flex items-center gap-2 group">
          {logo && (
            <Image 
              src={logo.imageUrl} 
              alt="Aaromach Logo" 
              width={100} 
              height={50} 
              className="object-contain transition-opacity group-hover:opacity-80"
              data-ai-hint={logo.imageHint}
              priority
              style={{ height: '40px', width: 'auto' }}
            />
          )}
          <div className="flex flex-col">
            <span className="font-mono text-base font-bold uppercase tracking-tight text-white leading-none">Aaromach</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-red">
                {isClientPortal ? 'Client Portal' : 'Command Center'}
            </span>
          </div>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1">
        {leftItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap',
              pathname === item.href ? 'bg-brand-red text-white' : 'text-[#888888] hover:bg-bg-tertiary hover:text-text-primary'
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
              'nav-item flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all border border-transparent',
              pathname === centerItem.href ? 'bg-brand-red text-white shadow-[0_0_15px_rgba(204,34,0,0.3)]' : 'text-white bg-bg-tertiary hover:bg-bg-elevated'
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
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap',
              pathname === item.href ? 'bg-brand-red text-white' : 'text-[#888888] hover:bg-bg-tertiary hover:text-text-primary'
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
