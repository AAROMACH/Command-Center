'use client';

import type { AppRole, Technician } from './types';
import { TERMINOLOGY } from './constants';

// Permission format: portal.page.action
export type Permission =
  // ── Admin portal ──────────────────────────────────────────────────
  | 'admin.dashboard.view'
  // Requests
  | 'admin.requests.view'
  | 'admin.requests.manage'
  // Dispatch
  | 'admin.dispatch.view'
  | 'admin.dispatch.assign_technician'
  | 'admin.dispatch.swap_technician'
  | 'admin.dispatch.remove_technician'
  | 'admin.dispatch.add_technician'
  | 'admin.dispatch.assign_helper'
  | 'admin.dispatch.create_route'
  | 'admin.dispatch.edit_route'
  | 'admin.dispatch.delete_route'
  | 'admin.dispatch.optimize_routes'
  | 'admin.dispatch.dispatch_route'
  | 'admin.dispatch.reschedule_job'
  | 'admin.dispatch.cancel_assignment'
  | 'admin.dispatch.override_conflicts'
  // Schedule
  | 'admin.schedule.view'
  // Assignments
  | 'admin.assignments.view'
  | 'admin.assignments.manage'
  // Projects
  | 'admin.projects.view'
  | 'admin.projects.manage'
  | 'admin.projects.create'
  | 'admin.projects.edit'
  | 'admin.projects.archive'
  | 'admin.projects.create_phase'
  | 'admin.projects.create_task'
  | 'admin.projects.assign_task'
  | 'admin.projects.complete_task'
  | 'admin.projects.reopen_task'
  | 'admin.projects.close'
  // CRM
  | 'admin.crm.view'
  | 'admin.crm.view_leads'
  | 'admin.crm.manage_leads'
  | 'admin.crm.create_lead'
  | 'admin.crm.create_opportunity'
  | 'admin.crm.create_quote'
  | 'admin.crm.edit_quote'
  | 'admin.crm.send_quote'
  | 'admin.crm.approve_quote'
  | 'admin.crm.convert_quote'
  | 'admin.crm.mark_won'
  | 'admin.crm.mark_lost'
  // Clients
  | 'admin.clients.view'
  | 'admin.clients.manage'
  // Directory
  | 'admin.directory.view'
  | 'admin.directory.manage'
  | 'admin.directory.assign_roles'
  | 'admin.directory.edit_permissions'
  | 'admin.directory.upload_documents'
  | 'admin.directory.approve_documents'
  | 'admin.directory.reset_password'
  | 'admin.directory.disable_user'
  // Financials
  | 'admin.financials.view'
  | 'admin.financials.view_profit'
  | 'admin.financials.create_invoice'
  | 'admin.financials.edit_invoice'
  | 'admin.financials.void_invoice'
  | 'admin.financials.approve_reimbursements'
  | 'admin.financials.process_payroll'
  | 'admin.financials.export'
  | 'admin.financials.approve_pay_changes'
  // Reports
  | 'admin.reports.view'
  | 'admin.reports.generate'
  | 'admin.reports.export'
  | 'admin.reports.schedule'
  // Messages
  | 'admin.messages.view'
  | 'admin.messages.broadcast'
  | 'admin.messages.group_chat'
  | 'admin.messages.delete'
  | 'admin.messages.pin'
  | 'admin.messages.upload_files'
  // Settings
  | 'admin.settings.view'
  | 'admin.settings.manage'
  | 'admin.settings.company'
  | 'admin.settings.integrations'
  | 'admin.settings.api_keys'
  | 'admin.settings.audit_logs'
  | 'admin.settings.automation_rules'
  // Safety & Training
  | 'admin.safety.manage_events'
  | 'admin.training.manage_certifications'
  // Admin overrides
  | 'admin.overrides.edit_completed_assignments'
  | 'admin.overrides.edit_closed_projects'
  | 'admin.overrides.override_payroll_locks'
  | 'admin.overrides.override_scheduling_locks'
  | 'admin.overrides.delete_historical_records'
  | 'admin.overrides.force_complete_assignment'
  | 'admin.overrides.force_close_project'
  | 'admin.overrides.bypass_approval_workflow'

  // ── Tech portal ───────────────────────────────────────────────────
  | 'tech.dashboard.view'
  | 'tech.assignments.view'
  | 'tech.assignments.confirm'
  | 'tech.assignments.start_trip'
  | 'tech.assignments.check_in'
  | 'tech.assignments.check_out'
  | 'tech.assignments.complete'
  | 'tech.assignments.report_issue'
  | 'tech.schedule.view'
  | 'tech.projects.view'
  | 'tech.projects.create_task'
  | 'tech.projects.assign_task'
  | 'tech.projects.complete_task'
  | 'tech.logs.view'
  | 'tech.logs.create'
  | 'tech.earnings.view'
  | 'tech.messages.view'
  | 'tech.messages.send'
  | 'tech.profile.view'
  | 'tech.profile.edit'

  // ── Client portal ─────────────────────────────────────────────────
  | 'client.dashboard.view'
  | 'client.tickets.view'
  | 'client.tickets.create'
  | 'client.projects.view'
  | 'client.sites.view'
  | 'client.quotes.view'
  | 'client.financials.view'
  | 'client.messages.view'
  | 'client.messages.send'
  | 'client.profile.view'
  | 'client.profile.edit';

