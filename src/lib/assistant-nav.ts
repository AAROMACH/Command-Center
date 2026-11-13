// Page catalog for the in-app help assistant (api/assistant + components/help-assistant).
//
// The assistant can only send someone to a page listed here, and only when
// canAccessPath() says that user may open it — the same rule the sidebar and
// middleware use. `highlights` are on-screen labels (buttons, tabs, headings)
// the assistant may point at after navigating; the browser finds them by text.
// Keep in step with app-sidebar.tsx when pages are added or renamed.

export type AssistantPage = {
  path: string;
  title: string;
  about: string;
  highlights?: string[];
};

export const ASSISTANT_PAGES: AssistantPage[] = [
  // Tech portal
  { path: '/tech/dashboard', title: 'Dashboard', about: "Today's jobs, what's next, quick actions.", highlights: ['Today'] },
  { path: '/tech/activity', title: 'Activity', about: 'Recent activity on your jobs.' },
  { path: '/tech/calendar', title: 'Schedule', about: 'Your jobs on a calendar by day/week.' },
  { path: '/tech/assignments', title: 'Assignments', about: 'All jobs assigned to you or where you are a helper. Open a job to check in/out, add notes, photos, and see the team.' },
  { path: '/tech/projects', title: 'Projects', about: 'Multi-day projects you are on, with tasks and parts.' },
  { path: '/tech/logs', title: 'Logs', about: 'Weekly work logs and job filing for payroll.' },
  { path: '/tech/site-walks', title: 'Site Walks', about: 'Site survey walk-throughs.' },
  { path: '/tech/approvals', title: 'Approvals', about: 'Items waiting on your approval.' },
  { path: '/tech/sop', title: 'SOP', about: 'Standard operating procedures and the operations manual.' },
  { path: '/tech/messaging', title: 'Messages', about: 'Direct and group messages.' },
  { path: '/tech/earnings', title: 'Earnings', about: 'Your own pay, paystubs and pay history.' },
  { path: '/tech/profile', title: 'Profile', about: 'Your contact info, emergency contact, password.' },
  { path: '/tech/settings', title: 'Settings', about: 'Notifications, theme, font size.' },
  // Admin portal
  { path: '/admin/dashboard', title: 'Admin Dashboard', about: 'Company overview.' },
  { path: '/admin/requests', title: 'Requests', about: 'Incoming client service requests.' },
  { path: '/admin/dispatch', title: 'Dispatch', about: 'Assign techs to jobs.' },
  { path: '/admin/calendar', title: 'Schedule', about: 'Company schedule.' },
  { path: '/admin/assignments', title: 'Assignments', about: 'All jobs/work orders.' },
  { path: '/admin/projects', title: 'Projects', about: 'All projects.' },
  { path: '/admin/directory', title: 'Directory', about: 'People, roles and permissions.' },
  { path: '/admin/messaging', title: 'Messages', about: 'Messages.' },
  { path: '/admin/crm', title: 'CRM', about: 'Leads and pipeline.' },
  { path: '/admin/sites', title: 'Clients', about: 'Client sites.' },
  { path: '/admin/quotes', title: 'Quotes & Invoices', about: 'Quotes and invoices.' },
  { path: '/admin/plans', title: 'Service Plans', about: 'Service plans.' },
  { path: '/admin/financials', title: 'Financials', about: 'Company financials.' },
  { path: '/admin/payroll/audit', title: 'Payroll', about: 'Payroll audit.' },
  { path: '/admin/assets', title: 'Assets & Materials', about: 'Equipment and materials.' },
  { path: '/admin/reports', title: 'History', about: 'Job history and reports.' },
  { path: '/admin/analytics', title: 'Insights', about: 'Analytics.' },
  { path: '/admin/settings', title: 'Settings', about: 'Company and app settings.' },
  // Sales portal
  { path: '/sales/my-day', title: 'My Day', about: "Today's sales tasks." },
  { path: '/sales/pipeline', title: 'Pipeline', about: 'Sales pipeline.' },
  { path: '/sales/accounts', title: 'Accounts', about: 'Customer accounts.' },
  { path: '/sales/quotes', title: 'Quotes', about: 'Quotes.' },
  // Client portal
  { path: '/client/dashboard', title: 'Dashboard', about: 'Your account overview.' },
  { path: '/client/tickets', title: 'Requests', about: 'Submit and track service requests.' },
  { path: '/client/sites', title: 'Sites', about: 'Your sites.' },
  { path: '/client/quotes', title: 'Quotes', about: 'Quotes from us.' },
  { path: '/client/projects', title: 'Projects', about: 'Your projects.' },
  { path: '/client/messaging', title: 'Messages', about: 'Message our team.' },
  { path: '/client/financials', title: 'Billing', about: 'Invoices and payments.' },
];
