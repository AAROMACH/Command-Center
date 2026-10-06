/**
 * The job-paste format used by Import Jobs. A Field Nation dispatch copied
 * from the site comes out as one value per line, in this order:
 *
 *   20063943                              ← work order #
 *   Kiosk Installation - Tropical Smoothie MI-148
 *   10/6/2026 at 9:00 PM
 *   Canton, MI 48188
 *   ReSource Point of Sale LLC
 *   $                                     ← (FN artifact, ignored)
 *   fixedPayment Terms                    ← pay type: fixed / hourly / blended
 *   $225                                  ← pay (blended: "2 hrs @ $110 and then up to 1 hr @ $55/hr")
 *   Confirmed
 *
 * Typing a job by hand, the same fields can be written with labels
 * ("Title: …") in any order — see JOB_PASTE_TEMPLATE.
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

export const JOB_PASTE_FIELDS: { key: keyof JobPasteLines; label: string; example: string; hint: string }[] = [
  { key: 'rawId', label: 'Work Order #', example: '20063943', hint: 'Field Nation / client WO number' },
  { key: 'title', label: 'Title', example: 'Kiosk Installation - Tropical Smoothie MI-148', hint: 'Job name' },
  { key: 'dateTime', label: 'Date & Time', example: '10/6/2026 at 9:00 PM', hint: 'M/D/YYYY at H:MM AM/PM' },
  { key: 'location', label: 'Location', example: 'Canton, MI 48188', hint: 'City, ST ZIP or full address' },
  { key: 'company', label: 'Company', example: 'ReSource Point of Sale LLC', hint: 'Who the work is for' },
  { key: 'payModel', label: 'Pay Type', example: 'fixed', hint: 'fixed, hourly or blended' },
  { key: 'laborRate', label: 'Pay', example: '$225', hint: 'Blended: 2 hrs @ $110 and then up to 1 hr @ $55/hr' },
];

/** Fill-in-the-blanks block for manual entry. Separate jobs with a blank line. */
export const JOB_PASTE_TEMPLATE = JOB_PASTE_FIELDS.map(f => `${f.label}: `).join('\n') + '\nStatus: ';

/** The example job as Field Nation pastes it (unlabeled, positional). */
export const JOB_PASTE_EXAMPLE = [
  '20063943',
  'Kiosk Installation - Tropical Smoothie MI-148',
  '10/6/2026 at 9:00 PM',
  'Canton, MI 48188',
  'ReSource Point of Sale LLC',
  '$',
  'fixedPayment Terms',
  '$225',
  'Confirmed',
].join('\n');

const LABEL_TO_KEY: Record<string, keyof JobPasteLines> = {
  'work order #': 'rawId', 'work order': 'rawId', 'wo #': 'rawId', 'wo': 'rawId', 'id': 'rawId',
  'title': 'title', 'job': 'title',
  'date & time': 'dateTime', 'date and time': 'dateTime', 'date': 'dateTime', 'when': 'dateTime',
  'location': 'location', 'address': 'location',
  'company': 'company', 'client': 'company', 'buyer': 'company',
  'pay type': 'payModel', 'payment terms': 'payModel',
  'pay': 'laborRate', 'rate': 'laborRate', 'amount': 'laborRate',
};

/**
 * Reads one job block. Labeled lines ("Title: …") are matched by label and may
 * come in any order; otherwise the Field Nation line order above is used.
 * Returns null when there isn't enough to make a job.
 */
export function readJobBlock(block: string): JobPasteLines | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const labeled: Partial<JobPasteLines> = {};
  let labeledCount = 0;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z #&]+?)\s*:\s*(.*)$/);
    const key = m && LABEL_TO_KEY[m[1].trim().toLowerCase()];
    if (key) {
      labeledCount++;
      if (m![2].trim()) labeled[key] = m![2].trim();
    }
  }
  if (labeledCount >= 3) {
    if (!labeled.title && !labeled.rawId) return null;
    return {
      rawId: labeled.rawId || '', title: labeled.title || '', dateTime: labeled.dateTime || '',
      location: labeled.location || '', company: labeled.company || '',
      payModel: labeled.payModel || 'fixed', laborRate: labeled.laborRate || '',
    };
  }

  // Field Nation positional paste. Blank lines inside a block were already
  // dropped, so the lone "$" artifact line keeps its slot at index 5.
  const raw = block.split('\n').map(l => l.trim());
  if (raw.length < 5) return null;
  return {
    rawId: raw[0], title: raw[1], dateTime: raw[2], location: raw[3], company: raw[4],
    payModel: raw[6] || '', laborRate: raw[7] || '',
  };
}
