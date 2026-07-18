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
  | 'admin.crm.import_leads'
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
  | 'tech.logs.unsubmit'
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
  'admin.crm.import_leads',
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
  'tech.logs.view', 'tech.logs.create', 'tech.logs.unsubmit', 'tech.earnings.view', 'tech.messages.view', 'tech.messages.send',
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
      'admin.crm.import_leads',
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
    logs: ['tech.logs.view', 'tech.logs.create', 'tech.logs.unsubmit'],
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
    'tech.logs.view', 'tech.logs.create', 'tech.logs.unsubmit', 'tech.earnings.view',
    'tech.messages.view', 'tech.messages.send', 'tech.profile.view', 'tech.profile.edit',
  ],
  field_technician: [
    'tech.dashboard.view', 'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
    'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
    'tech.assignments.report_issue', 'tech.schedule.view', 'tech.projects.view',
    'tech.logs.view', 'tech.logs.create', 'tech.logs.unsubmit', 'tech.earnings.view',
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
    'admin.crm.import_leads',
    'admin.projects.view', 'admin.clients.view', 'admin.directory.view',
    'admin.reports.view', 'admin.reports.generate',
  ],
  safety_officer: [
    'admin.dashboard.view', 'admin.assignments.view', 'admin.projects.view', 'admin.directory.view',
    'admin.directory.upload_documents',
    'admin.reports.view', 'admin.reports.generate',
  ],
  training_coordinator: [
    'admin.dashboard.view', 'admin.directory.view', 'admin.directory.upload_documents',
    'admin.directory.approve_documents',
    'admin.reports.view', 'admin.reports.generate',
  ],
};

export const APP_ROLES: AppRole[] = [
  'super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager',
  'project_lead', 'field_technician', 'client', 'sales',
  'safety_officer', 'training_coordinator',
];

// Map a legacy free-text `role` value (e.g. "Technician", "Dispatcher") to a
// valid AppRole, using the same heuristics hasPermission applies. Returns
// null when the value maps to nothing — never write unmapped strings into
// the typed `roles` array.
export function normalizeLegacyRole(role: string | null | undefined): AppRole | null {
  const r = (role || '').toLowerCase().trim();
  if (!r) return null;
  if ((APP_ROLES as string[]).includes(r)) return r as AppRole;
  if (r === 'admin') return 'super_admin';
  if (r.includes('dispatcher')) return 'dispatch_admin';
  if (r.includes('payroll')) return 'payroll_admin';
  if (r.includes('client')) return 'client';
  if (r.includes('lead')) return 'project_lead';
  if (r.includes('tech')) return 'field_technician';
  if (r.includes('sales')) return 'sales';
  if (r.includes('safety')) return 'safety_officer';
  if (r.includes('training')) return 'training_coordinator';
  if (r.includes('manager')) return 'project_manager';
  return null;
}

// Minimal shape the role/permission checks below actually need. Accepting
// this instead of the full Technician type lets callers pass Partial<Technician>
// form-state objects (e.g. an in-progress "add personnel" form) without a cast.
export type RoleLike = {
  roles?: AppRole[];
  role?: string;
  permissionOverrides?: Record<string, boolean>;
};

export function hasPermission(user: RoleLike | null | undefined, permission: Permission): boolean {
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

// The 4 core admin/office roles. Note: sales/safety_officer/training_coordinator
// are NOT blanket-admin — they're granted whatever specific permissions
// ROLE_PERMISSIONS lists for them via hasPermission(), but do not get general
// admin UI/access. This matches firestore.rules/storage.rules isAdmin(),
// which only recognizes these 4 — keeping this list wider than the rules
// would show admin UI the server then silently rejects.
export function isAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
  const userRoles: AppRole[] = user.roles || [];
  const currentRole = user.role?.toLowerCase() || '';
  const isLegacyAdmin = currentRole.includes('admin') || currentRole.includes('dispatcher') || currentRole.includes('manager');
  return isLegacyAdmin || userRoles.some(role => adminRoles.includes(role));
}

export function isSales(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const currentRole = user.role?.toLowerCase() || '';
  return user.roles?.includes('sales') || currentRole === 'sales' || currentRole.includes('sales');
}

export function isSuperAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const userRoles: AppRole[] = user.roles || [];
  const legacyRole = user.role?.toLowerCase() || '';
  return userRoles.includes('super_admin') || legacyRole === 'admin' || legacyRole === 'super_admin';
}

export function isDispatchAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const userRoles: AppRole[] = user.roles || [];
  return userRoles.includes('dispatch_admin') || (user.role?.toLowerCase() || '').includes('dispatcher');
}

export function isPayAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, 'admin.financials.approve_pay_changes');
}

export function isTech(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const techRoles: AppRole[] = ['project_lead', 'field_technician'];
  const userRoles: AppRole[] = user.roles || [];
  const currentRole = user.role?.toLowerCase() || '';
  const isLegacyTech = currentRole.includes('tech') || currentRole.includes('lead') || currentRole.includes('operative');
  return isLegacyTech || userRoles.some(role => techRoles.includes(role));
}

export function isClient(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const currentRole = user.role?.toLowerCase() || '';
  return user.roles?.includes('client') || currentRole.includes('client');
}

// A user can enter a portal iff they effectively hold at least one permission
// inside it. This makes the permission set the single source of truth for
// portal access, so it can never contradict the pages a role is granted —
// e.g. the office roles (sales/safety_officer/training_coordinator) hold
// admin-portal permissions and therefore get admin-portal access, which the
// old role-bucket derivation (isAdmin, which excludes them) silently denied.
export function hasAnyPortalPermission(user: RoleLike | null | undefined, portal: 'admin' | 'tech' | 'client'): boolean {
  if (!user) return false;
  const pages = PERMISSION_TREE[portal];
  for (const page of Object.keys(pages)) {
    for (const perm of pages[page]) {
      if (hasPermission(user, perm)) return true;
    }
  }
  return false;
}

// Effective portal access. Precedence (single documented rule):
//   1. Explicit portalAccess.{portal} (an admin-set lock/grant) wins when present.
//   2. Otherwise derive from the permission set via hasAnyPortalPermission,
//      which itself honours permissionOverrides → ROLE_PERMISSIONS.
// This is the same value written to the login `aaromach_portals` cookie
// (middleware) and consumed by the client route guard (canAccessPath), so the
// edge and client agree on one effective result.
export function getPortalAccess(user: Technician | null | undefined): { admin: boolean; tech: boolean; client: boolean } {
  if (!user) return { admin: false, tech: false, client: false };
  return {
    admin: user.portalAccess?.admin !== undefined ? user.portalAccess.admin : hasAnyPortalPermission(user, 'admin'),
    tech: user.portalAccess?.tech !== undefined ? user.portalAccess.tech : hasAnyPortalPermission(user, 'tech'),
    client: user.portalAccess?.client !== undefined ? user.portalAccess.client : hasAnyPortalPermission(user, 'client'),
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
