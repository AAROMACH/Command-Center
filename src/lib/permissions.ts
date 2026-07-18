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
  // Weekly logs (admin-side review)
  | 'admin.logs.view'
  | 'admin.logs.approve'
  | 'admin.logs.return'
  | 'admin.logs.reopen'
  | 'admin.logs.move_assignment'
  | 'admin.logs.lock'
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
  | 'tech.logs.submit'
  | 'tech.logs.unsubmit_own'
  | 'tech.logs.move_assignment'
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
  // Admin - weekly logs
  'admin.logs.view', 'admin.logs.approve', 'admin.logs.return',
  'admin.logs.reopen', 'admin.logs.move_assignment', 'admin.logs.lock',
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
  'tech.logs.view', 'tech.logs.create', 'tech.logs.submit', 'tech.logs.unsubmit_own', 'tech.logs.move_assignment',
  'tech.earnings.view', 'tech.messages.view', 'tech.messages.send',
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
    logs: [
      'admin.logs.view', 'admin.logs.approve', 'admin.logs.return',
      'admin.logs.reopen', 'admin.logs.move_assignment', 'admin.logs.lock',
    ],
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
    logs: [
      'tech.logs.view', 'tech.logs.create', 'tech.logs.submit',
      'tech.logs.unsubmit_own', 'tech.logs.move_assignment',
    ],
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

// ── Central subrole definitions ───────────────────────────────────────
// The single source of truth for the subrole system. Each subrole belongs to
// exactly one portal and carries a preset permission set. Selecting a subrole
// grants access to its portal and applies these permissions; portal access is
// derived from subroles alone (never from individual permission overrides).
// All selectors, access summaries, portal checks and permission presets read
// from this map.
export type SubrolePortal = 'admin' | 'tech' | 'client';

export type SubroleDefinition = {
  portal: SubrolePortal;
  label: string;
  description: string;
  permissions: Permission[];
};

// Reusable tech permission block (Field Technician preset), so Project Lead can
// extend it without duplication.
const FIELD_TECH_PERMISSIONS: Permission[] = [
  'tech.dashboard.view', 'tech.assignments.view', 'tech.assignments.confirm', 'tech.assignments.start_trip',
  'tech.assignments.check_in', 'tech.assignments.check_out', 'tech.assignments.complete',
  'tech.assignments.report_issue', 'tech.schedule.view', 'tech.projects.view', 'tech.projects.complete_task',
  'tech.logs.view', 'tech.logs.create', 'tech.logs.submit', 'tech.logs.unsubmit_own', 'tech.logs.move_assignment',
  'tech.earnings.view', 'tech.messages.view', 'tech.messages.send', 'tech.profile.view', 'tech.profile.edit',
];

