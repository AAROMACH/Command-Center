// Lead import parsing/extraction helpers.
//
// Pure functions — no Firebase or DOM dependencies — so extraction logic is
// testable and reusable. The importer feeds these from CSV text, XLSX rows,
// or the text content of a PDF's first page, and gets back candidate leads
// destined for the "new" pipeline stage. Extraction is heuristic by design:
// the original file is always attached to the lead so sales can recover
// anything that wasn't captured.

export type ExtractedLead = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  estimatedValue: number;
  notes: string;
  /** Which uploaded file this candidate came from. */
  sourceFile: string;
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

// ── CSV ────────────────────────────────────────────────────────────────────

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

// ── Tabular rows (CSV / XLSX) → leads ─────────────────────────────────────

const HEADER_ALIASES: Record<keyof Omit<ExtractedLead, 'notes' | 'sourceFile'> | 'notes', string[]> = {
  companyName: ['company', 'company name', 'business', 'business name', 'organization', 'org', 'account'],
  contactName: ['contact', 'contact name', 'name', 'full name', 'person', 'lead name', 'first name'],
  contactEmail: ['email', 'e-mail', 'email address', 'contact email', 'mail'],
  contactPhone: ['phone', 'phone number', 'tel', 'telephone', 'mobile', 'cell', 'contact phone'],
  estimatedValue: ['value', 'estimated value', 'deal value', 'amount', 'deal size', 'budget', 'revenue'],
  notes: ['notes', 'note', 'description', 'comments', 'details', 'summary'],
};

function matchHeader(header: string): keyof typeof HEADER_ALIASES | null {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof typeof HEADER_ALIASES, string[]][]) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/**
 * Convert a header row + data rows into lead candidates. Columns that match
 * no known header are appended to notes as "Header: value" so nothing that
 * was in the file silently vanishes.
 */
export function rowsToLeads(rows: (string | number | null | undefined)[][], sourceFile: string): ExtractedLead[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h ?? ''));
  const mapping = headers.map(matchHeader);

  return rows.slice(1).map(raw => {
    const lead: ExtractedLead = {
      companyName: '', contactName: '', contactEmail: '', contactPhone: '',
      estimatedValue: 0, notes: '', sourceFile,
    };
    const extra: string[] = [];

    raw.forEach((cellRaw, idx) => {
      const cell = String(cellRaw ?? '').trim();
      if (!cell) return;
      const field = mapping[idx];
      if (field === 'estimatedValue') {
        const n = parseFloat(cell.replace(/[$,\s]/g, ''));
        if (!isNaN(n)) lead.estimatedValue = n;
      } else if (field === 'notes') {
        lead.notes = lead.notes ? `${lead.notes}\n${cell}` : cell;
      } else if (field) {
        // First non-empty value wins for the mapped fields
        if (!lead[field]) lead[field] = cell;
      } else {
        extra.push(`${headers[idx] || `Column ${idx + 1}`}: ${cell}`);
      }
    });

    // Fallbacks: pull email/phone from unmatched cells if columns were unlabeled
    if (!lead.contactEmail) {
      const hit = raw.map(c => String(c ?? '')).find(c => EMAIL_RE.test(c));
      if (hit) lead.contactEmail = hit.match(EMAIL_RE)![0];
    }
    if (!lead.contactPhone) {
      const hit = raw.map(c => String(c ?? '')).find(c => PHONE_RE.test(c));
      if (hit) lead.contactPhone = hit.match(PHONE_RE)![0];
    }
    if (extra.length) {
      lead.notes = [lead.notes, `— Unmapped columns —\n${extra.join('\n')}`].filter(Boolean).join('\n\n');
    }
    if (!lead.companyName) lead.companyName = lead.contactName || lead.contactEmail || '';
    return lead;
  }).filter(l => l.companyName || l.contactName || l.contactEmail || l.contactPhone);
}

// ── PDF first-page text → lead ────────────────────────────────────────────

const NAME_LINE_RE = /^[A-Z][a-zA-Z'.-]+(?: [A-Z][a-zA-Z'.-]+){1,2}$/;

/**
 * Heuristic extraction from a PDF's first-page text: email/phone by regex,
 * company from the first substantial line (letterhead position), contact
 * from the first later line that looks like a person's name. The full text
 * is preserved in notes so sales can grab anything the heuristics missed.
 */
export function extractLeadFromPdfText(text: string, fileName: string): ExtractedLead {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  const email = text.match(EMAIL_RE)?.[0] ?? '';
  const phone = text.match(PHONE_RE)?.[0] ?? '';

  // Letterhead convention: the company name is the first substantial line.
  const companyIdx = lines.findIndex(l =>
    l.length >= 3 && l.length <= 80 && !EMAIL_RE.test(l) && !PHONE_RE.test(l)
  );
  const companyName = companyIdx >= 0 ? lines[companyIdx] : fileName.replace(/\.[^.]+$/, '');

  // Contact: the first name-looking line AFTER the company line.
  const contactName = lines.find((l, i) =>
    i !== companyIdx && NAME_LINE_RE.test(l) && !EMAIL_RE.test(l)
  ) ?? '';

  const excerpt = text.trim().slice(0, 1500);
  return {
    companyName,
    contactName,
    contactEmail: email,
    contactPhone: phone,
    estimatedValue: 0,
    notes: `Imported from ${fileName} (page 1 extract):\n\n${excerpt}${text.length > 1500 ? '\n…(truncated — see attached original)' : ''}`,
    sourceFile: fileName,
  };
}
