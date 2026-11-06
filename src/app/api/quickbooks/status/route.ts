import { NextRequest, NextResponse } from 'next/server';
import { qboAdmin } from '@/lib/server/qbo-auth';
import { getConnection, qboConfigured, qboEnv, qboGet } from '@/lib/server/quickbooks';

/** GET → whether QuickBooks is connected (checked live), never the tokens. */
export async function GET(req: NextRequest) {
  if (!(await qboAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await getConnection();
  if (!c) return NextResponse.json({ connected: false, configured: qboConfigured(), env: qboEnv() });
  let live = true, error = '';
  let companyName = c.companyName || '';
  try { companyName = (await qboGet(`/companyinfo/${c.realmId}`))?.CompanyInfo?.CompanyName || companyName; }
  catch (e: any) { live = false; error = String(e.message || e).slice(0, 200); }
  return NextResponse.json({
    connected: true, live, error, configured: qboConfigured(), env: c.env, companyName, realmId: c.realmId,
    connectedByName: c.connectedByName, connectedAt: c.connectedAt, refreshExpiresAt: new Date(c.refreshExpiresAt).toISOString(),
  });
}