export const ALL_PERMISSIONS: Permission[] = [
  // Admin - dashboard
  'admin.dashboard.view',
  // Admin - requests
  'admin.requests.view', 'admin.requests.manage',
  // Admin - dispatch
  'admin.dispatch.view', 'admin.dispatch.assign_technician', 'admin.dispatch.swap_technician',
  'admin.dispatch.remove_technician', 'admin.dispatch.add_technician', 'admin.dispatch.assign_helper',
  'admin.dispatch.create_route', 'admin.dispatch.edit_route', 'admin.dispatch.delete_route',
  'admin.dispatch.optimize_routes', 'admin.dispatch.dispatch_route', 'admin.dispatch.reschedule_job',
  'admin.dispatch.cancel_assignment', 'admin.dispatch.override_conflicts',
  // Admin - schedule
  'admin.schedule.view',
  // Admin - assignments
  'admin.assignments.view', 'admin.assignments.manage',
  // Admin - projects
  'admin.projects.view', 'admin.projects.manage', 'admin.projects.create', 'admin.projects.edit',
  'admin.projects.archive', 'admin.projects.create_phase', 'admin.projects.create_task',
  'admin.projects.assign_task', 'admin.projects.complete_task', 'admin.projects.reopen_task', 'admin.projects.close',
  // Admin - crm
  'admin.crm.view', 'admin.crm.view_leads', 'admin.crm.manage_leads', 'admin.crm.create_lead',
  'admin.crm.create_opportunity', 'admin.crm.create_quote', 'admin.crm.edit_quote', 'admin.crm.send_quote',
  'admin.crm.approve_quote', 'admin.crm.convert_quote', 'admin.crm.mark_won', 'admin.crm.mark_lost',
  // Admin - clients
  'admin.clients.view', 'admin.clients.manage',
  // Admin - directory
  'admin.directory.view', 'admin.directory.manage', 'admin.directory.assign_roles',
  'admin.directory.edit_permissions', 'admin.directory.upload_documents', 'admin.directory.approve_documents',
  'admin.directory.reset_password', 'admin.directory.disable_user',
  // Admin - financials
  'admin.financials.view', 'admin.financials.view_profit', 'admin.financials.create_invoice',
  'admin.financials.edit_invoice', 'admin.financials.void_invoice', 'admin.financials.approve_reimbursements',
  'admin.financials.process_payroll', 'admin.financials.export', 'admin.financials.approve_pay_changes',
  // Admin - reports
  'admin.reports.view', 'admin.reports.generate', 'admin.reports.export', 'admin.reports.schedule',
  // Admin - messages
  'admin.messages.view', 'admin.messages.broadcast', 'admin.messages.group_chat',
  'admin.messages.delete', 'admin.messages.pin', 'admin.messages.upload_files',
  // Admin - settings
  'admin.settings.view', 'admin.settings.manage', 'admin.settings.company',
  'admin.settings.integrations', 'admin.settings.api_keys', 'admin.settings.audit_logs',
  'admin.settings.automation_rules',
  // Admin - safety & training
  'admin.safety.manage_events', 'admin.training.manage_certifications',
  // Admin - overrides
  'admin.overrides.edit_completed_assignments', 'admin.overrides.edit_closed_projects',
  'admin.overrides.override_payroll_locks', 'admin.overrides.override_scheduling_locks',
  'admin.overrides.delete_historical_records', 'admin.overrides.force_complete_assignment',
  'admin.overrides.force_close_project', 'admin.overrides.bypass_approval_workflow',
  // Tech
  'tech.dashboard.view', 'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
  'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
  'tech.assignments.report_issue', 'tech.schedule.view', 'tech.projects.view',
  'tech.projects.create_task', 'tech.projects.assign_task', 'tech.projects.complete_task',
  'tech.logs.view', 'tech.logs.create', 'tech.earnings.view', 'tech.messages.view', 'tech.messages.send',
  'tech.profile.view', 'tech.profile.edit',
  // Client
  'client.dashboard.view', 'client.tickets.view', 'client.tickets.create', 'client.projects.view',
  'client.sites.view', 'client.quotes.view', 'client.financials.view', 'client.messages.view',
  'client.messages.send', 'client.profile.view', 'client.profile.edit',
];

