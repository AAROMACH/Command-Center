import { NextRequest, NextResponse } from 'next/server';
import { qboAdmin } from '@/lib/server/qbo-auth';
import { getConnection } from '@/lib/server/quickbooks';
import { previewSync, runSync } from '@/lib/server/qbo-sync';

/** GET → what a sync would do (nothing written). POST → run it. Super / Payroll Admins. */
export async function GET(req: NextRequest) {
  if (!(await qboAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await getConnection())) return NextResponse.json({ error: 'QuickBooks isn’t connected.' }, { status: 409 });
  return NextResponse.json(await previewSync());
}

export async function POST(req: NextRequest) {
  const who = await qboAdmin(req);
  if (!who) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await getConnection())) return NextResponse.json({ error: 'QuickBooks isn’t connected.' }, { status: 409 });
  try { return NextResponse.json(await runSync(who.name)); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 502 }); }
}
