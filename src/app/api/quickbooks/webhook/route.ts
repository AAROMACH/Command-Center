import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { invoicesForQboIds, qboInvoicesOfPayment, syncInvoicePayment } from '@/lib/server/qbo-sync';

/**
 * Intuit webhook: QuickBooks calls this when a Payment or Invoice changes, and
 * we mark the matching invoice Paid once its balance is zero. The body is
 * signed with the app's Verifier Token (QBO_WEBHOOK_VERIFIER); unsigned or
 * wrongly signed calls are refused. Intuit only sends ids — every amount is
 * read back from QuickBooks itself.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const key = process.env.QBO_WEBHOOK_VERIFIER;
  const sig = req.headers.get('intuit-signature') || '';
  if (!key) return NextResponse.json({ error: 'Webhook not set up' }, { status: 503 });
  const want = createHmac('sha256', key).update(raw).digest('base64');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });

  let body: any = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const qboInvoiceIds = new Set<string>();
  for (const n of body.eventNotifications || []) {
    for (const e of n.dataChangeEvent?.entities || []) {
      try {
        if (e.name === 'Invoice') qboInvoiceIds.add(String(e.id));
        if (e.name === 'Payment' && e.operation !== 'Delete') (await qboInvoicesOfPayment(String(e.id))).forEach(id => qboInvoiceIds.add(id));
      } catch (err) { console.error('[qbo webhook]', err); }
    }
  }
  const ours = await invoicesForQboIds([...qboInvoiceIds]).catch(() => []);
  for (const id of ours) await syncInvoicePayment(id).catch(err => console.error('[qbo webhook] sync', id, err));
  // Always 200 quickly, or Intuit retries and eventually disables the webhook.
  return NextResponse.json({ ok: true, synced: ours.length });
}