export const SUBROLE_DEFINITIONS: Record<AppRole, SubroleDefinition> = {
  super_admin: {
    portal: 'admin',
    label: 'Super Admin',
    description: 'Full Admin Portal authority — every page, permission management and administrative overrides.',
    // Full admin portal (all admin.* permissions). Tech/Client access is NOT
    // implied — a tech or client subrole must be selected separately.
    permissions: ALL_PERMISSIONS.filter(p => p.startsWith('admin.')),
  },
  dispatch_admin: {
    portal: 'admin',
    label: 'Dispatch Admin',
    description: 'Logistics and scheduling — dispatch hub, technician assignment, routes and requests.',
    permissions: [
      'admin.dashboard.view', 'admin.requests.view', 'admin.requests.manage',
      'admin.dispatch.view', 'admin.dispatch.assign_technician', 'admin.dispatch.swap_technician',
      'admin.dispatch.remove_technician', 'admin.dispatch.add_technician', 'admin.dispatch.assign_helper',
      'admin.dispatch.create_route', 'admin.dispatch.edit_route', 'admin.dispatch.delete_route',
      'admin.dispatch.optimize_routes', 'admin.dispatch.dispatch_route', 'admin.dispatch.reschedule_job',
      'admin.dispatch.cancel_assignment', 'admin.dispatch.override_conflicts',
      'admin.schedule.view', 'admin.assignments.view', 'admin.assignments.manage',
      'admin.projects.view', 'admin.directory.view', 'admin.reports.view',
      'admin.messages.view', 'admin.messages.group_chat',
    ],
  },
  payroll_admin: {
    portal: 'admin',
    label: 'Payroll Admin',
    description: 'Weekly-log review, reimbursements, invoicing and payroll processing.',
    permissions: [
      'admin.dashboard.view', 'admin.assignments.view', 'admin.directory.view',
      'admin.logs.view', 'admin.logs.approve', 'admin.logs.return', 'admin.logs.reopen',
      'admin.financials.view', 'admin.financials.view_profit', 'admin.financials.create_invoice',
      'admin.financials.edit_invoice', 'admin.financials.void_invoice', 'admin.financials.approve_reimbursements',
      'admin.financials.process_payroll', 'admin.financials.export', 'admin.financials.approve_pay_changes',
      'admin.reports.view', 'admin.reports.generate',
    ],
  },
  project_manager: {
    portal: 'admin',
    label: 'Project Manager',
    description: 'Project lifecycle — creation, phases, tasks and closeout oversight.',
    permissions: [
      'admin.dashboard.view', 'admin.requests.view', 'admin.assignments.view', 'admin.schedule.view',
      'admin.projects.view', 'admin.projects.manage', 'admin.projects.create', 'admin.projects.edit',
      'admin.projects.archive', 'admin.projects.create_phase', 'admin.projects.create_task',
      'admin.projects.assign_task', 'admin.projects.complete_task', 'admin.projects.reopen_task', 'admin.projects.close',
      'admin.directory.view', 'admin.reports.view', 'admin.reports.generate',
    ],
  },
  sales: {
    portal: 'admin',
    label: 'Sales',
    description: 'CRM — leads, opportunities, quotes and lead import.',
    permissions: [
      'admin.dashboard.view', 'admin.crm.view', 'admin.crm.view_leads', 'admin.crm.manage_leads',
      'admin.crm.create_lead', 'admin.crm.create_opportunity', 'admin.crm.create_quote',
      'admin.crm.edit_quote', 'admin.crm.send_quote', 'admin.crm.mark_won', 'admin.crm.mark_lost',
      'admin.crm.import_leads',
      'admin.projects.view', 'admin.clients.view', 'admin.directory.view',
      'admin.reports.view', 'admin.reports.generate',
    ],
  },
  field_technician: {
    portal: 'tech',
    label: 'Field Technician',
    description: 'Field work — assignments, trips, check-in/out, weekly logs and earnings.',
    permissions: FIELD_TECH_PERMISSIONS,
  },
  project_lead: {
    portal: 'tech',
    label: 'Project Lead',
    description: 'On-site lead — all Field Technician abilities plus project task coordination.',
    permissions: [
      ...FIELD_TECH_PERMISSIONS,
      'tech.projects.create_task', 'tech.projects.assign_task',
    ],
  },
  client: {
    portal: 'client',
    label: 'Client User',
    description: 'Client Portal — tickets, service requests, projects, quotes and invoices.',
    permissions: [
      'client.dashboard.view', 'client.tickets.view', 'client.tickets.create', 'client.projects.view',
      'client.sites.view', 'client.quotes.view', 'client.financials.view',
      'client.messages.view', 'client.messages.send', 'client.profile.view', 'client.profile.edit',
    ],
  },
};

// Preset permission set per subrole, derived from SUBROLE_DEFINITIONS.
const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = Object.fromEntries(
  (Object.keys(SUBROLE_DEFINITIONS) as AppRole[]).map(r => [r, SUBROLE_DEFINITIONS[r].permissions])
) as Record<AppRole, Permission[]>;

export const APP_ROLES: AppRole[] = Object.keys(SUBROLE_DEFINITIONS) as AppRole[];

// Subroles grouped by the portal they unlock — for building the directory UI.
export const SUBROLES_BY_PORTAL: Record<SubrolePortal, AppRole[]> = {
  admin: APP_ROLES.filter(r => SUBROLE_DEFINITIONS[r].portal === 'admin'),
  tech: APP_ROLES.filter(r => SUBROLE_DEFINITIONS[r].portal === 'tech'),
  client: APP_ROLES.filter(r => SUBROLE_DEFINITIONS[r].portal === 'client'),
};

// Map a legacy free-text `role` value (e.g. "Technician", "Dispatcher") to a
// valid subrole. Returns null when the value maps to nothing (including the
// removed safety_officer / training_coordinator) — never write unmapped
// strings into the typed `roles` array.
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
  if (r.includes('manager')) return 'project_manager';
  // Catch-all so pre-subrole admin accounts are never locked out by an
  // unrecognised free-text title (e.g. "Administrator", "Owner", "Operator").
  if (r.includes('admin') || r.includes('owner') || r.includes('operator')) return 'super_admin';
  // safety_officer / training_coordinator and any unknown value → unmapped.
  return null;
}

// Backward-compat: a pre-subrole account whose ONLY role was the removed
// safety_officer / training_coordinator (both admin-portal roles). Detected
// from the raw stored value so these users keep admin-portal access and their
// old view-level permissions instead of being bounced to pending-approval.
function hasLegacyRemovedAdminRole(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const raw = (user.roles || []) as string[];
  const legacy = (user.role || '').toLowerCase();
  return raw.includes('safety_officer') || raw.includes('training_coordinator')
      || legacy.includes('safety') || legacy.includes('training');
}

// The permissions the removed safety_officer / training_coordinator roles used
// to grant — preserved only as a legacy fallback so existing users of those
// roles keep working until an admin reassigns them a real subrole.
const LEGACY_REMOVED_ADMIN_PERMISSIONS: Permission[] = [
  'admin.dashboard.view', 'admin.assignments.view', 'admin.projects.view',
  'admin.directory.view', 'admin.directory.upload_documents', 'admin.directory.approve_documents',
  'admin.reports.view', 'admin.reports.generate',
];

