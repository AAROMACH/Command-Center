"use client";

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getAvailablePortals } from '@/lib/permissions';
import { Button } from '@/components/ui/button';

const NAMES: Record<string, string> = { admin: 'admin portal', tech: 'tech portal' };

/**
 * "Switch to tech portal" / "Switch to admin portal" for people who have
 * both. Shown on each portal's dashboard; hidden for everyone else.
 */
export function PortalSwitchButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const here = pathname.startsWith('/tech') ? 'tech' : pathname.startsWith('/admin') ? 'admin' : null;
  const other = getAvailablePortals(user).find(p => (p.id === 'admin' || p.id === 'tech') && p.id !== here);
  if (!here || !other) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => router.push(other.path)}>
      <ArrowLeftRight size={14} className="mr-1.5 text-text-muted" />
      Switch to {NAMES[other.id]}
    </Button>
  );
}
