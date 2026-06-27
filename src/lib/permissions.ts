'use client';

import type { AppRole, Technician } from './types';
import { TERMINOLOGY } from './constants';

export type Permission =
  | 'view_dashboard'
  | 'view_requests'
  | 'manage_requests'
  | 'view_assignments'
  | 'manage_assignments'
  | 'view_projects'
  | 'manage_projects'
  | 'view_directory'
  | 'manage_personnel'
  | 'view_financials'
  | 'manage_payroll'
  | 'view_settings'
  | 'manage_settings'
  | 'field_checkin'
  | 'field_logs'
  | 'client_portal'
  | 'view_assigned_projects_only'
  | 'view_assigned_work_only'
  | 'approve_pay_changes'
  | 'view_reports';

export type Portal = {
  id: 'admin' | 'tech' | 'client';
  label: string;
  path: string;
};

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [
    'view_dashboard',
    'view_requests',
    'manage_requests',
    'view_assignments',
    'manage_assignments',
    'view_projects',
    'manage_projects',
    'view_directory',
    'manage_personnel',
    'view_financials',
    'manage_payroll',
    'view_settings',
    'manage_settings',
    'field_checkin',
    'field_logs',
    'approve_pay_changes',
    'view_reports',
  ],
  dispatch_admin: [
    'view_dashboard',
    'view_requests',
    'view_assignments',
    'manage_assignments',
    'view_projects',
    'view_directory',
    'view_reports',
  ],
  payroll_admin: [
    'view_dashboard',
    'view_assignments',
    'view_financials',
    'manage_payroll',
    'view_directory',
    'approve_pay_changes',
    'view_reports',
  ],
  project_manager: [
    'view_dashboard',
    'view_requests',
    'view_projects',
    'manage_projects',
    'view_assignments',
    'view_reports',
  ],
  project_lead: [
    'view_dashboard',
    'view_assigned_projects_only',
    'manage_projects',
    'field_checkin',
    'field_logs',
  ],
  field_technician: [
    'view_dashboard',
    'view_assigned_work_only',
    'view_assigned_projects_only',
    'field_checkin',
    'field_logs',
  ],
  client: [
    'view_dashboard',
    'client_portal',
  ],
};

export function hasPermission(user: Technician | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  
  const userRoles: AppRole[] = [...(user.roles || [])];
  
  const currentRole = user.role?.toLowerCase() || '';
  if (currentRole === 'admin' || currentRole === 'super_admin') userRoles.push('super_admin');
  if (currentRole.includes('dispatcher')) userRoles.push('dispatch_admin');
  if (currentRole.includes('client')) userRoles.push('client');
  if (currentRole.includes('lead')) userRoles.push('project_lead');
  if (currentRole.includes('tech')) userRoles.push('field_technician');

  const uniqueRoles = Array.from(new Set(userRoles));
  return uniqueRoles.some(role => ROLE_PERMISSIONS[role as AppRole]?.includes(permission));
}

export function isAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
  const userRoles: AppRole[] = user.roles || [];
  const currentRole = user.role?.toLowerCase() || '';
  const isLegacyAdmin = currentRole.includes('admin') || currentRole.includes('dispatcher') || currentRole.includes('manager');
  return isLegacyAdmin || userRoles.some(role => adminRoles.includes(role));
}

export function isSuperAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const userRoles: AppRole[] = user.roles || [];
  const legacyRole = user.role?.toLowerCase() || '';
  return userRoles.includes('super_admin') || legacyRole === 'admin' || legacyRole === 'super_admin';
}

export function isDispatchAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const userRoles: AppRole[] = user.roles || [];
  return userRoles.includes('dispatch_admin') || (user.role?.toLowerCase() || '').includes('dispatcher');
}

export function isPayAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, 'approve_pay_changes');
}

export function isTech(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const techRoles: AppRole[] = ['project_lead', 'field_technician'];
  const userRoles: AppRole[] = user.roles || [];
  const currentRole = user.role?.toLowerCase() || '';
  const isLegacyTech = currentRole.includes('tech') || currentRole.includes('lead') || currentRole.includes('operative');
  return isLegacyTech || userRoles.some(role => techRoles.includes(role));
}

export function isClient(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const currentRole = user.role?.toLowerCase() || '';
  return user.roles?.includes('client') || currentRole.includes('client');
}

export function getAvailablePortals(user: Technician | null | undefined): Portal[] {
  if (!user) return [];
  const portals: Portal[] = [];
  if (isAdmin(user)) portals.push({ id: 'admin', label: TERMINOLOGY.PORTAL.ADMIN, path: '/admin/dashboard' });
  if (isTech(user)) portals.push({ id: 'tech', label: TERMINOLOGY.PORTAL.TECH, path: '/tech/dashboard' });
  if (isClient(user)) portals.push({ id: 'client', label: TERMINOLOGY.PORTAL.CLIENT, path: '/client/dashboard' });
  return portals;
}