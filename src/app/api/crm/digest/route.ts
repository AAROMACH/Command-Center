import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { deliverNotification, opsAdmins, usersById } from '@/lib/server/notify-delivery';
import { isOpen, isStale, todayKey, daysSince, lastTouch, STALE_DAYS } from '@/lib/crm';
import type { Lead, LeadActivity } from '@/lib/types';

/**
 * Morning CRM digest. Call once a day from a scheduler (Cloud Scheduler,
 * cron-job.org, GitHub Actions…):
 *
 *   POST /api/crm/digest
 *   Authorization: Bearer $CRM_DIGEST_SECRET
 *
 * Each rep gets one message: follow-ups due/overdue, tasks due, stale deals,
 * deals past their expected close. Ops admins get projects still waiting on
 * hand-off. Runs at most once per day unless ?force=1.
 */

// Digest dates follow the shop's local day, not the server's UTC day.
const TZ = process.env.CRM_DIGEST_TZ || 'America/Detroit';

function localToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => p.find(x => x.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRM_DIGEST_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRM_DIGEST_SECRET is not configured' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fs = getFirestore(adminApp);
  const today = localToday() || todayKey();
  const force = req.nextUrl.searchParams.get('force') === '1';
  const stateRef = fs.collection('systemConfig').doc('crmDigest');
  if (!force) {
    const state = await stateRef.get();
    if (state.exists && state.data()?.lastRun === today) {
      return NextResponse.json({ status: 'skipped', reason: 'already ran today' });
    }
  }

  const [leadSnap, taskSnap, projSnap] = await Promise.all([
    fs.collection('leads').get(),
    fs.collection('leadActivities').where('type', '==', 'task').get(),
    fs.collection('projects').where('status', '==', 'on-hold').get(),
  ]);
  const leads = leadSnap.docs.map(d => ({ ...d.data(), id: d.id } as Lead));
  const leadById = new Map(leads.map(l => [l.id, l]));
  const tasks = taskSnap.docs.map(d => ({ ...d.data(), id: d.id } as LeadActivity))
    .filter(t => !t.completedAt && t.scheduledAt && t.scheduledAt <= today);

  // Group everything by deal owner.
  const byOwner = new Map<string, string[]>();
  const add = (owner: string | undefined, line: string) => {
    if (!owner) return;
    byOwner.set(owner, [...(byOwner.get(owner) || []), line]);
  };
  const section = (owner: string, header: string, lines: string[]) => {
    if (lines.length) add(owner, `${header}\n${lines.map(l => `  • ${l}`).join('\n')}`);
  };

  const owners = new Set(leads.filter(isOpen).map(l => l.assignedTo).filter(Boolean));
  for (const owner of owners) {
    const mine = leads.filter(l => isOpen(l) && l.assignedTo === owner);
    section(owner, 'FOLLOW-UPS DUE', mine
      .filter(l => l.followUpDate && l.followUpDate <= today)
      .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!))
      .map(l => `${l.companyName}${l.followUpDate! < today ? ` (overdue since ${l.followUpDate})` : ''}${l.nextStep ? ` — ${l.nextStep}` : ''}${l.contactPhone ? ` · ${l.contactPhone}` : ''}`));
    section(owner, 'TASKS DUE', tasks
      .filter(t => leadById.get(t.leadId)?.assignedTo === owner)
      .map(t => `${t.description} — ${leadById.get(t.leadId)?.companyName}${t.scheduledAt! < today ? ` (due ${t.scheduledAt})` : ''}`));
    section(owner, `GOING STALE (${STALE_DAYS}+ DAYS NO TOUCH)`, mine
      .filter(isStale)
      .sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0))
      .slice(0, 10)
      .map(l => `${l.companyName} — ${daysSince(lastTouch(l))}d idle${l.estimatedValue ? `, $${Math.round(l.estimatedValue).toLocaleString()}` : ''}`));
    section(owner, 'PAST EXPECTED CLOSE', mine
      .filter(l => l.expectedCloseDate && l.expectedCloseDate < today)
      .map(l => `${l.companyName} — was due ${l.expectedCloseDate}; update the date or close it`));
  }

  let repMessages = 0;
  const recipients = await usersById(fs, [...byOwner.keys()]);
  for (const r of recipients) {
    const parts = byOwner.get(r.id)!;
    await deliverNotification(fs, [r], {
      title: `Your CRM day — ${today}`,
      body: `${parts.join('\n\n')}\n\nOpen My Day in the CRM to work the list.`,
      sentBy: 'system',
    });
    repMessages++;
  }

  // Ops: won deals still waiting for a crew.
  const waiting = projSnap.docs.map(d => d.data()).filter(p => p.sourceLeadId);
  if (waiting.length) {
    await deliverNotification(fs, await opsAdmins(fs), {
      title: `${waiting.length} sold project${waiting.length === 1 ? '' : 's'} waiting on kickoff`,
      body: waiting.map(p => `  • ${p.name}${p.handoffAt ? ` — handed off ${String(p.handoffAt).slice(0, 10)}` : ''}${p.soldBy ? ` by ${p.soldBy}` : ''}`).join('\n')
        + '\n\nAssign a crew and set a start date to move them to active.',
      sentBy: 'system',
    });
  }

  await stateRef.set({ lastRun: today, ranAt: new Date().toISOString(), repMessages, opsWaiting: waiting.length }, { merge: true });
  return NextResponse.json({ status: 'ok', date: today, repMessages, opsWaiting: waiting.length });
}
