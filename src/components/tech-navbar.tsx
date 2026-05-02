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

const navItems = [
  { href: '/tech/assignments', label: 'Assignments', icon: Calendar },
  { href: '/tech/projects', label: 'Projects', icon: Briefcase },
  { href: '/tech/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tech/logs', label: 'Logs', icon: ScrollText },
  { href: '/tech/earnings', label: 'Earnings', icon: Coins },
];

export function TechNavbar() {
  const pathname = usePathname();
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  
  const isActive = (href: string) => {
    if (href === '/tech/dashboard') return pathname === href;
    return pathname.startsWith(href);
  };

  const leftItems = navItems.slice(0, 2);
  const centerItem = navItems[2];
  const rightItems = navItems.slice(3);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center border-b border-border-main bg-[#0f0f0f] px-6">
      <div className="flex w-1/4 items-center">
        <Link href="/tech/dashboard" className="flex items-center gap-2">
           {logo && (
            <Image 
              src={logo.imageUrl} 
              alt="Aaromach Logo" 
              width={40} 
              height={40} 
              className="object-contain"
              data-ai-hint={logo.imageHint}
              priority
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

      <div className="flex w-1/4 items-center justify-end">
        <UserNav />
      </div>
    </nav>
  );
}
