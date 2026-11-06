import { NextRequest, NextResponse } from 'next/server';
import { qboAdmin } from '@/lib/server/qbo-auth';
import { disconnect } from '@/lib/server/quickbooks';

export async function POST(req: NextRequest) {
  if (!(await qboAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await disconnect();
  return NextResponse.json({ ok: true });
}
