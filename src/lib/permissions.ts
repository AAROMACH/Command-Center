'use client';

import type { AppRole, Technician } from './types';

export type Permission =
  | 'view_dashboard'
  | 'view_requests'
  | 'manage_requests'
  | 'view_assignments'
  | 'manage_assignments' // Create, Assign, Reschedule
  | 'view_projects'
  | 'manage_projects' // Create, Edit details, Manage phases
  | 'view_directory'
  | 'manage_personnel'
  | 'view_financials'
  | 'manage_payroll' // Approve logs, reimbursements
  | 'view_settings'
  | 'manage_settings'
  | 'field_checkin'
  | 'field_logs'
  | 'client_portal'
  | 'view_assigned_projects_only'
  | 'view_assigned_work_only';

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
    'manage_projects', // Within assigned projects
    'field_checkin',
    'field_logs',
  ],
  field_technician: [
    'view_dashboard',
    'view_assigned_work_only',
    'field_checkin',
    'field_logs',
  ],
  client: [
    'view_dashboard',
    'client_portal',
  ],
};

/**
 * Checks if a user has a specific permission based on their roles.
 * Supports both multi-role array and legacy single role string.
 */
export function hasPermission(user: Technician | null | undefined, permission: Permission): boolean {
  if (!user) return false;

  // Union of roles from array and legacy field
  const userRoles: AppRole[] = [...(user.roles || [])];
  
  // Backward compatibility: Map legacy role strings to AppRole if not already in array
  const legacyRole = user.role.toLowerCase().replace(/ /g, '_') as AppRole;
  if (legacyRole === 'lead_field_technician' as any) userRoles.push('project_lead');
  else if (legacyRole === 'field_technician' as any) userRoles.push('field_technician');
  else if (legacyRole === 'appliance_specialist' as any) userRoles.push('field_technician');
  else if (legacyRole === 'senior_technician' as any) userRoles.push('field_technician');
  else if (legacyRole === 'smart_home_integrator' as any) userRoles.push('field_technician');
  else if (legacyRole === 'junior_technician' as any) userRoles.push('field_technician');
  else if (user.role.toLowerCase() === 'admin') userRoles.push('super_admin');
  else if (user.role.toLowerCase() === 'dispatcher') userRoles.push('dispatch_admin');

  // Check if any assigned role grants the permission
  return userRoles.some(role => {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions?.includes(permission);
  });
}

export function isAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
  const userRoles: AppRole[] = user.roles || [];
  
  // Legacy check
  const isLegacyAdmin = ['admin', 'dispatcher'].includes(user.role.toLowerCase());
  
  return isLegacyAdmin || userRoles.some(role => adminRoles.includes(role));
}

export function isTech(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const techRoles: AppRole[] = ['project_lead', 'field_technician'];
  const userRoles: AppRole[] = user.roles || [];
  
  // Legacy check
  const isLegacyTech = user.role.toLowerCase().includes('tech') || 
                       user.role.toLowerCase().includes('specialist') || 
                       user.role.toLowerCase().includes('integrator');
  
  return isLegacyTech || userRoles.some(role => techRoles.includes(role));
}

export function isClient(user: Technician | null | undefined): boolean {
  if (!user) return false;
  return user.roles?.includes('client') || user.role.toLowerCase().includes('client');
}
