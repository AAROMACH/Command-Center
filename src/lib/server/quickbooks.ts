import 'server-only';
import { randomBytes } from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { recordHealth } from './integration-health';

/**
 * QuickBooks Online connection (OAuth 2.0), server only.
 *
 * Env (App Hosting): QBO_CLIENT_ID, QBO_CLIENT_SECRET (secret), QBO_ENV
 * ('sandbox' — the default — or 'production'), QBO_REDIRECT_URI (defaults to
 * https://app.aaromach.com/api/quickbooks/callback; must match the Intuit
 * app's Redirect URIs exactly).
 *
 * Tokens live in integrations/quickbooks — a collection firestore.rules has
 * no match for, so no browser can read it; only the Admin SDK here.
 */

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
// Accounting only — the app doesn't charge cards through Intuit (add com.intuit.quickbooks.payment only if Payments is approved).
export const QBO_SCOPES = 'com.intuit.quickbooks.accounting';

export const qboEnv = () => (process.env.QBO_ENV === 'production' ? 'production' : 'sandbox');
export const qboApiBase = () => (qboEnv() === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com');
// Trimmed: a pasted secret with a trailing newline makes Intuit reject the app ("undefined didn't connect").
const clientId = () => (process.env.QBO_CLIENT_ID || '').trim();
const clientSecret = () => (process.env.QBO_CLIENT_SECRET || '').trim();
const redirectUri = () => (process.env.QBO_REDIRECT_URI || '').trim() || 'https://app.aaromach.com/api/quickbooks/callback';
export const qboConfigured = () => !!(clientId() && clientSecret());

const fs = () => getFirestore(adminApp);
const connRef = () => fs().doc('integrations/quickbooks');
const stateRef = (s: string) => fs().doc(`integrations/quickbooks/oauthStates/${s}`);

export type QboConnection = {
  realmId: string; env: 'sandbox' | 'production';
  accessToken: string; refreshToken: string;
  accessExpiresAt: number; refreshExpiresAt: number;
  connectedBy: string; connectedByName: string; connectedAt: string;
  companyName?: string;
};

const basicAuth = () => `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`;

/** Start: a one-time state (10 minutes) tied to the admin, and Intuit's consent URL. */
export async function startConnect(uid: string, name: string): Promise<string> {
  if (!qboConfigured()) throw new Error('QuickBooks keys aren’t set (QBO_CLIENT_ID / QBO_CLIENT_SECRET).');
  const state = randomBytes(24).toString('hex');
  await stateRef(state).set({ uid, name, createdAt: Date.now() });
  const q = new URLSearchParams({ client_id: clientId(), response_type: 'code', scope: QBO_SCOPES, redirect_uri: redirectUri(), state });
  return `${AUTHORIZE_URL}?${q}`;
}

/**
 * Token call with retries: network errors, 429 and 5xx are retried up to 3
 * times with backoff. invalid_grant (refresh token expired/revoked) is not
 * retryable — the admin has to reconnect, and the message says so.
 */
/**
 * Every QuickBooks error, kept for troubleshooting with Intuit support:
 * integrations/quickbooks/errorLog/{id} with Intuit's intuit_tid, the HTTP
 * status, the call and the full fault. Also written to the server log.
 * Never throws.
 */
async function logQboError(e: { kind: 'api' | 'token'; path: string; status: number; tid: string | null; fault: unknown }) {
  const entry = { ...e, env: qboEnv(), at: new Date().toISOString(), fault: JSON.stringify(e.fault ?? null).slice(0, 4000) };
  console.error('[quickbooks] error', entry);
  try { await connRef().collection('errorLog').add(entry); } catch { /* logging must not break the call */ }
}

async function tokenRequest(body: Record<string, string>) {
  let last = 'QuickBooks token request failed';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    let r: Response;
    try {
      r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { Authorization: basicAuth(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
    } catch (e) { last = `QuickBooks token request failed: ${(e as Error).message}`; continue; }
    const d = await r.json().catch(() => ({})) as { error?: string; error_description?: string };
    if (r.ok) return d as unknown as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };
    await logQboError({ kind: 'token', path: body.grant_type, status: r.status, tid: r.headers.get('intuit_tid'), fault: d });
    if (d.error === 'invalid_grant') {
      throw new Error('QuickBooks access expired or was revoked — reconnect QuickBooks in Settings → Integrations.');
    }
    last = `QuickBooks token error: ${d.error_description || d.error || r.status}`;
    if (r.status !== 429 && r.status < 500) break;
  }
  throw new Error(last);
}

/** Callback: check the state, swap the code for tokens, save the connection. */
export async function finishConnect(params: { code: string; state: string; realmId: string }): Promise<void> {
  const ref = stateRef(params.state);
  const snap = await ref.get();
  await ref.delete().catch(() => {});
  const st = snap.data() as { uid: string; name: string; createdAt: number } | undefined;
  if (!st || Date.now() - st.createdAt > 10 * 60 * 1000) throw new Error('This QuickBooks sign-in expired — start again from Settings.');
  const t = await tokenRequest({ grant_type: 'authorization_code', code: params.code, redirect_uri: redirectUri() });
  const now = Date.now();
  const conn: QboConnection = {
    realmId: params.realmId, env: qboEnv(),
    accessToken: t.access_token, refreshToken: t.refresh_token,
    accessExpiresAt: now + (t.expires_in - 60) * 1000,
    refreshExpiresAt: now + t.x_refresh_token_expires_in * 1000,
    connectedBy: st.uid, connectedByName: st.name, connectedAt: new Date(now).toISOString(),
  };
  await connRef().set(conn);
  const info = await qboGet(`/companyinfo/${params.realmId}`).catch(() => null);
  const companyName = info?.CompanyInfo?.CompanyName as string | undefined;
  if (companyName) await connRef().update({ companyName });
}

export async function getConnection(): Promise<QboConnection | null> {
  const s = await connRef().get();
  return s.exists ? (s.data() as QboConnection) : null;
}

/** A valid access token, refreshing it (and the rotating refresh token) when due. */
async function accessToken(force = false): Promise<{ token: string; realmId: string }> {
  const ref = connRef();
  const c = await getConnection();
  if (!c) throw new Error('QuickBooks isn’t connected.');
  if (!force && Date.now() < c.accessExpiresAt) return { token: c.accessToken, realmId: c.realmId };
  let t: Awaited<ReturnType<typeof tokenRequest>>;
  try { t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refreshToken }); }
  catch (e) { await recordHealth('quickbooks', false, e); throw e; }
  const now = Date.now();
  await ref.update({
    accessToken: t.access_token, refreshToken: t.refresh_token,
    accessExpiresAt: now + (t.expires_in - 60) * 1000,
    refreshExpiresAt: now + t.x_refresh_token_expires_in * 1000,
  });
  return { token: t.access_token, realmId: c.realmId };
}

