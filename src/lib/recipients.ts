/** Email recipients for invoice/quote sends: trimmed, valid, lowercase-deduped, max 10. */
export const MAX_RECIPIENTS = 10;
export const isEmailAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function cleanRecipients(list: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(list) ? list : [list]) {
    if (typeof v !== 'string') continue;
    for (const part of v.split(/[,;\s]+/)) {
      const e = part.trim();
      if (!e || !isEmailAddress(e) || seen.has(e.toLowerCase())) continue;
      seen.add(e.toLowerCase());
      out.push(e);
    }
  }
  return out.slice(0, MAX_RECIPIENTS);
}
