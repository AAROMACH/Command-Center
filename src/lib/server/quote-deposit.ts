import 'server-only';
import { randomBytes } from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { docNumber } from '@/lib/doc-number';
import { cleanRecipients } from '@/lib/recipients';
import { getConnection } from './quickbooks';
import { syncInvoiceById } from './qbo-sync';
import { sendEmail } from './notify-delivery';

/**
 * When a quote with a deposit is approved: make a deposit invoice for that
 * amount, put it in QuickBooks (for the "Pay now" link), save the link on the
 * quote (the approval page shows a Pay deposit button) and email it.
 * Safe to call twice — it does nothing once the quote has a deposit invoice.
 */
const money = (n: unknown) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

async function nextInvoiceId(): Promise<string> {
  const fs = getFirestore(adminApp);
  const ref = fs.doc('systemConfig/idCounters');
  const n = await fs.runTransaction(async tx => {
    const cur = Number((await tx.get(ref)).data()?.inv ?? 0);
    tx.set(ref, { inv: cur + 1 }, { merge: true });
    return cur;
  });
  return `inv-${String(n).padStart(3, '0')}`;
}

export async function createDepositInvoice(quoteId: string, origin: string, by = 'automatic'): Promise<{ invoiceId: string; payLink: string | null } | null> {
  const fs = getFirestore(adminApp);
  const qRef = fs.doc(`quotes/${quoteId}`);
  const q = (await qRef.get()).data();
  const amount = Number(q?.depositAmount) || 0;
  if (!q || amount <= 0) return null;
  if (q.depositInvoiceId) return { invoiceId: q.depositInvoiceId, payLink: q.depositPayLink || null };

  const id = await nextInvoiceId();
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const number = docNumber(id, ymd);
  const token = randomBytes(24).toString('hex');
  const label = q.deposit?.kind === 'percent' ? `${q.deposit.value}% deposit` : 'Deposit';
  await fs.doc(`invoices/${id}`).set({
    id, invoiceNumber: number,
    clientId: q.clientId || '', clientName: q.customerCompany || q.customerName || '',
    customerEmail: q.customerEmail || null,
    issueDate: ymd, dueDate: ymd, status: 'sent', sentAt: today.toISOString(), sentBy: by,
    lineItems: [{ id: 'deposit', description: `${label} for quote ${q.quoteNumber}${q.title ? ` — ${q.title}` : ''}`, quantity: 1, unitPrice: amount, category: 'labor' }],
    subtotal: amount, tax: 0, total: amount, discountAmount: 0,
    quoteId, isDeposit: true, publicToken: token,
    notes: `Deposit to start the work in quote ${q.quoteNumber}. It's taken off the final invoice.`,
    approval: { status: 'approved', decidedByName: 'Quote approval', decidedAt: today.toISOString() },
  });

  let payLink: string | null = null;
  if (await getConnection()) {
    const r = await syncInvoiceById(id);
    payLink = r.ok ? r.link || null : null;
  }
  await qRef.update({ depositInvoiceId: id, depositInvoiceNumber: number, depositPayLink: payLink, updatedAt: today.toISOString() });

  // Email the deposit invoice to whoever approved it and the quote's customer.
  const recipients = cleanRecipients([q.approvedByEmail || '', q.customerEmail || '', ...(Array.isArray(q.emailedTo) ? q.emailedTo : String(q.emailedTo || '').split(','))]);
  if (recipients.length) {
    const text = [
      `Hello${q.customerName ? ` ${q.customerName}` : ''},`,
      '',
      `Thank you for approving quote ${q.quoteNumber}. A deposit of ${money(amount)} is due to get started.`,
      '',
      ...(payLink ? [`Pay the deposit online (card or bank transfer): ${payLink}`, ''] : []),
      `View the deposit invoice: ${origin}/public/invoice/${token}`,
      '',
      'The deposit is taken off your final invoice.',
      '',
      'Thank you,',
      'Aaromach',
    ].join('\n');
    try {
      await sendEmail(recipients, `Deposit invoice ${number} from AAROMACH`, text, {
        kind: 'billing', idempotencyKey: `quote-deposit/${quoteId}`, related: { type: 'invoice', id, label: number }, sentBy: by,
      });
      await fs.doc(`invoices/${id}`).update({ sentTo: recipients.join(', ') });
    } catch (e) { console.warn('[quote-deposit] email failed', e); }
  }
  return { invoiceId: id, payLink };
}
