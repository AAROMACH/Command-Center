'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Technician } from '@/lib/types';
import type { Permission, Portal } from '@/lib/permissions';
import {
  hasPermission as checkPermission,
  getPortalAccess,
  getAvailablePortals,
  isAdmin as checkIsAdmin,
  isTech as checkIsTech,
  isClient as checkIsClient,
} from '@/lib/permissions';

const PROTECTED_PREFIXES = ['/admin', '/tech', '/client'];
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function readSessionCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)aaromach_session=([^;]+)/);
  return m?.[1] ?? null;
}

function clearAuthCookies() {
  document.cookie = 'aaromach_session=; path=/; max-age=0; SameSite=Strict';
  document.cookie = 'aaromach_portals=; path=/; max-age=0; SameSite=Strict';
}

type PortalAccess = { admin: boolean; tech: boolean; client: boolean };

type AuthContextValue = {
  user: Technician | null;
  loading: boolean;
  firebaseUid: string | null;
  hasPermission: (permission: Permission) => boolean;
  isAdmin: boolean;
  isTech: boolean;
  isClient: boolean;
  portals: Portal[];
  portalAccess: PortalAccess;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  firebaseUid: null,
  hasPermission: () => false,
  isAdmin: false,
  isTech: false,
  isClient: false,
  portals: [],
  portalAccess: { admin: false, tech: false, client: false },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Technician | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Keep the current pathname reachable inside the auth listener without
  // re-subscribing it on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Bridge legacy pages that read sessionStorage.currentUserId: on a fresh tab
  // the session cookie survives but sessionStorage does not, so rehydrate it
  // from the cookie synchronously (during first render) — before any child
  // effect reads it — so pages never fall back to a placeholder identity.
  useState(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('currentUserId')) {
      const uid = readSessionCookie();
      if (uid) sessionStorage.setItem('currentUserId', uid);
    }
  });

  useEffect(() => {
    let unsubUser: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      unsubUser?.();
      if (!fbUser) {
        // No restored session (signed out, or persistence expired). Clear any
        // stale identity so pages can't render a wrong/placeholder account, and
        // send protected routes back to login.
        setUser(null);
        setFirebaseUid(null);
        setLoading(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('currentUserId');
          clearAuthCookies();
          if (PROTECTED_PREFIXES.some(p => pathnameRef.current?.startsWith(p))) {
            router.replace('/login');
          }
        }
        return;
      }
      setFirebaseUid(fbUser.uid);
      if (typeof window !== 'undefined') {
        // Keep the identity the legacy pages read in sync, and refresh the
        // routing cookie so the middleware keeps letting a remembered user in.
        sessionStorage.setItem('currentUserId', fbUser.uid);
        document.cookie = `aaromach_session=${fbUser.uid}; path=/; max-age=${SESSION_MAX_AGE}; SameSite=Strict`;
      }
      unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        const u = snap.exists() ? ({ ...snap.data(), id: snap.id } as Technician) : null;
        setUser(u);
        setLoading(false);
        // Refresh the portals cookie so middleware portal-gating stays correct
        // after a session is restored (not just at login).
        if (u && typeof window !== 'undefined') {
          document.cookie = `aaromach_portals=${JSON.stringify(getPortalAccess(u))}; path=/; max-age=${SESSION_MAX_AGE}; SameSite=Strict`;
        }
      });
    });

    return () => {
      unsubAuth();
      unsubUser?.();
    };
  }, [router]);

  const value: AuthContextValue = {
    user,
    loading,
    firebaseUid,
    hasPermission: (p: Permission) => checkPermission(user, p),
    isAdmin: checkIsAdmin(user),
    isTech: checkIsTech(user),
    isClient: checkIsClient(user),
    portals: getAvailablePortals(user),
    portalAccess: getPortalAccess(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
