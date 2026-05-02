
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  User,
  Settings,
  CreditCard,
  LogOut,
} from "lucide-react"
import type { Technician } from '@/lib/types';
import { technicians } from '@/lib/data';

export function UserNav() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Technician | undefined>(undefined);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      const user = technicians.find(t => t.id === userId);
      setCurrentUser(user);
    }
  }, []);

  const userAvatarUrl = currentUser?.avatarUrl;
  const userFallback = currentUser ? currentUser.name.split(' ').map(n => n[0]).join('') : 'U';
  const isTech = currentUser?.role.toLowerCase().includes('tech');

  const profilePath = isTech ? '/tech/profile' : '/admin/profile';
  const settingsPath = isTech ? '/tech/settings' : '/admin/settings';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {userAvatarUrl && <AvatarImage asChild src={userAvatarUrl} alt={currentUser?.name || 'User'}>
                <Image src={userAvatarUrl} alt={currentUser?.name || 'User Avatar'} width={36} height={36} />
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
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push(profilePath)}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(settingsPath)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          {!isTech && (
            <DropdownMenuItem onSelect={() => router.push('/admin/billing')}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Billing</span>
              <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/login')}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
