/**
 * Notification events people choose channels for (Settings → Notifications).
 * Alerts are sorted by their title in deliverNotification (eventForTitle), so
 * the ~50 places that send alerts don't each name an event — add a rule below
 * for a new kind. Anything matching no rule is 'other' and lands in the bell
 * only, so a new kind of alert never buzzes phones until it has a group.
 */

export type NotificationEvent =
  | 'messages'
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
  { id: 'messages', group: 'work', label: 'Messages', desc: 'Someone messages you directly, or posts in a project chat you’re on.', roles: [...TECH, ...SUPER, 'dispatch_admin', 'payroll_admin', 'sales', 'client'] },
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

/**
 * The specific alerts inside each row, which people can uncheck one by one
 * (Settings → a row's "Choose alerts"). First match wins across the whole
 * list — more specific rules first.
 */
export const ALERT_TYPES: { id: string; event: NotificationEvent; label: string; re: RegExp }[] = [
  { id: 'msg_direct', event: 'messages', label: 'Direct messages', re: /^new message from/ },
  { id: 'msg_project', event: 'messages', label: 'Project chat messages', re: /^new message/ },
  { id: 'pay_log', event: 'my_pay', label: 'Weekly log approved, returned or reopened', re: /weekly log (approved|rejected|returned|reopened)|payroll decided/ },
  { id: 'pay_dispute', event: 'my_pay', label: 'Dispute decisions', re: /dispute resolved/ },
  { id: 'pay_reimb', event: 'my_pay', label: 'Reimbursement decisions', re: /reimbursement (approved|rejected)/ },
  { id: 'pay_timeoff', event: 'my_pay', label: 'Time-off answers', re: /time off (approved|not approved)/ },
  { id: 'pr_submitted', event: 'payroll_review', label: 'Weekly logs submitted', re: /weekly log submitted/ },
  { id: 'pr_dispute', event: 'payroll_review', label: 'Disputes filed', re: /disputed|dispute filed/ },
  { id: 'pr_missing', event: 'payroll_review', label: 'Missing-job reports', re: /missing job/ },
  { id: 'pr_reimb', event: 'payroll_review', label: 'Reimbursement requests', re: /reimbursement requested|mileage reimbursement/ },
  { id: 'pr_reopen', event: 'payroll_review', label: 'Reopen requests', re: /reopen requested/ },
  { id: 'ja_new', event: 'job_assignments', label: 'New jobs assigned to you', re: /new job assigned|assignment staged/ },
  { id: 'ja_removed', event: 'job_assignments', label: 'Jobs taken off your schedule', re: /job removed/ },
  { id: 'ja_resched', event: 'job_assignments', label: 'Jobs rescheduled', re: /job rescheduled/ },
  { id: 'act_done', event: 'job_activity', label: 'Jobs completed in the field', re: /job completed/ },
  { id: 'act_helper', event: 'job_activity', label: 'Helpers finishing their part', re: /helper finished|your part is complete/ },
  { id: 'proj_crew', event: 'projects', label: 'Crew changes', re: /crew/ },
  { id: 'proj_task', event: 'projects', label: 'Tasks', re: /task/ },
  { id: 'proj_doc', event: 'projects', label: 'Documents', re: /document/ },
  { id: 'proj_other', event: 'projects', label: 'Check-ins and project status', re: /project/ },
  { id: 'req_signup', event: 'requests', label: 'Account sign-ups', re: /access request|sign-?up/ },
  { id: 'req_other', event: 'requests', label: 'Client, site, service and time-off requests', re: /request/ },
  { id: 'sales_deal', event: 'sales', label: 'Deals won or lost', re: /deal/ },
  { id: 'sales_quote', event: 'sales', label: 'Quotes approved or rejected', re: /quote/ },
  { id: 'sales_digest', event: 'sales', label: 'Daily CRM digest', re: /digest/ },
  { id: 'sales_lead', event: 'sales', label: 'Leads and sold projects', re: /lead|crm|sold project/ },
];

/** The specific alert a title belongs to, if any. */
export function alertTypeForTitle(title: string) {
  const t = title.toLowerCase();
  return ALERT_TYPES.find(a => a.re.test(t));
}

export function eventForTitle(title: string): NotificationEvent {
  return alertTypeForTitle(title)?.event ?? 'other';
}

/** The rows to show someone, from their roles. */
export function eventsForRoles(roles: string[]): typeof NOTIFICATION_EVENTS {
  return NOTIFICATION_EVENTS.filter(e => e.roles.some(r => roles.includes(r)));
}