// Hierarchical tree for UI rendering (portal → page → actions)
export type PermissionTree = {
  [portal: string]: {
    [page: string]: Permission[];
  };
};

export const PERMISSION_TREE: PermissionTree = {
  admin: {
    dashboard: ['admin.dashboard.view'],
    requests: ['admin.requests.view', 'admin.requests.manage'],
    dispatch: [
      'admin.dispatch.view', 'admin.dispatch.assign_technician', 'admin.dispatch.swap_technician',
      'admin.dispatch.remove_technician', 'admin.dispatch.add_technician', 'admin.dispatch.assign_helper',
      'admin.dispatch.create_route', 'admin.dispatch.edit_route', 'admin.dispatch.delete_route',
      'admin.dispatch.optimize_routes', 'admin.dispatch.dispatch_route', 'admin.dispatch.reschedule_job',
      'admin.dispatch.cancel_assignment', 'admin.dispatch.override_conflicts',
    ],
    schedule: ['admin.schedule.view'],
    assignments: ['admin.assignments.view', 'admin.assignments.manage'],
    projects: [
      'admin.projects.view', 'admin.projects.manage', 'admin.projects.create', 'admin.projects.edit',
      'admin.projects.archive', 'admin.projects.create_phase', 'admin.projects.create_task',
      'admin.projects.assign_task', 'admin.projects.complete_task', 'admin.projects.reopen_task', 'admin.projects.close',
    ],
    crm: [
      'admin.crm.view', 'admin.crm.view_leads', 'admin.crm.manage_leads', 'admin.crm.create_lead',
      'admin.crm.create_opportunity', 'admin.crm.create_quote', 'admin.crm.edit_quote', 'admin.crm.send_quote',
      'admin.crm.approve_quote', 'admin.crm.convert_quote', 'admin.crm.mark_won', 'admin.crm.mark_lost',
    ],
    clients: ['admin.clients.view', 'admin.clients.manage'],
    directory: [
      'admin.directory.view', 'admin.directory.manage', 'admin.directory.assign_roles',
      'admin.directory.edit_permissions', 'admin.directory.upload_documents',
      'admin.directory.approve_documents', 'admin.directory.reset_password', 'admin.directory.disable_user',
    ],
    financials: [
      'admin.financials.view', 'admin.financials.view_profit', 'admin.financials.create_invoice',
      'admin.financials.edit_invoice', 'admin.financials.void_invoice', 'admin.financials.approve_reimbursements',
      'admin.financials.process_payroll', 'admin.financials.export', 'admin.financials.approve_pay_changes',
    ],
    reports: ['admin.reports.view', 'admin.reports.generate', 'admin.reports.export', 'admin.reports.schedule'],
    messages: [
      'admin.messages.view', 'admin.messages.broadcast', 'admin.messages.group_chat',
      'admin.messages.delete', 'admin.messages.pin', 'admin.messages.upload_files',
    ],
    settings: [
      'admin.settings.view', 'admin.settings.manage', 'admin.settings.company',
      'admin.settings.integrations', 'admin.settings.api_keys', 'admin.settings.audit_logs',
      'admin.settings.automation_rules',
    ],
    safety: ['admin.safety.manage_events'],
    training: ['admin.training.manage_certifications'],
    overrides: [
      'admin.overrides.edit_completed_assignments', 'admin.overrides.edit_closed_projects',
      'admin.overrides.override_payroll_locks', 'admin.overrides.override_scheduling_locks',
      'admin.overrides.delete_historical_records', 'admin.overrides.force_complete_assignment',
      'admin.overrides.force_close_project', 'admin.overrides.bypass_approval_workflow',
    ],
  },
  tech: {
    dashboard: ['tech.dashboard.view'],
    assignments: [
      'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
      'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
      'tech.assignments.report_issue',
    ],
    schedule: ['tech.schedule.view'],
    projects: ['tech.projects.view', 'tech.projects.create_task', 'tech.projects.assign_task', 'tech.projects.complete_task'],
    logs: ['tech.logs.view', 'tech.logs.create'],
    earnings: ['tech.earnings.view'],
    messages: ['tech.messages.view', 'tech.messages.send'],
    profile: ['tech.profile.view', 'tech.profile.edit'],
  },
  client: {
    dashboard: ['client.dashboard.view'],
    tickets: ['client.tickets.view', 'client.tickets.create'],
    projects: ['client.projects.view'],
    sites: ['client.sites.view'],
    quotes: ['client.quotes.view'],
    financials: ['client.financials.view'],
    messages: ['client.messages.view', 'client.messages.send'],
    profile: ['client.profile.view', 'client.profile.edit'],
  },
};