/** GET /v3/company/{realm}{path} — JSON. */
export async function qboGet(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const call = async (force: boolean) => {
    const { token, realmId } = await accessToken(force);
    return fetch(`${qboApiBase()}/v3/company/${realmId}${path}${sep}minorversion=75`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  };
  // A 401 means the access token was rejected early: refresh once and retry.
  let r = await call(false);
  if (r.status === 401) r = await call(true);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const tid = r.headers.get('intuit_tid');
    await logQboError({ kind: 'api', path, status: r.status, tid, fault: (d as any).Fault || d });
    const msg = `QuickBooks ${r.status}: ${JSON.stringify((d as any).Fault?.Error?.[0]?.Detail || (d as any).Fault || d).slice(0, 300)}${tid ? ` (intuit_tid ${tid})` : ''}`;
    // 401/403 = the connection itself is broken; 5xx = QuickBooks is down.
    if (r.status === 401 || r.status === 403 || r.status >= 500) await recordHealth('quickbooks', false, msg);
    throw new Error(msg);
  }
  await recordHealth('quickbooks', true);
  return d;
}

/** Disconnect: revoke at Intuit (best effort) and forget the tokens. */
export async function disconnect(): Promise<void> {
  const c = await getConnection();
  if (c) {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: c.refreshToken }),
    }).catch(() => {});
  }
  await connRef().delete();
}
