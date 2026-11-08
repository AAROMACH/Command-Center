import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { sendDueFollowUps } from '@/lib/server/request-emails';
import { ADMIN_ROLES } from '@/lib/permissions';

/**
 * Sends "we haven't forgotten you" emails for form requests still pending
 * review after 2 business days. Two ways in:
 *  - a scheduler: Authorization: Bearer $CRM_DIGEST_SECRET (runs every time)
 *  - any signed-in admin opening the dashboard (runs at most once an hour)
 * so it works with or without a scheduler set up.
 */
const HOUR = 60 * 60_000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer /, '');
  const fs = getFirestore(adminApp);
  const secret = process.env.CRM_DIGEST_SECRET;
  const fromScheduler = !!secret && token === secret;
  if (!fromScheduler) {
    try {
      const uid = (await getAuth(adminApp).verifyIdToken(token)).uid;
      const u = (await fs.doc(`users/${uid}`).get()).data() || {};
      const roles = [...(Array.isArray(u.roles) ? u.roles : []), u.role].filter(Boolean).map(String);
      if (!roles.some(r => r === 'admin' || (ADMIN_ROLES as string[]).includes(r))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const ref = fs.doc('systemConfig/requestFollowUps');
    const ran = await fs.runTransaction(async tx => {
      const last = (await tx.get(ref)).data()?.lastRunAt as string | undefined;
      if (last && Date.now() - new Date(last).getTime() < HOUR) return false;
      tx.set(ref, { lastRunAt: new Date().toISOString() }, { merge: true });
      return true;
    });
    if (!ran) return NextResponse.json({ skipped: 'ran in the last hour' });
  }
  return NextResponse.json(await sendDueFollowUps(fs));
}
