'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { Permission } from '@/lib/permissions';

type PermissionGateProps = {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
};

export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const { hasPermission, loading } = useAuth();
  if (loading) return null;
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}
