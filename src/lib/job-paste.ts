/**
 * The job-paste format used by Import Jobs — exactly how a Field Nation
 * dispatch pastes, one value per line, jobs separated by a blank line.
 * Hand-typed jobs use the same lines in the same order.
 */

export type JobPasteLines = {
  rawId: string;
  title: string;
  dateTime: string;
  location: string;
  company: string;
  payModel: string;
  laborRate: string;
};

/** Every line of the format, in order, with the example value. */
export const JOB_PASTE_LINES: { label: string; example: string; hint: string }[] = [
  { label: 'Work Order #', example: '20063943', hint: 'FN / client WO number' },
  { label: 'Title', example: 'Kiosk Installation - Tropical Smoothie MI-148', hint: 'Job name' },
  { label: 'Date & Time', example: '10/6/2026 at 9:00 PM', hint: 'M/D/YYYY at H:MM AM/PM' },
  { label: 'Location', example: 'Canton, MI 48188', hint: 'City, ST ZIP' },
  { label: 'Company', example: 'ReSource Point of Sale LLC', hint: 'Who the work is for' },
  { label: '$', example: '$', hint: 'Leave as $' },
  { label: 'Pay Type', example: 'fixedPayment Terms', hint: 'fixed / hourly / blended + "Payment Terms"' },
  { label: 'Pay', example: '$225', hint: 'Blended: 2 hrs @ $110 and then up to 1 hr @ $55/hr' },
  { label: 'Status', example: 'Confirmed', hint: 'Status' },
];

/** The template block — the example job exactly as Field Nation pastes it. */
export const JOB_PASTE_TEMPLATE = JOB_PASTE_LINES.map(l => l.example).join('\n');

/** Reads one pasted job block by line position. Null when too short to be a job. */
export function readJobBlock(block: string): JobPasteLines | null {
  const lines = block.split('\n').map(l => l.trim());
  if (lines.length < 5) return null;
  return {
    rawId: lines[0], title: lines[1], dateTime: lines[2], location: lines[3], company: lines[4],
    payModel: lines[6] || '', laborRate: lines[7] || '',
  };
}