// Derive a human-readable label from a portal.page.action permission string
export function permissionLabel(perm: Permission | string): string {
  const parts = perm.split('.');
  if (parts.length === 3) {
    const action = parts[2].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return action;
  }
  return perm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export type Portal = {
  id: 'admin' | 'tech' | 'client';
  label: string;
  path: string;
};

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  dispatch_admin: [
    'admin.dashboard.view', 'admin.requests.view', 'admin.assignments.view', 'admin.assignments.manage',
    'admin.dispatch.view', 'admin.dispatch.assign_technician', 'admin.dispatch.swap_technician',
    'admin.dispatch.remove_technician', 'admin.dispatch.add_technician', 'admin.dispatch.assign_helper',
    'admin.dispatch.create_route', 'admin.dispatch.edit_route', 'admin.dispatch.delete_route',
    'admin.dispatch.optimize_routes', 'admin.dispatch.dispatch_route', 'admin.dispatch.reschedule_job',
    'admin.dispatch.cancel_assignment', 'admin.dispatch.override_conflicts',
    'admin.schedule.view', 'admin.projects.view', 'admin.directory.view',
    'admin.reports.view', 'admin.messages.view', 'admin.messages.group_chat', 'admin.messages.broadcast',
  ],
  payroll_admin: [
    'admin.dashboard.view', 'admin.assignments.view', 'admin.directory.view',
    'admin.financials.view', 'admin.financials.view_profit', 'admin.financials.create_invoice',
    'admin.financials.edit_invoice', 'admin.financials.void_invoice', 'admin.financials.approve_reimbursements',
    'admin.financials.process_payroll', 'admin.financials.export', 'admin.financials.approve_pay_changes',
    'admin.reports.view', 'admin.reports.generate', 'admin.reports.export',
  ],
  project_manager: [
    'admin.dashboard.view', 'admin.requests.view', 'admin.assignments.view', 'admin.schedule.view',
    'admin.projects.view', 'admin.projects.manage', 'admin.projects.create', 'admin.projects.edit',
    'admin.projects.archive', 'admin.projects.create_phase', 'admin.projects.create_task',
    'admin.projects.assign_task', 'admin.projects.complete_task', 'admin.projects.reopen_task', 'admin.projects.close',
    'admin.directory.view', 'admin.reports.view', 'admin.reports.generate',
  ],
  project_lead: [
    'tech.dashboard.view', 'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
    'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
    'tech.assignments.report_issue', 'tech.schedule.view', 'tech.projects.view',
    'tech.projects.create_task', 'tech.projects.assign_task', 'tech.projects.complete_task',
    'tech.logs.view', 'tech.logs.create', 'tech.earnings.view',
    'tech.messages.view', 'tech.messages.send', 'tech.profile.view', 'tech.profile.edit',
  ],
  field_technician: [
    'tech.dashboard.view', 'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
    'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
    'tech.assignments.report_issue', 'tech.schedule.view', 'tech.projects.view',
    'tech.logs.view', 'tech.logs.create', 'tech.earnings.view',
    'tech.messages.view', 'tech.messages.send', 'tech.profile.view', 'tech.profile.edit',
  ],
  client: [
    'client.dashboard.view', 'client.tickets.view', 'client.tickets.create', 'client.projects.view',
    'client.sites.view', 'client.quotes.view', 'client.financials.view',
    'client.messages.view', 'client.messages.send', 'client.profile.view', 'client.profile.edit',
  ],
  sales: [
    'admin.dashboard.view', 'admin.crm.view', 'admin.crm.view_leads', 'admin.crm.manage_leads',
    'admin.crm.create_lead', 'admin.crm.create_opportunity', 'admin.crm.create_quote',
    'admin.crm.edit_quote', 'admin.crm.send_quote', 'admin.crm.mark_won', 'admin.crm.mark_lost',
    'admin.projects.view', 'admin.clients.view', 'admin.directory.view',
    'admin.reports.view', 'admin.reports.generate',
  ],
  safety_officer: [
    'admin.dashboard.view', 'admin.assignments.view', 'admin.projects.view', 'admin.directory.view',
    'admin.directory.upload_documents', 'admin.safety.manage_events',
    'admin.reports.view', 'admin.reports.generate',
  ],
  training_coordinator: [
    'admin.dashboard.view', 'admin.directory.view', 'admin.directory.upload_documents',
    'admin.directory.approve_documents', 'admin.training.manage_certifications',
    'admin.reports.view', 'admin.reports.generate',
  ],
};

