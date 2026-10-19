/**
 * Notification events people can switch off individually (Settings →
 * Notifications). A switched-off event still lands in the bell, but never
 * emails, texts or buzzes the phone. Alerts are sorted by their title in
 * deliverNotification (eventForTitle), so the ~50 places that send alerts
 * don't each need to name an event — add a rule below for a new kind.
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

type Audience = 'tech' | 'admin' | 'client' | 'sales';

export const NOTIFICATION_EVENTS: { id: NotificationEvent; label: string; desc: string; audience: Audience[] }[] = [
  { id: 'job_assignments', label: 'My job assignments', desc: 'A job assigned to you, taken off your schedule or rescheduled.', audience: ['tech'] },
  { id: 'my_pay', label: 'My pay & time off', desc: 'Your weekly log approved or returned, dispute answers, reimbursements and time-off decisions.', audience: ['tech'] },
  { id: 'projects', label: 'Projects', desc: 'Crew changes, tasks, documents, check-ins and project status.', audience: ['tech', 'admin', 'client'] },
  { id: 'job_activity', label: 'Job activity', desc: 'Jobs completed and helpers finishing their part.', audience: ['admin'] },
  { id: 'payroll_review', label: 'Payroll to review', desc: 'Weekly logs submitted, disputes, missing-job reports and reimbursement requests.', audience: ['admin'] },
  { id: 'requests', label: 'New requests', desc: 'Client, site and service requests, new sign-ups and time-off requests.', audience: ['admin', 'client'] },
  { id: 'sales', label: 'Sales', desc: 'Deals won or lost, quotes approved or rejected, and the daily CRM digest.', audience: ['sales', 'admin'] },
  { id: 'other', label: 'Everything else', desc: 'Messages and alerts that don’t fit the groups above.', audience: ['tech', 'admin', 'client', 'sales'] },
];

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

/** The events to show someone, from their roles. */
export function eventsForRoles(roles: string[]): typeof NOTIFICATION_EVENTS {
  const has = (r: string[]) => roles.some(x => r.includes(x));
  const aud = new Set<Audience>();
  if (has(['field_technician', 'project_lead', 'project_manager'])) aud.add('tech');
  if (has(['admin', 'super_admin', 'dispatch_admin', 'payroll_admin'])) aud.add('admin');
  if (has(['client'])) aud.add('client');
  if (has(['sales'])) aud.add('sales');
  return NOTIFICATION_EVENTS.filter(e => e.audience.some(a => aud.has(a)));
}
