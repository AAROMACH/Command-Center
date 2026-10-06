import { auth } from './firebase';

type Entity = { id: string; type: 'assignment' | 'project' | 'request' | 'lead' };

/**
 * Notifications go through /api/notify, which resolves recipients, checks
 * preferences, delivers email/SMS and writes the in-app records with the
 * Admin SDK. Doing that here in the browser failed for techs: the rules don't
 * let them read other users (to find admins or their addresses) or write
 * notification ids through every path, so their alerts silently vanished.
 */
async function post(payload: { userId?: string; audience?: 'admins' | 'payroll_admins'; title: string; body: string; entity?: Entity }) {
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

export const NotificationService = {
  async notify(userId: string, title: string, body: string, entity?: Entity) {
    return post({ userId, title, body, entity });
  },

  async broadcast(userIds: string[], title: string, body: string, entity?: Entity) {
    return Promise.all(userIds.map(id => this.notify(id, title, body, entity)));
  },

  async notifyAdmins(title: string, body: string, entity?: Entity) {
    return post({ audience: 'admins', title, body, entity });
  },

  /** Payroll-specific alerts (disputes, etc.) — reaches payroll_admin in
   *  addition to super_admin, since dispatch_admin has no payroll stake. */
  async notifyPayrollAdmins(title: string, body: string, entity?: Entity) {
    return post({ audience: 'payroll_admins', title, body, entity });
  },
};
