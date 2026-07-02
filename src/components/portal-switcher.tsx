'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Layers, ChevronDown, ShieldCheck, Wrench, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PORTAL_ICONS = {
  admin: ShieldCheck,
  tech: Wrench,
  client: Building2,
};

export function PortalSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { portals } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Only render when user has 2+ portals
  if (portals.length < 2) return null;

  const activePortal = portals.find(p => pathname.startsWith(`/${p.id}`)) ?? portals[0];
  const ActiveIcon = PORTAL_ICONS[activePortal.id];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-muted hover:text-text-primary hover:bg-bg-tertiary border border-border-sub',
            collapsed ? 'w-8 px-0 justify-center' : 'w-full justify-between px-2'
          )}
        >
          <span className="flex items-center gap-1.5">
            <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span className="truncate">{activePortal.label}</span>}
          </span>
          {!collapsed && <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 bg-bg-secondary border-border-sub">
        {portals.map(portal => {
          const Icon = PORTAL_ICONS[portal.id];
          const isActive = pathname.startsWith(`/${portal.id}`);
          return (
            <DropdownMenuItem
              key={portal.id}
              onClick={() => router.push(portal.path)}
              className={cn(
                'text-[10px] font-bold uppercase tracking-widest gap-2 cursor-pointer',
                isActive ? 'text-brand-red' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {portal.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
