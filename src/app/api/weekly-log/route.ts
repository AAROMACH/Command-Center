import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { hasPermission, isAdmin, isTech, type RoleLike } from '@/lib/permissions';
import type { WeeklyLogItem } from '@/lib/types';
import {
  WeeklyLogError, addMissingReport, addReimbursement, confirmItem, createDraft, deleteReimbursement,
  disputeItem, fileJob, jobsOnOwnLogs, moveItem, removeJobFromDrafts, requestUnsubmit, submitLog, unsubmitLog,
  type CarriedFigures,
} from '@/lib/server/weekly-log-server';

/**
 * The only way a technician changes a weekly log (see
 * lib/server/weekly-log-server.ts for why). Admins use it for job filing too,
 * so filing has one implementation; their other payroll edits stay direct
 * Firestore writes, which the rules allow for admins.
 *
 * Body: { action, ...args }. Techs act only on their own logs/jobs; admins may
 * pass `techId` to file/remove a job for someone else.
 */

const TECH_FILED_VIA = new Set(['completion', 'auto_sync']);
const ADMIN_FILED_VIA = new Set(['completion', 'auto_sync', 'admin_backfill', 'admin_force_complete', 'admin_status_edit', 'tech_swap']);

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const callerSnap = await getFirestore(adminApp).collection('users').doc(uid).get();
  const caller = (callerSnap.data() || {}) as RoleLike & { accountStatus?: string; approvalStatus?: string; name?: string; preferredName?: string };
  const active = callerSnap.exists && caller.accountStatus !== 'inactive' && caller.approvalStatus !== 'pending' && caller.approvalStatus !== 'denied';
  const admin = active && isAdmin(caller);
  const tech = active && isTech(caller);
  if (!admin && !tech) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const callerName = caller.preferredName || caller.name || uid;

  // Whose log this touches: always yourself, unless you're an admin.
  const target = (typeof body.techId === 'string' && body.techId) || uid;
  if (target !== uid && !admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    switch (body.action) {
      case 'createDraft':
        return NextResponse.json({ result: await createDraft(target, String(body.weekOf || '')) });

      case 'fileJob': {
        const filedVia = String(body.filedVia || 'completion') as WeeklyLogItem['filedVia'] & string;
        if (!(admin ? ADMIN_FILED_VIA : TECH_FILED_VIA).has(filedVia)) {
          return NextResponse.json({ error: 'Invalid filedVia' }, { status: 400 });
        }
        const placement = body.placement === 'scheduled' || body.placement === 'reporting' ? body.placement : undefined;
        // asLead / carried payroll figures are admin-only (tech swap).
        const carry: CarriedFigures | undefined = admin && body.carry && typeof body.carry === 'object' ? {
          jobPay: typeof body.carry.jobPay === 'number' ? body.carry.jobPay : undefined,
          payoutAmount: typeof body.carry.payoutAmount === 'number' ? body.carry.payoutAmount : undefined,
          payNotes: typeof body.carry.payNotes === 'string' ? body.carry.payNotes : undefined,
          outcomeCode: body.carry.outcomeCode ?? undefined,
          workDate: typeof body.carry.workDate === 'string' ? body.carry.workDate : undefined,
        } : undefined;
        const result = await fileJob({
          techId: target, jobId: String(body.jobId || ''), filedVia, placement,
          asLead: admin && body.asLead === true, carry, requireCompleted: !admin,
        });
        return NextResponse.json({ result });
      }

      case 'removeJob':
        return NextResponse.json({ result: await removeJobFromDrafts(target, String(body.jobId || '')) });

      // ── Log edits: always the caller's own log ──
      case 'confirmItem':
        await confirmItem(uid, String(body.logId), String(body.itemId));
        return NextResponse.json({ ok: true });

      case 'disputeItem':
        await disputeItem(uid, String(body.logId), String(body.itemId), body.reason, body.notes);
        return NextResponse.json({ ok: true });

      case 'addReimbursement':
        return NextResponse.json({ result: await addReimbursement(uid, String(body.logId), {
          itemId: body.itemId, amount: body.amount, description: body.description, note: body.note, receiptUrl: body.receiptUrl,
        }) });

      case 'deleteReimbursement':
        await deleteReimbursement(uid, String(body.logId), String(body.reimbId));
        return NextResponse.json({ ok: true });

      case 'addMissingReport':
        return NextResponse.json({ result: await addMissingReport(uid, String(body.logId), body.report || {}) });

      case 'submit':
        return NextResponse.json({ result: await submitLog(uid, String(body.logId), callerName) });

      case 'moveItem':
        if (!hasPermission(caller, 'tech.logs.move_assignment')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json({ result: await moveItem(uid, String(body.fromLogId), String(body.toLogId), String(body.itemId), uid) });

      case 'unsubmit':
        if (!hasPermission(caller, 'tech.logs.unsubmit_own')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        await unsubmitLog(uid, String(body.logId), { id: uid, name: callerName });
        return NextResponse.json({ ok: true });

      case 'logJobs':
        return NextResponse.json({ result: await jobsOnOwnLogs(target) });

      case 'requestUnsubmit':
        await requestUnsubmit(uid, String(body.logId), body.reason);
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof WeeklyLogError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[weekly-log]', body.action, e);
    return NextResponse.json({ error: 'Weekly log update failed.' }, { status: 500 });
  }
}