export function hasPermission(user: Technician | null | undefined, permission: Permission): boolean {
  if (!user) return false;

  if (user.permissionOverrides) {
    if (user.permissionOverrides[permission] === true) return true;
    if (user.permissionOverrides[permission] === false) return false;
  }

  const userRoles: AppRole[] = [...(user.roles || [])];

  const currentRole = user.role?.toLowerCase() || '';
  if (currentRole === 'admin' || currentRole === 'super_admin') userRoles.push('super_admin');
  if (currentRole.includes('dispatcher')) userRoles.push('dispatch_admin');
  if (currentRole.includes('client')) userRoles.push('client');
  if (currentRole.includes('lead')) userRoles.push('project_lead');
  if (currentRole.includes('tech')) userRoles.push('field_technician');
  if (currentRole === 'sales' || currentRole.includes('sales')) userRoles.push('sales');
  if (currentRole.includes('safety')) userRoles.push('safety_officer');
  if (currentRole.includes('training')) userRoles.push('training_coordinator');

  const uniqueRoles = Array.from(new Set(userRoles));
  return uniqueRoles.some(role => ROLE_PERMISSIONS[role as AppRole]?.includes(permission));
}

export function isAdmin(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager', 'sales', 'safety_officer', 'training_coordinator'];
  const userRoles: AppRole[] = user.roles || [];
  const currentRole = user.role?.toLowerCase() || '';
  const isLegacyAdmin = currentRole.includes('admin') || currentRole.includes('dispatcher') || currentRole.includes('manager');
  return isLegacyAdmin || userRoles.some(role => adminRoles.includes(role));
}

export function isSales(user: Technician | null | undefined): boolean {
  if (!user) return false;
  const currentRole = user.role?.toLowerCase() || '';
  return user.roles?.includes('sales') || currentRole === 'sales' || currentRole.includes('sales');
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
  return hasPermission(user, 'admin.financials.approve_pay_changes');
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

export function getPortalAccess(user: Technician | null | undefined): { admin: boolean; tech: boolean; client: boolean } {
  if (!user) return { admin: false, tech: false, client: false };
  const adminByRole = isAdmin(user);
  const techByRole = isTech(user);
  const clientByRole = isClient(user);
  return {
    admin: user.portalAccess?.admin !== undefined ? user.portalAccess.admin : adminByRole,
    tech: user.portalAccess?.tech !== undefined ? user.portalAccess.tech : techByRole,
    client: user.portalAccess?.client !== undefined ? user.portalAccess.client : clientByRole,
  };
}

export function getAvailablePortals(user: Technician | null | undefined): Portal[] {
  if (!user) return [];
  const access = getPortalAccess(user);
  const portals: Portal[] = [];
  if (access.admin) portals.push({ id: 'admin', label: TERMINOLOGY.PORTAL.ADMIN, path: '/admin/dashboard' });
  if (access.tech) portals.push({ id: 'tech', label: TERMINOLOGY.PORTAL.TECH, path: '/tech/dashboard' });
  if (access.client) portals.push({ id: 'client', label: TERMINOLOGY.PORTAL.CLIENT, path: '/client/dashboard' });
  return portals;
}
