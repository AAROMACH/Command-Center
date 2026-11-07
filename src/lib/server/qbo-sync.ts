import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getConnection, qboGet, qboPost, qboQuery } from './quickbooks';

/**
 * QuickBooks stage 2 — the app stays the place invoices are made; QuickBooks
 * gets a copy so the books match and the client can pay online:
 *  - Customers: a client becomes a QuickBooks Customer the first time one of
 *    their invoices is pushed (matched by name first, so nothing is doubled).
 *    users/{clientId}.qboCustomerId remembers it.
 *  - Invoices: pushInvoice() creates (or updates) the QuickBooks invoice with
 *    online card + bank payment turned on, and saves its Pay now link.
 *  - Payments: syncInvoicePayment() marks our invoice Paid once QuickBooks
 *    shows a zero balance — called by the webhook and by "Check payments".
 * Line items all use one Service item ("Aaromach services"), so the books
 * get the same descriptions and amounts without mapping every service.
 */

const fs = () => getFirestore(adminApp);
const cfgRef = () => fs().doc('integrations/quickbooks-sync');
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const q = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const qboReady = async () => !!(await getConnection());

/** The one Service item every invoice line uses (created on first use). */
async function serviceItemId(): Promise<string> {
  const cfg = (await cfgRef().get()).data() || {};
  if (cfg.itemId) return cfg.itemId;
  const NAME = 'Aaromach services';
  let item = (await qboQuery(`select * from Item where Name = '${q(NAME)}'`)).Item?.[0];
  if (!item) {
    const acct = (await qboQuery(`select * from Account where AccountType = 'Income' maxresults 1`)).Account?.[0];
    if (!acct) throw new Error('QuickBooks has no Income account to post sales to — add one in QuickBooks.');
    item = (await qboPost('/item', { Name: NAME, Type: 'Service', IncomeAccountRef: { value: acct.Id } })).Item;
  }
  await cfgRef().set({ itemId: item.Id }, { merge: true });
  return item.Id;
}

/** The client's QuickBooks Customer id — found by name, else created. */
export async function ensureCustomer(clientId: string | null | undefined, displayName: string, email?: string | null): Promise<string> {
  const ref = clientId ? fs().doc(`users/${clientId}`) : null;
  const u = ref ? (await ref.get()).data() || {} : {};
  if (u.qboCustomerId) return u.qboCustomerId;
  const name = (u.clientCompany || displayName || u.name || 'Customer').toString().trim().slice(0, 100);
  let c = (await qboQuery(`select * from Customer where DisplayName = '${q(name)}'`)).Customer?.[0];
  if (!c) {
    c = (await qboPost('/customer', {
      DisplayName: name,
      ...(u.clientCompany ? { CompanyName: String(u.clientCompany).slice(0, 100) } : {}),
      ...(email || u.billingEmail || u.email ? { PrimaryEmailAddr: { Address: email || u.billingEmail || u.email } } : {}),
      ...(u.phoneNumber || u.phone ? { PrimaryPhone: { FreeFormNumber: String(u.phoneNumber || u.phone) } } : {}),
    })).Customer;
  }
  if (ref) await ref.set({ qboCustomerId: c.Id }, { merge: true });
  return c.Id;
}

const lineTotal = (l: any) => r2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (l.category === 'labor' && l.multiplier ? Number(l.multiplier) : 1));

/**
 * Create or update the QuickBooks copy of invoices/{id}. Returns the Pay now
 * link (null if QuickBooks Payments isn't on for the company). Never throws
 * for the caller's sake — failures are saved on the invoice as qboError.
 */
