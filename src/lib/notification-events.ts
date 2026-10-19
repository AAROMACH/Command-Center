/**
 * Notification events people choose channels for (Settings → Notifications).
 * Alerts are sorted by their title in deliverNotification (eventForTitle), so
 * the ~50 places that send alerts don't each name an event — add a rule below
 * for a new kind. Anything matching no rule is 'other' and lands in the bell
 * only, so a new kind of alert never buzzes phones until it has a group.
 */

export type NotificationEvent =
  | 'job_assignments'
  | 'job_activity'
  | 'projects'
  | 'my_pay'
  | 'payroll_review'
  | 'requests'
  | 'sales'
  | 'other';

export type EventGroup = 'work' | 'operations' | 'sales';

const TECH = ['field_technician', 'project_lead', 'project_manager'];
const SUPER = ['super_admin', 'admin'];

/**
 * Who sees each row: the roles that actually receive that kind of alert, so
 * nobody gets a switch for something that never reaches them.
 */
export const NOTIFICATION_EVENTS: { id: NotificationEvent; label: string; desc: string; group: EventGroup; roles: string[] }[] = [
  { id: 'job_assignments', group: 'work', label: 'Job assignments', desc: 'A job is assigned to you, rescheduled or taken off your schedule.', roles: TECH },
  { id: 'my_pay', group: 'work', label: 'Pay & time off', desc: 'Your weekly log is approved or returned, dispute and reimbursement decisions, time-off answers.', roles: TECH },
  { id: 'projects', group: 'work', label: 'Projects', desc: 'Crew changes, tasks, documents, check-ins and project status.', roles: [...TECH, ...SUPER, 'dispatch_admin', 'client'] },
  { id: 'job_activity', group: 'operations', label: 'Job activity', desc: 'Jobs completed in the field and helpers finishing their part.', roles: [...SUPER, 'dispatch_admin'] },
  { id: 'requests', group: 'operations', label: 'New requests', desc: 'Client, site and service requests, account sign-ups and time-off requests.', roles: [...SUPER, 'dispatch_admin', 'client'] },
  { id: 'payroll_review', group: 'operations', label: 'Payroll review', desc: 'Weekly logs submitted, disputes, missing-job reports and reimbursement requests.', roles: [...SUPER, 'payroll_admin'] },
  { id: 'sales', group: 'sales', label: 'Sales', desc: 'Deals won or lost, quotes approved or rejected, and the daily CRM digest.', roles: [...SUPER, 'sales'] },
];

export const EVENT_GROUP_LABELS: Record<EventGroup, string> = {
  work: 'Your work',
  operations: 'Operations',
  sales: 'Sales',
};

// First match wins — more specific rules first.
const RULES: [RegExp, NotificationEvent][] = [
  [/weekly log (approved|rejected|returned|reopened)|dispute resolved|payroll decided|reimbursement (approved|rejected)|time off (approved|not approved)/, 'my_pay'],
  [/weekly log submitted|disputed|dispute filed|missing job|reimbursement requested|mileage reimbursement|reopen requested/, 'payroll_review'],
  [/new job assigned|job removed|job rescheduled|assignment staged/, 'job_assignments'],
  [/job completed|helper finished|your part is complete/, 'job_activity'],
  [/project|crew|task|document/, 'projects'],
  [/request|access request|sign-?up/, 'requests'],
  [/deal|quote|digest|lead|crm|sold project/, 'sales'],
];

export function eventForTitle(title: string): NotificationEvent {
  const t = title.toLowerCase();
  return RULES.find(([re]) => re.test(t))?.[1] ?? 'other';
}

/** The rows to show someone, from their roles. */
export function eventsForRoles(roles: string[]): typeof NOTIFICATION_EVENTS {
  return NOTIFICATION_EVENTS.filter(e => e.roles.some(r => roles.includes(r)));
}
