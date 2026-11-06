import { NextRequest, NextResponse } from 'next/server';
import { qboAdmin } from '@/lib/server/qbo-auth';
import { startConnect } from '@/lib/server/quickbooks';

/** POST → { url }: Intuit's sign-in page; the browser goes there next. */
export async function POST(req: NextRequest) {
  const who = await qboAdmin(req);
  if (!who) return NextResponse.json({ error: 'Only Super or Payroll Admins can connect QuickBooks.' }, { status: 403 });
  try { return NextResponse.json({ url: await startConnect(who.uid, who.name) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
