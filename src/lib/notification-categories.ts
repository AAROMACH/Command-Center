import {
  Bell, ClipboardList, FolderKanban, Inbox, MessageSquare, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react';
import { eventForTitle, type NotificationEvent } from './notification-events';

/**
 * The kinds of notification someone sorts and filters the bell by — "show me
 * the pay alerts", "show me the job alerts".
 *
 * Built on eventForTitle (lib/notification-events), which already sorts every
 * alert by its title, so nothing is stored per record and old notifications
 * categorise the same way as new ones. The nine events are coarser here on
 * purpose: dispatch activity, job activity and job assignments are all "jobs"
 * to the person reading them, and both pay events are "pay".
 */
export type NotificationCategory = 'jobs' | 'pay' | 'messages' | 'projects' | 'requests' | 'sales' | 'other';

export type CategoryStyle = {
  id: NotificationCategory;
  label: string;
  Icon: LucideIcon;
  /** Icon tile — theme tokens only, so both themes and lint:ui stay happy. */
  tile: string;
  /** Filter chip when this category is on. */
  chip: string;
  /** The small colour dot in the filter list. */
  dot: string;
  /** A label in this kind's colour (History → App activity's event labels). */
  text: string;
  /** Left edge of a timeline row. */
  borderL: string;
};

export const CATEGORIES: CategoryStyle[] = [
  { id: 'jobs', label: 'Jobs', Icon: ClipboardList, tile: 'bg-brand-blue/10 text-brand-blue border-brand-blue/30', chip: 'bg-brand-blue/10 text-brand-blue border-brand-blue/40', dot: 'bg-brand-blue', text: 'text-brand-blue', borderL: 'border-l-brand-blue' },
  { id: 'pay', label: 'Pay & billing', Icon: Wallet, tile: 'bg-text-green/10 text-text-green border-text-green/30', chip: 'bg-text-green/10 text-text-green border-text-green/40', dot: 'bg-text-green', text: 'text-text-green', borderL: 'border-l-text-green' },
  { id: 'messages', label: 'Messages', Icon: MessageSquare, tile: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30', chip: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/40', dot: 'bg-brand-cyan', text: 'text-brand-cyan', borderL: 'border-l-brand-cyan' },
  { id: 'projects', label: 'Projects', Icon: FolderKanban, tile: 'bg-brand-purple/10 text-brand-purple border-brand-purple/30', chip: 'bg-brand-purple/10 text-brand-purple border-brand-purple/40', dot: 'bg-brand-purple', text: 'text-brand-purple', borderL: 'border-l-brand-purple' },
  { id: 'requests', label: 'Requests', Icon: Inbox, tile: 'bg-accent-gold/10 text-accent-gold border-accent-gold/30', chip: 'bg-accent-gold/10 text-accent-gold border-accent-gold/40', dot: 'bg-accent-gold', text: 'text-accent-gold', borderL: 'border-l-accent-gold' },
  { id: 'sales', label: 'Sales', Icon: TrendingUp, tile: 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/30', chip: 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/40', dot: 'bg-brand-emerald', text: 'text-brand-emerald', borderL: 'border-l-brand-emerald' },
  { id: 'other', label: 'Other', Icon: Bell, tile: 'bg-bg-secondary text-text-secondary border-border-sub', chip: 'bg-bg-secondary text-text-secondary border-border-main', dot: 'bg-text-muted', text: 'text-text-secondary', borderL: 'border-l-border-main' },
];

/**
 * History → App activity's event types, in the same seven kinds as the bell.
 *
 * Both surfaces now take their colour and icon from CATEGORIES, so blue means
 * jobs and green means money wherever you are. App activity's finer types
 * stay as its filter and its per-row badge — the colour carries the kind, not
 * the outcome, which is why a completed job is no longer green (that used to
 * collide with green-for-money, and the label already says "Job Completed").
 */
export const ACTIVITY_CATEGORY: Record<string, NotificationCategory> = {
  assignment: 'jobs',
  work_order: 'jobs',
  dispatch: 'jobs',
  log: 'pay',
  payroll: 'pay',
  payroll_paid: 'pay',
  invoice: 'pay',
  site_request: 'requests',
  request: 'requests',
  project: 'projects',
  message: 'messages',
  sales: 'sales',
};

/** The kind one of App activity's event types belongs to. */
export function categoryForActivity(type: string): NotificationCategory {
  return ACTIVITY_CATEGORY[String(type || '')] ?? 'other';
}

const BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));

const EVENT_CATEGORY: Record<NotificationEvent, NotificationCategory> = {
  job_assignments: 'jobs',
  job_activity: 'jobs',
  dispatch_activity: 'jobs',
  my_pay: 'pay',
  payroll_review: 'pay',
  messages: 'messages',
  projects: 'projects',
  requests: 'requests',
  sales: 'sales',
  other: 'other',
};

/**
 * Kinds that ALERT_TYPES has no rule for, so eventForTitle calls them 'other'.
 *
 * Invoices, payments and deposits are the ones that matter: "show me the
 * money alerts" has to include them, and without this they all land in Other.
 * Deliberately done here and not in ALERT_TYPES, because an unmatched title
 * stays bell-only by design (see lib/notification-events) — adding rules there
 * would start sending these to people's phones, which is a separate decision.
 */
const EXTRA: { re: RegExp; category: NotificationCategory }[] = [
  { re: /invoice|payment|deposit|paid|overdue|receipt|billing/, category: 'pay' },
];

/** The category an alert belongs to, from its title. */
export function categoryForTitle(title: string): NotificationCategory {
  const t = String(title || '');
  const event = eventForTitle(t);
  if (event !== 'other') return EVENT_CATEGORY[event];
  return EXTRA.find(e => e.re.test(t.toLowerCase()))?.category ?? 'other';
}

export function categoryStyle(id: NotificationCategory): CategoryStyle {
  return BY_ID.get(id) || BY_ID.get('other')!;
}

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'unread', label: 'Unread first', recentOnly: true },
  { id: 'category', label: 'Group by kind' },
] as const;

export type NotificationSort = (typeof SORT_OPTIONS)[number]['id'];

const ms = (ts: string) => {
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Sort a list of alerts. Every option falls back to newest-first inside
 * itself, so "Group by kind" still reads newest-first within each kind and
 * the order never looks arbitrary.
 */
export function sortNotifications<T extends { timestamp: string; read?: boolean; category: NotificationCategory }>(
  list: T[],
  sort: NotificationSort,
): T[] {
  const order = CATEGORIES.map(c => c.id);
  const newest = (a: T, b: T) => ms(b.timestamp) - ms(a.timestamp);
  const copy = [...list];
  switch (sort) {
    case 'oldest': return copy.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
    case 'unread': return copy.sort((a, b) => Number(!!a.read) - Number(!!b.read) || newest(a, b));
    case 'category': return copy.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || newest(a, b));
    default: return copy.sort(newest);
  }
}

/** How many alerts sit in each category, for the filter list's counts. */
export function countByCategory(list: { category: NotificationCategory }[]): Record<NotificationCategory, number> {
  const out = Object.fromEntries(CATEGORIES.map(c => [c.id, 0])) as Record<NotificationCategory, number>;
  for (const n of list) out[n.category] = (out[n.category] || 0) + 1;
  return out;
}
