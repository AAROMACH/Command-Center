import { auth } from './firebase';

/**
 * Calls /api/weekly-log — the only path by which a technician changes a
 * weekly log (the server stamps pay from the job records and keeps
 * reimbursements pending; see lib/server/weekly-log-server.ts). Throws with
 * the server's message so callers can toast it.
 */
export async function weeklyLogAction<T = unknown>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('You are signed out. Sign in again and retry.');
  const res = await fetch('/api/weekly-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action, ...args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Weekly log update failed (${res.status}).`);
  return (data.result ?? data) as T;
}
