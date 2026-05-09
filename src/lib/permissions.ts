'use client';

import type { AppRole, Technician } from './types';

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
  | 'approve_pay_changes';

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
  ],
  dispatch_admin: [
    'view_dashboard',
    'view_requests',
    'view_assignments',
    'manage_assignments',
    'view_projects',
    'view_directory',
  ],
  payroll_admin: [
    'view_dashboard',
    'view_assignments',
    'view_financials',
    'manage_payroll',
    'view_directory',
    'approve_pay_changes',
  ],
  project_manager: [
    'view_dashboard',
    'view_requests',
    'view_projects',
    'manage_projects',
    'view_assignments',
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
  
  const legacyRole = user.role.toLowerCase().replace(/ /g, '_') as AppRole;
  if (legacyRole === 'lead_field_technician' as any) userRoles.push('project_lead');
  else if (legacyRole === 'field_technician' as any) userRoles.push('field_technician');
  else if (user.role.toLowerCase() === 'admin') userRoles.push('super_admin');
  else if (user.role.toLowerCase() === 'dispatcher') userRoles.push('dispatch_admin');

  return userRoles.some(role => ROLE_PERMISSIONS[role]?.includes(permission));
}

export function isAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
  const userRoles: AppRole[] = user.roles || [];
  const isLegacyAdmin = ['admin', 'dispatcher'].includes(user.role.toLowerCase());
  return isLegacyAdmin || userRoles.some(role => adminRoles.includes(role));
}

export function isSuperAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const userRoles: AppRole[] = user.roles || [];
  return userRoles.includes('super_admin') || user.role.toLowerCase() === 'admin';
}

export function isPayAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, 'approve_pay_changes');
}

export function isTech(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const techRoles: AppRole[] = ['project_lead', 'field_technician'];
  const userRoles: AppRole[] = user.roles || [];
  const isLegacyTech = user.role.toLowerCase().includes('tech') || 
                       user.role.toLowerCase().includes('specialist') || 
                       user.role.toLowerCase().includes('integrator');
  return isLegacyTech || userRoles.some(role => techRoles.includes(role));
}

export function isClient(user: Technician | null | undefined): boolean {
  if (!user) return false;
  return user.roles?.includes('client') || user.role.toLowerCase().includes('client');
}

export function getAvailablePortals(user: Technician | null | undefined): Portal[] {
  if (!user) return [];
  const portals: Portal[] = [];
  if (isAdmin(user)) portals.push({ id: 'admin', label: 'Admin Portal', path: '/admin/dashboard' });
  if (isTech(user)) portals.push({ id: 'tech', label: 'Technician Portal', path: '/tech/dashboard' });
  if (isClient(user)) portals.push({ id: 'client', label: 'Client Portal', path: '/client/dashboard' });
  return portals;
}
