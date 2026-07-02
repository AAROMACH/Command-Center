'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    let unsubUser: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      unsubUser?.();
      if (!fbUser) {
        setUser(null);
        setFirebaseUid(null);
        setLoading(false);
        return;
      }
      setFirebaseUid(fbUser.uid);
      unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        setUser(snap.exists() ? ({ ...snap.data(), id: snap.id } as Technician) : null);
        setLoading(false);
      });
    });

    return () => {
      unsubAuth();
      unsubUser?.();
    };
  }, []);

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
