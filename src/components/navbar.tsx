'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Briefcase, LayoutDashboard, Wrench } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/assignments', label: 'Assignments', icon: Wrench },
];

export function Navbar() {
  const pathname = usePathname();
  const userAvatar = PlaceHolderImages.find(image => image.id === 'user-avatar-1');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center gap-4 border-b border-border-default bg-[#0f0f0f] px-6">
      <Link href="/admin/dashboard" className="mr-4 flex items-center gap-2">
        <Icons.logo className="h-6 w-6 text-brand-red" />
        <span className="font-mono text-lg font-bold uppercase text-text-primary">Aaromach</span>
      </Link>

      {navItems.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'nav-item flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[#888888] transition-all',
            pathname.startsWith(item.href) ? 'active bg-brand-red text-white' : 'hover:bg-bg-tertiary hover:text-text-primary'
          )}
        >
          <item.icon className="nav-icon h-3.5 w-3.5 opacity-70" />
          <span>{item.label}</span>
        </Link>
      ))}

      <div className="ml-auto flex items-center gap-2.5">
        <div className="text-right">
          <div className="text-xs font-semibold text-text-primary">Admin User</div>
          <div className="text-[10px] uppercase tracking-[0.06em] text-text-muted">Operator</div>
        </div>
        {userAvatar && (
            <Avatar className="h-8 w-8 rounded-full border border-border-default">
                <AvatarImage asChild src={userAvatar.imageUrl} alt="User Avatar">
                    <Image src={userAvatar.imageUrl} alt="User Avatar" width={32} height={32} data-ai-hint={userAvatar.imageHint} />
                </AvatarImage>
                <AvatarFallback>AD</AvatarFallback>
            </Avatar>
        )}
      </div>
    </nav>
  );
}
