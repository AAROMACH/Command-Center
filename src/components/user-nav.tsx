'use client';

import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  User,
  Settings,
  CreditCard,
  LogOut,
  ChevronDown,
  MonitorUp,
  Check
} from "lucide-react"
import type { Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { isAdmin, isTech, isClient, getAvailablePortals } from '@/lib/permissions';

export function UserNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<Technician | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      const user = technicians.find(t => t.id === userId);
      setCurrentUser(user);
    }
  }, []);

  if (!mounted) return <div className="h-8 w-8 rounded-full bg-bg-secondary animate-pulse" />;

  const userAvatarUrl = currentUser?.avatarUrl;
  const userFallback = currentUser ? currentUser.name.split(' ').map(n => n[0]).join('') : 'U';
  
  const displayIsAdmin = isAdmin(currentUser);
  const displayIsTech = isTech(currentUser);
  const displayIsClient = isClient(currentUser);
  
  const availablePortals = getAvailablePortals(currentUser);
  const activePortalId = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/tech') ? 'tech' : pathname.startsWith('/client') ? 'client' : '';

  // PORTAL SENSITIVE ROUTING
  const profilePath = pathname.startsWith('/tech') ? '/tech/profile' : 
                     pathname.startsWith('/client') ? '/client/profile' : '/admin/profile';
  
  const settingsPath = pathname.startsWith('/tech') ? '/tech/settings' : 
                      pathname.startsWith('/client') ? '/client/settings' : '/admin/settings';

  const billingPath = pathname.startsWith('/tech') ? '/tech/earnings' :
                     pathname.startsWith('/client') ? '/client/billing' : '/admin/billing';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative flex h-auto items-center gap-3 px-2 py-1 hover:bg-bg-tertiary rounded-md group">
          <div className="flex flex-col items-end text-right hidden sm:flex">
             <span className="text-[11px] font-bold uppercase tracking-wider text-white leading-tight">
                {currentUser?.name || 'Authorized User'}
             </span>
             <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none mt-0.5">
                {activePortalId === 'admin' ? 'Administrator' : activePortalId === 'tech' ? 'Field Technician' : 'Client Lead'}
             </span>
          </div>
          <ChevronDown size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
          <Avatar className="h-8 w-8 border border-border-main">
            {userAvatarUrl && <AvatarImage asChild src={userAvatarUrl} alt={currentUser?.name || 'User'}>
                <Image src={userAvatarUrl} alt={currentUser?.name || 'User Avatar'} width={32} height={32} />
            </AvatarImage>}
            <AvatarFallback>{userFallback}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{currentUser?.name || 'User'}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {currentUser?.email || 'No email'}
            </p>
          </div>
        </DropdownMenuLabel>
        
        {availablePortals.length > 1 && (
            <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase font-bold tracking-[0.2em] text-text-muted flex items-center gap-2">
                    <MonitorUp size={12}/> Switch Portal
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                    {availablePortals.map(portal => (
                        <DropdownMenuItem key={portal.id} onSelect={() => router.push(portal.path)} className="flex items-center justify-between">
                            <span>{portal.label}</span>
                            {activePortalId === portal.id && <Check size={14} className="text-text-green" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
            </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push(profilePath)}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(settingsPath)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(billingPath)}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing & Plan</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('currentUserId');
            }
            router.push('/login');
        }}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