export async function pushInvoice(invoiceId: string, billEmail?: string | null): Promise<{ ok: boolean; payLink: string | null; error?: string }> {
  const ref = fs().doc(`invoices/${invoiceId}`);
  try {
    const inv = (await ref.get()).data();
    if (!inv) throw new Error('Invoice not found');
    if (inv.status === 'void') throw new Error('Void invoices aren’t sent to QuickBooks.');
    const [itemId, customerId] = await Promise.all([serviceItemId(), ensureCustomer(inv.clientId, inv.clientName, billEmail)]);
    const Line: any[] = (inv.lineItems || []).filter((l: any) => lineTotal(l) !== 0).map((l: any) => ({
      DetailType: 'SalesItemLineDetail', Amount: lineTotal(l), Description: String(l.description || '').slice(0, 4000),
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: Number(l.quantity) || 1, UnitPrice: r2(lineTotal(l) / (Number(l.quantity) || 1)), TaxCodeRef: { value: 'NON' } },
    }));
    if (Number(inv.discountAmount) > 0) Line.push({ DetailType: 'DiscountLineDetail', Amount: r2(inv.discountAmount), DiscountLineDetail: { PercentBased: false } });
    // Tax is worked out in the app; it goes over as its own line so the total matches exactly.
    if (Number(inv.tax) > 0) Line.push({
      DetailType: 'SalesItemLineDetail', Amount: r2(inv.tax), Description: 'Sales tax',
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: r2(inv.tax), TaxCodeRef: { value: 'NON' } },
    });
    const body: any = {
      CustomerRef: { value: customerId }, Line,
      DocNumber: String(inv.invoiceNumber || '').slice(0, 21) || undefined,
      TxnDate: inv.issueDate || undefined, DueDate: inv.dueDate || undefined,
      ...(billEmail ? { BillEmail: { Address: billEmail } } : {}),
      AllowOnlineCreditCardPayment: true, AllowOnlineACHPayment: true,
      CustomerMemo: inv.notes ? { value: String(inv.notes).slice(0, 1000) } : undefined,
    };
    let saved: any;
    if (inv.qboInvoiceId) {
      const cur = (await qboGet(`/invoice/${inv.qboInvoiceId}`)).Invoice;
      saved = (await qboPost('/invoice', { ...body, Id: cur.Id, SyncToken: cur.SyncToken, sparse: true })).Invoice;
    } else {
      saved = (await qboPost('/invoice', body)).Invoice;
    }
    const withLink = (await qboGet(`/invoice/${saved.Id}?include=invoiceLink`).catch(() => null))?.Invoice;
    const payLink: string | null = withLink?.InvoiceLink || null;
    const mismatch = Math.abs(r2(saved.TotalAmt) - r2(inv.total)) > 0.01;
    await ref.update({
      qboInvoiceId: saved.Id, qboPayLink: payLink, qboSyncedAt: new Date().toISOString(), qboError: null,
      qboWarning: mismatch ? `QuickBooks total $${r2(saved.TotalAmt).toFixed(2)} doesn’t match $${r2(inv.total).toFixed(2)} — check tax settings in QuickBooks.` : null,
    });
    return { ok: true, payLink };
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    await ref.update({ qboError: error, qboSyncedAt: new Date().toISOString() }).catch(() => {});
    return { ok: false, payLink: null, error };
  }
}

/** Mark our invoice Paid when QuickBooks shows its balance is zero. Returns true if it changed. */
export async function syncInvoicePayment(invoiceId: string): Promise<boolean> {
  const ref = fs().doc(`invoices/${invoiceId}`);
  const inv = (await ref.get()).data();
  if (!inv?.qboInvoiceId || inv.status === 'paid' || inv.status === 'void') return false;
  const q = (await qboGet(`/invoice/${inv.qboInvoiceId}`)).Invoice;
  const balance = r2(q?.Balance);
  if (q && r2(q.TotalAmt) > 0 && balance <= 0) {
    await ref.update({ status: 'paid', paidAt: new Date().toISOString(), paidVia: 'quickbooks', qboBalance: 0 });
    return true;
  }
  if (q && balance !== r2(inv.qboBalance)) await ref.update({ qboBalance: balance });
  return false;
}

/** Our invoice ids for QuickBooks invoice ids. */
export async function invoicesForQboIds(qboIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < qboIds.length; i += 10) {
    const snap = await fs().collection('invoices').where('qboInvoiceId', 'in', qboIds.slice(i, i + 10)).get();
    snap.docs.forEach(d => out.push(d.id));
  }
  return out;
}

/** QuickBooks invoices a payment was applied to. */
export async function qboInvoicesOfPayment(paymentId: string): Promise<string[]> {
  const p = (await qboGet(`/payment/${paymentId}`)).Payment;
  return (p?.Line || []).flatMap((l: any) => (l.LinkedTxn || []).filter((t: any) => t.TxnType === 'Invoice').map((t: any) => String(t.TxnId)));
}

/** Check every open invoice that's in QuickBooks. */
export async function syncAllPayments(): Promise<{ checked: number; paid: number }> {
  const snap = await fs().collection('invoices').where('status', 'in', ['sent', 'overdue']).get();
  let checked = 0, paid = 0;
  for (const d of snap.docs) {
    if (!d.data().qboInvoiceId) continue;
    checked++;
    if (await syncInvoicePayment(d.id).catch(() => false)) paid++;
  }
  return { checked, paid };
}
