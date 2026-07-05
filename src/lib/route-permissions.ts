import type { Permission } from './permissions';

// Route-prefix → permission map for portal pages.
//
// This mirrors the sidebar navigation in src/components/app-sidebar.tsx: a
// page hidden from the nav because the user lacks its permission must also
// be unreachable by direct URL. Keep the two in sync when nav items change.
// Routes not listed here (profile, settings, detail pages outside these
// prefixes) are not gated by this map.
const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: Permission }> = [
  // Admin portal
  { prefix: '/admin/dashboard',        permission: 'admin.dashboard.view' },
  { prefix: '/admin/reports',          permission: 'admin.reports.view' },
  { prefix: '/admin/analytics',        permission: 'admin.reports.view' },
  { prefix: '/admin/company-planning', permission: 'admin.reports.view' },
  { prefix: '/admin/dispatch',         permission: 'admin.dispatch.view' },
  { prefix: '/admin/calendar',         permission: 'admin.schedule.view' },
  { prefix: '/admin/assignments',      permission: 'admin.assignments.view' },
  { prefix: '/admin/projects',         permission: 'admin.projects.view' },
  { prefix: '/admin/directory',        permission: 'admin.directory.view' },
  { prefix: '/admin/messaging',        permission: 'admin.messages.view' },
  { prefix: '/admin/crm',              permission: 'admin.crm.view' },
  { prefix: '/admin/plans',            permission: 'admin.reports.view' },
  { prefix: '/admin/sites',            permission: 'admin.clients.view' },
  { prefix: '/admin/quotes',           permission: 'admin.crm.view' },
  { prefix: '/admin/financials',       permission: 'admin.financials.view' },
  { prefix: '/admin/assets',           permission: 'admin.assignments.view' },
  // Tech portal
  { prefix: '/tech/dashboard',   permission: 'tech.dashboard.view' },
  { prefix: '/tech/activity',    permission: 'tech.dashboard.view' },
  { prefix: '/tech/calendar',    permission: 'tech.schedule.view' },
  { prefix: '/tech/assignments', permission: 'tech.assignments.view' },
  { prefix: '/tech/projects',    permission: 'tech.projects.view' },
  { prefix: '/tech/logs',        permission: 'tech.logs.view' },
  { prefix: '/tech/messaging',   permission: 'tech.messages.view' },
  { prefix: '/tech/earnings',    permission: 'tech.earnings.view' },
  // Client portal
  { prefix: '/client/dashboard',  permission: 'client.dashboard.view' },
  { prefix: '/client/tickets',    permission: 'client.tickets.view' },
  { prefix: '/client/sites',      permission: 'client.sites.view' },
  { prefix: '/client/quotes',     permission: 'client.quotes.view' },
  { prefix: '/client/projects',   permission: 'client.projects.view' },
  { prefix: '/client/messaging',  permission: 'client.messages.view' },
  { prefix: '/client/financials', permission: 'client.financials.view' },
];

/** Longest-prefix match: the permission required to view `pathname`, or null if unguarded. */
export function requiredPermissionForPath(pathname: string): Permission | null {
  let best: { prefix: string; permission: Permission } | null = null;
  for (const entry of ROUTE_PERMISSIONS) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? best.permission : null;
}
