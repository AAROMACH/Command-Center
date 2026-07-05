'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getPortalAccess, getAvailablePortals } from '@/lib/permissions';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, LogOut, RefreshCw, ShieldOff, ShieldCheck } from 'lucide-react';
import type { Technician } from '@/lib/types';

export default function PendingApprovalPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'denied' | null>(null);
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const logo = PlaceHolderImages.find(img => img.id === 'app-logo');

  // Set cookie + session and route to the correct portal for approved users
  const redirectApprovedUser = (uid: string, userData: Technician) => {
    const access = getPortalAccess(userData);
    const portals = getAvailablePortals(userData);
    // Approved but no portal access — stay on this screen instead of
    // bouncing between the middleware and portal-select forever.
    if (portals.length === 0) return;
    sessionStorage.setItem('currentUserId', uid);
    document.cookie = `aaromach_session=${uid}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `aaromach_portals=${JSON.stringify(access)}; path=/; max-age=86400; SameSite=Strict`;
    if (portals.length > 1 && userData.primaryPortal) {
      const primary = portals.find(p => p.id === userData.primaryPortal);
      router.push(primary ? primary.path : portals[0].path);
    } else if (portals.length > 1) {
      router.push('/portal-select');
    } else {
      router.push(portals[0].path);
    }
  };

  const checkStatus = async (uid: string) => {
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return;
      const data = { ...snap.data(), id: snap.id } as Technician;

      if (data.approvalStatus === 'denied') {
        setApprovalStatus('denied');
        setDenialReason(data.denialReason || null);
        return;
      }

      const isApproved = data.approvalStatus === 'approved'
        || (data.roles?.length ?? 0) > 0
        || !!data.role;

      if (isApproved) {
        redirectApprovedUser(uid, data);
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        router.push('/login');
        return;
      }
      setUserEmail(fbUser.email);
      setUserName(fbUser.displayName);

      // Real-time listener: fires immediately and whenever the doc changes
      unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        if (!snap.exists()) return;
        const data = { ...snap.data(), id: snap.id } as Technician;

        if (data.approvalStatus === 'denied') {
          setApprovalStatus('denied');
          setDenialReason(data.denialReason || null);
          return;
        }

        const isApproved = data.approvalStatus === 'approved'
          || (data.roles?.length ?? 0) > 0
          || !!data.role;

        if (isApproved) {
          redirectApprovedUser(fbUser.uid, data);
        } else {
          setApprovalStatus('pending');
        }
      });
    });

    return () => {
      unsubAuth();
      unsubUser?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    document.cookie = 'aaromach_session=; path=/; max-age=0';
    document.cookie = 'aaromach_portals=; path=/; max-age=0';
    sessionStorage.removeItem('currentUserId');
    router.push('/login');
  };

  const isDenied = approvalStatus === 'denied';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary p-6 text-center">
      <div className="w-full max-w-md space-y-8">

        {/* Logo */}
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

        {/* Status icon */}
        <div className="flex justify-center">
          {isDenied ? (
            <div className="w-20 h-20 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center justify-center">
              <ShieldOff size={36} className="text-[#ef4444]" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center">
              <Clock size={36} className="text-[#f59e0b]" />
            </div>
          )}
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-2xl font-black uppercase tracking-wide text-text-primary">
            {isDenied ? 'Access Denied' : 'Account Waiting for Approval'}
          </h1>

          {isDenied ? (
            <p className="text-sm text-text-secondary leading-relaxed">
              Your access request has been reviewed and denied. Please contact your administrator
              for more information or to appeal this decision.
            </p>
          ) : (
            <p className="text-sm text-text-secondary leading-relaxed">
              Your account has been created. An administrator needs to approve your access
              before you can enter the Aaromach Command Center.
            </p>
          )}
        </div>

        {/* Status badge */}
        <div className="flex justify-center">
          {isDenied ? (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444] text-[10px] font-black uppercase tracking-widest">
              <ShieldOff size={10} /> Access Denied
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-black uppercase tracking-widest">
              <Clock size={10} /> Pending Approval
            </span>
          )}
        </div>

        {/* Denial reason */}
        {isDenied && denialReason && (
          <div className="rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/5 px-4 py-3">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1">Reason</p>
            <p className="text-sm text-text-secondary">{denialReason}</p>
          </div>
        )}

        {/* Signed-in as */}
        {userEmail && (
          <div className="rounded-lg border border-border-sub bg-bg-secondary px-4 py-3">
            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">Signed in as</p>
            {userName && <p className="text-sm font-bold text-text-primary">{userName}</p>}
            <p className="text-[11px] text-text-muted">{userEmail}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {!isDenied && (
            <Button
              variant="outline"
              disabled={checking}
              onClick={() => {
                const fbUser = auth.currentUser;
                if (fbUser) checkStatus(fbUser.uid);
              }}
              className="w-full h-11 border-border-main bg-bg-secondary hover:bg-bg-tertiary font-bold uppercase tracking-widest text-xs"
            >
              {checking ? (
                <><RefreshCw size={14} className="mr-2 animate-spin" /> Checking...</>
              ) : (
                <><RefreshCw size={14} className="mr-2" /> Refresh Status</>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full h-11 font-bold uppercase tracking-widest text-xs text-text-muted hover:text-text-primary"
          >
            <LogOut size={14} className="mr-2" /> Sign Out
          </Button>
        </div>

        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
          Aaromach Command Center · Authorized Access Only
        </p>
      </div>
    </div>
  );
}
