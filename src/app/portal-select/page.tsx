'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAvailablePortals, getPortalAccess } from '@/lib/permissions';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Wrench, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Technician } from '@/lib/types';

const PORTAL_META = {
  admin: {
    icon: ShieldCheck,
    label: 'Command Center',
    description: 'Admin operations, dispatch, payroll, and settings.',
    color: 'text-brand-red',
    border: 'border-brand-red/30 hover:border-brand-red',
    bg: 'bg-brand-red/5 hover:bg-brand-red/10',
  },
  tech: {
    icon: Wrench,
    label: 'Field Terminal',
    description: 'Assignments, logs, earnings, and schedule.',
    color: 'text-[#3b82f6]',
    border: 'border-[#3b82f6]/30 hover:border-[#3b82f6]',
    bg: 'bg-[#3b82f6]/5 hover:bg-[#3b82f6]/10',
  },
  client: {
    icon: Building2,
    label: 'Client Portal',
    description: 'Projects, support tickets, invoices, and sites.',
    color: 'text-[#10b981]',
    border: 'border-[#10b981]/30 hover:border-[#10b981]',
    bg: 'bg-[#10b981]/5 hover:bg-[#10b981]/10',
  },
};

export default function PortalSelectPage() {
  const router = useRouter();
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');
  const [userData, setUserData] = useState<Technician | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        router.push('/login');
        return;
      }
      const snap = await getDoc(doc(db, 'users', fbUser.uid));
      if (!snap.exists()) {
        router.push('/pending-approval');
        return;
      }
      const user = { ...snap.data(), id: snap.id } as Technician;
      setUserData(user);
      const portals = getAvailablePortals(user);
      if (portals.length === 0) {
        router.push('/pending-approval');
        return;
      }
      if (portals.length === 1) {
        applySessionAndRoute(fbUser.uid, user, portals[0].path);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySessionAndRoute = (uid: string, user: Technician, path: string) => {
    const access = getPortalAccess(user);
    sessionStorage.setItem('currentUserId', uid);
    document.cookie = `aaromach_session=${uid}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `aaromach_portals=${JSON.stringify(access)}; path=/; max-age=86400; SameSite=Strict`;
    router.push(path);
  };

  const handleSelectPortal = async (portalPath: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    if (!snap.exists()) return;
    const user = { ...snap.data(), id: snap.id } as Technician;
    const access = getPortalAccess(user);
    sessionStorage.setItem('currentUserId', fbUser.uid);
    document.cookie = `aaromach_session=${fbUser.uid}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `aaromach_portals=${JSON.stringify(access)}; path=/; max-age=86400; SameSite=Strict`;
    router.push(portalPath);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    document.cookie = 'aaromach_session=; path=/; max-age=0';
    document.cookie = 'aaromach_portals=; path=/; max-age=0';
    sessionStorage.removeItem('currentUserId');
    router.push('/login');
  };

  const availablePortals = useMemo(
    () => userData ? getAvailablePortals(userData) : [],
    [userData]
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary p-6">
      <div className="w-full max-w-lg space-y-8 text-center">

        {logo && (
          <div className="flex justify-center">
            <Image
              src={logo.imageUrl}
              alt="Aaromach"
              width={200}
              height={100}
              className="object-contain"
              style={{ height: '80px', width: 'auto' }}
              priority
            />
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-2xl font-black uppercase tracking-wide text-text-primary">Select Portal</h1>
          <p className="text-sm text-text-secondary">Your account has access to multiple portals. Choose where to go.</p>
        </div>

        <div className="grid gap-3">
          {availablePortals.map(({ id, path }) => {
            const meta = PORTAL_META[id];
            const Icon = meta.icon;
            return (
              <button
                key={id}
                onClick={() => handleSelectPortal(path)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-all cursor-pointer',
                  meta.border,
                  meta.bg
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-center', meta.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-black uppercase tracking-widest', meta.color)}>{meta.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{meta.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full h-10 font-bold uppercase tracking-widest text-xs text-text-muted hover:text-text-primary"
        >
          <LogOut size={14} className="mr-2" /> Sign Out
        </Button>

        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
          Aaromach Command Center · Authorized Access Only
        </p>
      </div>
    </div>
  );
}