// The effective subroles for a user: the typed `roles` array (filtered to
// valid subroles) unioned with any legacy free-text `role`. This is the single
// derivation every portal/permission check builds on.
export function getSubroles(user: RoleLike | null | undefined): AppRole[] {
  if (!user) return [];
  const fromArray = (user.roles || []).filter(r => (APP_ROLES as string[]).includes(r));
  const fromLegacy = normalizeLegacyRole(user.role);
  const all = fromLegacy ? [...fromArray, fromLegacy] : fromArray;
  return Array.from(new Set(all));
}

// Which selected subroles supply a given permission (for "Included by …" in the
// permission editor). Ignores individual overrides — presets only.
export function permissionSources(subroles: AppRole[], permission: Permission): AppRole[] {
  return subroles.filter(r => ROLE_PERMISSIONS[r]?.includes(permission));
}

// Minimal shape the role/permission checks below actually need. Accepting
// this instead of the full Technician type lets callers pass Partial<Technician>
// form-state objects (e.g. an in-progress "add personnel" form) without a cast.
export type RoleLike = {
  roles?: AppRole[];
  role?: string;
  permissionOverrides?: Record<string, boolean>;
};

// Effective permission check. Precedence:
//   1. Individual restriction (permissionOverrides[perm] === false) → deny
//   2. Individual addition   (permissionOverrides[perm] === true)  → allow
//   3. Selected subrole presets                                    → allow
//   4. Deny by default
// Note: an individual addition grants the action only — it never grants portal
// access. Portal access comes solely from subroles (getPortalAccess).
export function hasPermission(user: RoleLike | null | undefined, permission: Permission): boolean {
  if (!user) return false;

  if (user.permissionOverrides) {
    if (user.permissionOverrides[permission] === false) return false;
    if (user.permissionOverrides[permission] === true) return true;
  }

  if (getSubroles(user).some(role => ROLE_PERMISSIONS[role]?.includes(permission))) return true;

  // Legacy fallback: keep removed-role (safety/training) accounts working.
  if (hasLegacyRemovedAdminRole(user) && LEGACY_REMOVED_ADMIN_PERMISSIONS.includes(permission)) return true;

  return false;
}

// Portal-access predicate: does the user hold any subrole that unlocks `portal`?
// The single authority for portal access — individual permission overrides and
// the legacy portalAccess field are deliberately NOT consulted.
export function hasPortalSubrole(user: RoleLike | null | undefined, portal: SubrolePortal): boolean {
  return getSubroles(user).some(role => SUBROLE_DEFINITIONS[role]?.portal === portal);
}

// The 4 admin-portal management subroles. Kept for firestore.rules/storage.rules
// parity (their isAdmin() recognises exactly these). Sales unlocks the admin
// portal but is not a blanket admin, so it is excluded here on purpose.
export function isAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  const adminRoles: AppRole[] = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
  return getSubroles(user).some(role => adminRoles.includes(role));
}

export function isSales(user: RoleLike | null | undefined): boolean {
  return getSubroles(user).includes('sales');
}

export function isSuperAdmin(user: RoleLike | null | undefined): boolean {
  return getSubroles(user).includes('super_admin');
}

export function isDispatchAdmin(user: RoleLike | null | undefined): boolean {
  return getSubroles(user).includes('dispatch_admin');
}

export function isPayAdmin(user: RoleLike | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, 'admin.financials.approve_pay_changes');
}

export function isTech(user: RoleLike | null | undefined): boolean {
  return hasPortalSubrole(user, 'tech');
}

export function isClient(user: RoleLike | null | undefined): boolean {
  return hasPortalSubrole(user, 'client');
}

// Effective portal access — the single documented rule:
//   admin  = user holds any Admin  subrole
//   tech   = user holds any Tech   subrole
//   client = user holds any Client subrole
// Portal access comes ONLY from subroles. The legacy portalAccess field and
// individual permission overrides are intentionally ignored, so a stray
// permission (e.g. a client.* override) can never grant a portal the user has
// no subrole for. This is the same value written to the login `aaromach_portals`
// cookie (middleware) and consumed by the client route guard (canAccessPath),
// so edge and client agree on one effective result.
export function getPortalAccess(user: Technician | null | undefined): { admin: boolean; tech: boolean; client: boolean } {
  if (!user) return { admin: false, tech: false, client: false };
  // Subroles are the authority. The legacy `portalAccess.{portal} === true`
  // grant and the removed admin roles are honoured ONLY additively, purely so
  // pre-subrole accounts are never locked out (migration safety net). They can
  // never DENY access, and the permission-derived portal grant that caused the
  // stray-access bug is intentionally not consulted.
  const legacy = user.portalAccess || {};
  const legacyAdmin = legacy.admin === true || hasLegacyRemovedAdminRole(user);
  return {
    admin: hasPortalSubrole(user, 'admin') || legacyAdmin,
    tech: hasPortalSubrole(user, 'tech') || legacy.tech === true,
    client: hasPortalSubrole(user, 'client') || legacy.client === true,
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
