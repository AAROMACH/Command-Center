import { auth } from './firebase';

type Entity = { id: string; type: 'assignment' | 'project' | 'request' | 'lead' | 'weeklyLog' | 'user' };
/** Which portal's bell shows the alert — see /api/notify. */
export type NotifyPortal = 'admin' | 'tech' | 'client' | 'sales';
type Options = {
  /** Routine activity: in-app only, never email/SMS. */
  inAppOnly?: boolean;
  /** Direct alerts only. Defaults to a guess from the recipient's roles. */
  portal?: NotifyPortal;
};

/**
 * Notifications go through /api/notify, which resolves recipients, checks
 * preferences, delivers email/SMS and writes the in-app records with the
 * Admin SDK. Doing that here in the browser failed for techs: the rules don't
 * let them read other users (to find admins or their addresses) or write
 * notification ids through every path, so their alerts silently vanished.
 *
 * Nobody is notified about their own action — the server drops the caller
 * from every recipient list.
 */
async function post(payload: { userId?: string; audience?: 'admins' | 'payroll_admins' | 'project_managers'; title?: string; body?: string; entity?: Entity; inAppOnly?: boolean; portal?: NotifyPortal; kind?: 'access_request' }) {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      console.warn('[notify] Not signed in — notification skipped');
      return;
    }
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('[notify] Failed:', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.error('[notify] Critical failure:', e);
  }
}

/** The fields of a job that decide who is told about a change. */
type JobLike = {
  id?: string; title?: string; location?: string;
  assignedTechnicianId?: string | null; techId?: string | null;
  scheduleDate?: string | null; scheduleTime?: string | null;
};
const jobLabel = (j: JobLike) => `${(j.id || '').toUpperCase()}${j.title ? ` (${j.title})` : ''}`;
const leadTech = (j: JobLike | null | undefined) => (j?.assignedTechnicianId || j?.techId || '') as string;

export const NotificationService = {
  /** One person. Pass `portal` when the recipient may have several portals. */
  async notify(userId: string, title: string, body: string, entity?: Entity, opts: Options = {}) {
    return post({ userId, title, body, entity, ...opts });
  },

  async broadcast(userIds: string[], title: string, body: string, entity?: Entity, opts: Options = {}) {
    return Promise.all(userIds.map(id => this.notify(id, title, body, entity, opts)));
  },

  /** Ops admins (super_admin + dispatch_admin), shown in the Admin Portal. */
  async notifyAdmins(title: string, body: string, entity?: Entity, opts: Pick<Options, 'inAppOnly'> = {}) {
    return post({ audience: 'admins', title, body, entity, ...opts });
  },

  /** Payroll-specific alerts (disputes, etc.) — reaches payroll_admin in
   *  addition to super_admin, since dispatch_admin has no payroll stake. */
  async notifyPayrollAdmins(title: string, body: string, entity?: Entity, opts: Pick<Options, 'inAppOnly'> = {}) {
    return post({ audience: 'payroll_admins', title, body, entity, ...opts });
  },

  /**
   * Project activity for every Project Manager (shown in the Tech Portal,
   * where PMs run projects). `routine` (crew changes, a document) stays
   * in-app; status changes and new projects also go out by email/SMS per
   * each PM's preferences.
   */
  async notifyProjectManagers(projectId: string, title: string, body: string, routine = true) {
    return post({ audience: 'project_managers', title, body, entity: { id: projectId, type: 'project' }, inAppOnly: routine });
  },

  /** Tells the tech payroll resolved their dispute. */
  async disputeResolved(d: { techId?: string; reason?: string; workOrderId?: string | null; weekOf?: string; weeklyLogId?: string }) {
    if (!d.techId) return;
    return this.notify(d.techId, 'Payroll dispute resolved',
      `Payroll resolved your ${String(d.reason || '').replace(/_/g, ' ')} dispute${d.workOrderId ? ` on job ${d.workOrderId.toUpperCase()}` : ''} for the week of ${d.weekOf || '—'}. Check Logs in the Tech Portal for any changes.`,
      d.weeklyLogId ? { id: d.weeklyLogId, type: 'weeklyLog' } : undefined, { portal: 'tech' });
  },

  /** A new sign-up asks the ops admins for approval (sent once per account). */
  async requestAccess() {
    return post({ kind: 'access_request' });
  },

  /**
   * After an admin edits a dispatched job: tells the new lead tech it's
   * theirs, the old one that it's off their schedule, and — if the tech is
   * unchanged — that the date or time moved. Helpers aren't covered here.
   */
  async notifyJobChange(prev: JobLike | null | undefined, next: JobLike, assignmentId?: string) {
    const before = leadTech(prev);
    const after = leadTech(next);
    const entity: Entity | undefined = assignmentId || next.id ? { id: (assignmentId || next.id)!, type: 'assignment' } : undefined;
    const when = [next.scheduleDate, next.scheduleTime].filter(Boolean).join(' at ');
    const sends: Promise<unknown>[] = [];
    if (after && after !== before) {
      sends.push(this.notify(after, 'New job assigned',
        `Job ${jobLabel(next)} was assigned to you${when ? ` for ${when}` : ''}. Confirm the schedule in the Tech Portal.`, entity, { portal: 'tech' }));
    }
    if (before && before !== after) {
      sends.push(this.notify(before, 'Job removed from your schedule',
        `Job ${jobLabel(next)} is no longer assigned to you.`, undefined, { portal: 'tech' }));
    }
    if (after && after === before && prev
        && ((prev.scheduleDate || '') !== (next.scheduleDate || '') || (prev.scheduleTime || '') !== (next.scheduleTime || ''))) {
      sends.push(this.notify(after, 'Job rescheduled',
        `Job ${jobLabel(next)} moved to ${when || 'a new time'}.`, entity, { portal: 'tech' }));
    }
    await Promise.all(sends);
  },
};
