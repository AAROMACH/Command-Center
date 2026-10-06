import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase-admin';
import { buildProjectFromLead } from '@/lib/crm-handoff';

// The public quote-approval page (src/app/public/quote/[token]) talks to
// Firestore through this route instead of the client SDK directly. A
// Firestore security rule can't tie a `list`/query read to the SPECIFIC
// token value a caller supplied (it can only see whether a doc's own
// publicToken field is non-null) — so a rule shaped like
// `resource.data.publicToken != null` ends up granting anonymous read of
// EVERY sent quote, not just the one matching the caller's token. Doing the
// token-equality check here, server-side with the Admin SDK (which bypasses
// rules), closes that gap without needing to restructure how quotes are
// stored.

// A customer can only answer a quote that was actually sent to them — not a
// draft that still carries a token from an earlier send, and not one that's
// been superseded or converted since.
const ANSWERABLE = new Set(['sent', 'viewed', 'changes_requested']);
const VISIBLE = new Set(['sent', 'viewed', 'changes_requested', 'approved', 'rejected', 'expired']);

/**
 * The customer only picks options — they never get to rewrite them. Take the
 * stored groups and copy across just the `selected` flag for option ids the
 * caller sent, so prices/labels can't be edited from the browser.
 */
function sanitizeChoices(stored: any[], submitted: unknown): any[] {
  const picked = new Map<string, boolean>();
  if (Array.isArray(submitted)) {
    for (const g of submitted) {
      for (const o of (g && Array.isArray(g.options) ? g.options : [])) {
        if (o && typeof o.id === 'string') picked.set(`${g.id}::${o.id}`, o.selected === true);
      }
    }
  }
  return (stored || []).map(g => ({
    ...g,
    options: (g.options || []).map((o: any) => ({ ...o, selected: picked.get(`${g.id}::${o.id}`) ?? o.selected ?? false })),
  }));
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function findByToken(token: string) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
  const snap = await getFirestore(adminApp)
    .collection('quotes')
    .where('publicToken', '==', token)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const doc = await findByToken(token);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = doc.data();
  if (!VISIBLE.has(data.status)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.status === 'sent') {
    await doc.ref.update({ status: 'viewed', viewedAt: new Date().toISOString() });
    data.status = 'viewed';
  }
  return NextResponse.json({ quote: { ...data, id: doc.id } });
}

type RespondPayload = {
  token: string;
  action: 'approve' | 'reject';
  approverName?: string;
  approverEmail?: string;
  approvalNote?: string;
  rejectReason?: string;
  optionalChoices?: unknown;
};

export async function POST(req: NextRequest) {
  let payload: RespondPayload & { quoteId?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, quoteId, action } = payload;
  if ((!token && !quoteId) || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Missing token or invalid action' }, { status: 400 });
  }

  // Two ways in: the emailed link's token (external customers), or a signed-in
  // client portal user answering a quote addressed to their own account.
  let doc;
  if (token) {
    doc = await findByToken(token);
  } else {
    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let uid: string;
    try {
      uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const snap = typeof quoteId === 'string' ? await getFirestore(adminApp).collection('quotes').doc(quoteId).get() : null;
    doc = snap?.exists && snap.data()?.clientId === uid ? snap : null;
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = doc.data()!;
  if (!ANSWERABLE.has(data.status)) {
    return NextResponse.json({ error: 'This quote can no longer be answered' }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (action === 'approve') {
    const approverName = str(payload.approverName, 120);
    const approverEmail = str(payload.approverEmail, 200);
    if (!approverName || !approverEmail) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    await doc.ref.update({
      status: 'approved',
      approvedAt: now,
      approvedByName: approverName,
      approvedByEmail: approverEmail,
      approvalNote: str(payload.approvalNote, 2000) || null,
      optionalChoices: sanitizeChoices(data.optionalChoices, payload.optionalChoices),
      updatedAt: now,
    });
  } else {
    const rejectReason = str(payload.rejectReason, 2000);
    if (!rejectReason) {
      return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
    }
    await doc.ref.update({
      status: 'rejected',
      rejectedAt: now,
      rejectionReason: rejectReason,
      updatedAt: now,
    });
  }

  if (typeof data.leadId === 'string' && data.leadId) {
    // Best effort — the customer's answer is already saved; a CRM sync
    // failure must not turn their approval into an error.
    try {
      await syncLeadWithQuoteAnswer(data.leadId, doc.id, action === 'approve', Number(data.total) || 0, now, data);
    } catch (e) {
      console.error('public-quote: lead sync failed', e);
    }
  }

  return NextResponse.json({ status: 'ok' });
}

/** Approved quote → lead Won at the quoted total. Rejected → timeline note only; sales decides what's next. */
async function syncLeadWithQuoteAnswer(leadId: string, quoteId: string, approved: boolean, total: number, now: string, quote: any) {
  const fs = getFirestore(adminApp);
  const leadRef = fs.collection('leads').doc(leadId);
  const lead = await leadRef.get();
  if (!lead.exists) return;
  const ld = lead.data()!;
  const activities = fs.collection('leadActivities');
  const note = (description: string, type = 'note') => {
    const ref = activities.doc();
    return ref.set({ id: ref.id, leadId, type, description, createdBy: 'system', createdAt: now });
  };
  if (approved) {
    if (ld.stage !== 'won') {
      await leadRef.update({
        stage: 'won', probability: 100, closedAt: now, stageChangedAt: now, updatedAt: now, lastActivityAt: now,
        ...(total > 0 ? { estimatedValue: total } : {}),
      });
      await note(`Quote ${quoteId} approved by customer — deal marked Won`);
    } else {
      await note(`Quote ${quoteId} approved by customer`);
    }
    if (!ld.projectId) {
      const projectId = await nextProjectId(fs);
      const lead = { ...ld, id: leadId, estimatedValue: total || ld.estimatedValue } as any;
      const surveys = (await fs.collection('siteSurveys').where('leadId', '==', leadId).get()).docs.map(d => ({ ...d.data(), id: d.id } as any));
      await fs.collection('projects').doc(projectId).set({
        ...buildProjectFromLead(lead, {
          quote: { id: quoteId, title: quote.title, scopeSummary: quote.scopeSummary, description: quote.description, total },
          surveys, createdBy: 'system', now,
        }),
        id: projectId,
      });
      await leadRef.update({ projectId });
      await note(`Handed off to ops — project ${projectId} created (on hold)`);
    }
  } else {
    await leadRef.update({ updatedAt: now, lastActivityAt: now, followUpDate: now.slice(0, 10) });
    await note(`Quote ${quoteId} rejected by customer — follow up`);
  }
}

/** Same counter scheme as lib/generateId (systemConfig/idCounters), via the Admin SDK. */
async function nextProjectId(fs: FirebaseFirestore.Firestore): Promise<string> {
  const ref = fs.collection('systemConfig').doc('idCounters');
  try {
    const n = await fs.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? snap.data()?.prj : 0) ?? 0;
      tx.set(ref, { prj: current + 1 }, { merge: true });
      return current;
    });
    return `prj-${String(n).padStart(3, '0')}`;
  } catch {
    return `prj-${Date.now().toString(36)}`;
  }
}
