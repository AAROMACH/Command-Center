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
  Activity,
  Calendar,
  ScrollText,
  Coins,
  FolderKanban,
  Menu,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { UserNav } from '@/components/user-nav';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useState, useEffect, useMemo } from 'react';
import type { Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { hasPermission, type Permission } from '@/lib/permissions';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

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

const techNavItems: NavItem[] = [
  { href: '/tech/assignments', label: 'Assignments', icon: Calendar, permission: 'view_assigned_work_only' },
  { href: '/tech/projects', label: 'Projects', icon: FolderKanban, permission: 'view_projects' },
  { href: '/tech/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { href: '/tech/logs', label: 'Logs', icon: ScrollText, permission: 'field_logs' },
  { href: '/tech/earnings', label: 'Earnings', icon: Coins, permission: 'field_logs' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
          if (snap.exists()) {
            setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
          } else {
            const storedId = sessionStorage.getItem('currentUserId');
            const registryUser = technicians.find(t => t.id === fbUser.uid || t.id === storedId);
            setCurrentUser(registryUser);
          }
        });
        return () => unsubUser();
      } else {
        const storedId = sessionStorage.getItem('currentUserId');
        if (storedId) {
            const registryUser = technicians.find(t => t.id === storedId);
            setCurrentUser(registryUser);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  const { leftItems, dashboardItem, rightItems, allNavItems } = useMemo(() => {
    if (!mounted) return { leftItems: [], dashboardItem: null, rightItems: [], allNavItems: [] };

    const isTechPortal = pathname.startsWith('/tech');
    const isClientPortal = pathname.startsWith('/client');
    const rawItems = isTechPortal ? techNavItems : isClientPortal ? clientNavItems : adminNavItems;
    const dashboardHref = isTechPortal ? '/tech/dashboard' : isClientPortal ? '/client/dashboard' : '/admin/dashboard';

    const visibleItems = rawItems.filter(item => hasPermission(currentUser, item.permission));
    const dIndex = visibleItems.findIndex(i => i.href === dashboardHref);

    if (dIndex === -1) return { leftItems: visibleItems, dashboardItem: null, rightItems: [], allNavItems: visibleItems };

    return {
      leftItems: visibleItems.slice(0, dIndex),
      dashboardItem: visibleItems[dIndex],
      rightItems: visibleItems.slice(dIndex + 1),
      allNavItems: visibleItems,
    };
  }, [mounted, pathname, currentUser]);

  if (!mounted) return <nav className="flex h-[52px] items-center border-b border-border-default bg-[#0f0f0f] px-6 w-full opacity-0" />;

  const isClientPortal = pathname.startsWith('/client');
  const isTechPortal = pathname.startsWith('/tech');
  const isAdminPortal = !isTechPortal && !isClientPortal;

  const isActive = (href: string) => {
    if (href.endsWith('/dashboard')) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav className="flex h-[52px] items-center border-b border-border-default bg-[#0f0f0f] px-6 w-full">
        <div className="flex w-1/4 items-center">
          <Link href={dashboardItem?.href || '/'} className="flex items-center gap-2 group">
            {logo && (
              <Image
                src={logo.imageUrl}
                alt="Aaromach Logo"
                width={100}
                height={50}
                className="object-contain transition-opacity group-hover:opacity-80"
                data-ai-hint={logo.imageHint}
                priority
                style={{ height: '36px', width: 'auto' }}
              />
            )}
            <div className="flex flex-col text-left">
              <span className="font-mono text-base font-bold uppercase tracking-tight text-white leading-none">Aaromach</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-red">
                  {isClientPortal ? 'Client Portal' : isTechPortal ? 'Field Terminal' : 'Command Center'}
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop nav items — hidden on mobile */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-1">
          {leftItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap',
                isActive(item.href) ? 'bg-brand-red text-white' : 'text-[#888888] hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          ))}

          {dashboardItem && (
            <Link
              href={dashboardItem.href}
              className={cn(
                'nav-item flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all border border-transparent mx-2',
                isActive(dashboardItem.href) ? 'bg-brand-red text-white shadow-[0_0_15px_rgba(204,34,0,0.3)]' : 'text-white bg-bg-tertiary hover:bg-bg-elevated'
              )}
            >
              <dashboardItem.icon className="h-4 w-4" />
              <span>{dashboardItem.label}</span>
            </Link>
          )}

          {rightItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap',
                isActive(item.href) ? 'bg-brand-red text-white' : 'text-[#888888] hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex w-1/4 items-center justify-end gap-2.5">
          {/* Hamburger — admin portal, mobile only */}
          {isAdminPortal && (
            <button
              className="md:hidden p-2 rounded-md hover:bg-bg-tertiary transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5 text-text-primary" />
            </button>
          )}
          <UserNav />
        </div>
      </nav>

      {/* Tech portal — mobile bottom navigation bar */}
      {isTechPortal && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-[#0f0f0f] border-t border-border-default">
          <div className="flex items-center">
            {allNavItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-3 flex-1 transition-colors',
                  isActive(item.href) ? 'text-brand-red' : 'text-[#666] hover:text-text-primary'
                )}
              >
                <item.icon className="w-[18px] h-[18px]" />
                <span className="text-[9px] font-semibold uppercase tracking-wide leading-none mt-0.5">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Admin portal — mobile slide-out drawer */}
      {isAdminPortal && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-72 bg-bg-secondary p-0">
            <div className="flex flex-col gap-1 p-4 pt-8">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted px-3 mb-3">
                Command Center
              </p>
              {allNavItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-colors',
                    isActive(item.href)
                      ? 'bg-brand-red/10 text-brand-red'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
