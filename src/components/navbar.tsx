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
} from 'lucide-react';
import { UserNav } from '@/components/user-nav';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const navItems = [
  { href: '/admin/requests', label: 'Requests', icon: ClipboardList },
  { href: '/admin/assignments', label: 'Assignments', icon: Wrench },
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/projects', label: 'Projects', icon: Briefcase },
  { href: '/admin/directory', label: 'Directory', icon: Users },
  { href: '/admin/financials', label: 'Financials', icon: Banknote },
];

export function Navbar() {
  const pathname = usePathname();
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');

  const leftItems = navItems.slice(0, 2);
  const centerItem = navItems[2];
  const rightItems = navItems.slice(3);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center border-b border-border-default bg-[#0f0f0f] px-6">
      <div className="flex w-1/4 items-center">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          {logo && (
            <Image 
              src={logo.imageUrl} 
              alt="Aaromach Logo" 
              width={120} 
              height={60} 
              className="object-contain"
              data-ai-hint={logo.imageHint}
              priority
              style={{ height: '60px', width: 'auto' }}
            />
          )}
          <span className="font-mono text-lg font-bold uppercase tracking-tight text-text-primary">Aaromach</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1">
        {leftItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888888] transition-all',
              pathname.startsWith(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </Link>
        ))}

        <Link
          href={centerItem.href}
          className={cn(
            'nav-item flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#888888] transition-all border border-transparent',
            pathname === centerItem.href ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
          )}
        >
          <centerItem.icon className="h-4 w-4" />
          <span>{centerItem.label}</span>
        </Link>

        {rightItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#888888] transition-all',
              pathname.startsWith(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
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