/**
 * Quote and invoice numbers: the date it was made, then its running number —
 * 11/05/26-007 is the 7th quote, made Nov 5 2026. The running number is the
 * doc id's counter (qt-007, inv-012), so numbers never repeat; the date is
 * only there to read. Doc ids stay qt-… / inv-… (Firestore ids can't hold '/').
 */

/** The running number in a doc id: 'qt-007' → '007'. Null for fallback ids. */
export const docSeq = (id: string): string | null => /^[a-z]+-(\d+)$/i.exec(id || '')?.[1] ?? null;

/** MM/DD/YY in local time. Plain 'YYYY-MM-DD' dates are taken as that day. */
export function shortDate(when: string | Date = new Date()): string {
  const d = typeof when === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(when) ? `${when}T12:00:00` : when) : when;
  const ok = isNaN(d.getTime()) ? new Date() : d;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(ok.getMonth() + 1)}/${p(ok.getDate())}/${p(ok.getFullYear() % 100)}`;
}

/**
 * '11/05/26-007' for quote 'qt-007' made 11/05/26. Invoices use the common
 * invoice style with no slashes: 'INV-110526-012' for 'inv-012'. The id
 * itself if it has no counter.
 */
export function docNumber(id: string, when: string | Date = new Date()): string {
  const seq = docSeq(id);
  if (!seq) return id;
  if (/^inv-/i.test(id)) return `INV-${shortDate(when).replace(/\//g, '')}-${seq}`;
  return `${shortDate(when)}-${seq}`;
}

/** A number the app made up (the doc id, or the old random INV-2026-1234), not one typed by hand. */
export const isAutoNumber = (num: string | undefined | null, id: string) =>
  !num || num === id || /^INV-\d{4}-\d{4}$/.test(num);

/** The number a new invoice is saved with (see saveInvoiceFromEditor). */
export const newInvoiceNumber = (typed: string, id: string, issueDate?: string) =>
  isAutoNumber(typed.trim(), id) ? docNumber(id, issueDate || new Date()) : typed.trim();

/** Sort key for numbers in this format and older ones: the running number. */
export function numberSortKey(num: string, id: string): number {
  // The old random INV-2026-1234 numbers say nothing about order; use the id's counter.
  const m = (!/^INV-\d{4}-\d{4}$/.test(num || '') && /-(\d+)$/.exec(num || '')) || /-(\d+)$/.exec(id || '');
  return m ? Number(m[1]) : 0;
}
