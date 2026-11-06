import { NextRequest, NextResponse } from 'next/server';
import { finishConnect } from '@/lib/server/quickbooks';

/** Intuit sends the admin back here after they approve (or cancel). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const base = new URL(process.env.QBO_REDIRECT_URI || 'https://app.aaromach.com/api/quickbooks/callback').origin;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${base}/admin/settings?${new URLSearchParams(q)}#quickbooks`);
  if (p.get('error')) return back({ qbo: 'error', msg: p.get('error') === 'access_denied' ? 'Connection was cancelled.' : String(p.get('error')) });
  const code = p.get('code'), state = p.get('state'), realmId = p.get('realmId');
  if (!code || !state || !realmId) return back({ qbo: 'error', msg: 'QuickBooks didn’t send back what we need — try again.' });
  try { await finishConnect({ code, state, realmId }); return back({ qbo: 'connected' }); }
  catch (e: any) { return back({ qbo: 'error', msg: String(e.message || e).slice(0, 200) }); }
}
