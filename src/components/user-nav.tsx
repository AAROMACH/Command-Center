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
          <DropdownMenuItem onSelect={() => router.push(isTech ? '/tech/profile' : '/admin/profile')}>
            Profile
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          {!isTech && (
            <>
              <DropdownMenuItem onSelect={() => router.push('/admin/billing')}>
                Billing
                <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/admin/settings')}>
                Settings
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/login')}>
          Log out
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
