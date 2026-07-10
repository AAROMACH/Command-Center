import type { WorkOrder } from './types';

// ── Imported vs manual job identity ─────────────────────────────────────────
//
// Internal IDs stay internal (Firestore assignment/work-order document ids).
// Imported jobs additionally carry the original Field Nation / external work
// order number in `externalWorkOrderId`, which is the number shown in the UI,
// used for Field Nation links, and used for duplicate detection. These helpers
// are the single source of truth so the two never get confused.

const FIELD_NATION_BASE = 'https://app.fieldnation.com/workorders/';

export function isImported(o: Partial<WorkOrder> | null | undefined): boolean {
  return (o as any)?.source === 'Imported';
}

/** Normalize an external work order number for storage/comparison. */
export function normalizeExternalId(raw: string | number | null | undefined): string {
  return (raw ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, '')       // drop spaces / accidental line breaks
    .replace(/^wo-/i, '')      // drop legacy internal prefix
    .toLowerCase();
}

/**
 * The external (Field Nation) work order number for a job, if any.
 * Prefers the explicit field, then the internal workOrderId reference (set at
 * conversion), then a legacy imported id. Empty string for manual jobs.
 */
export function externalWorkOrderId(o: Partial<WorkOrder> | null | undefined): string {
  if (!o) return '';
  const explicit = (o as any).externalWorkOrderId;
  if (explicit) return String(explicit).replace(/^wo-/i, '');
  if (isImported(o)) {
    const src = o.workOrderId || o.id || '';
    return String(src).replace(/^wo-/i, '');
  }
  return '';
}

/**
 * The number to DISPLAY for a job. Imported jobs show their external Field
 * Nation number; manual jobs show their internal document id — never a
 * separate generated short code that would read as a second id.
 */
export function displayWorkOrderNumber(o: Partial<WorkOrder> | null | undefined): string {
  if (!o) return '';
  const ext = externalWorkOrderId(o);
  if (ext) return ext.toUpperCase();
  return String(o.id || '').toUpperCase();
}

/** Field Nation URL — always built from the external number, never the internal id. */
export function fieldNationUrl(o: Partial<WorkOrder> | null | undefined): string {
  return `${FIELD_NATION_BASE}${externalWorkOrderId(o)}`;
}
