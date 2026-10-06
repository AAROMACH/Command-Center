// Lead import parsing/extraction helpers.
//
// Pure functions — no Firebase or DOM dependencies — so extraction logic is
// testable and reusable. The importer feeds these from CSV text, XLSX rows,
// or the text content of a PDF's first page, and gets back candidate leads
// destined for the "new" pipeline stage. Extraction is heuristic by design:
// the original file is always attached to the lead so sales can recover
// anything that wasn't captured.

export type ExtractedContact = { name: string; title: string; email: string; phone: string };

export type ExtractedLead = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
  website: string;
  address: string;
  industry: string;
  estimatedValue: number;
  notes: string;
  /** Everyone else from the same company in the file (Apollo exports one row per person). */
  otherContacts: ExtractedContact[];
  /** Which uploaded file this candidate came from. */
  sourceFile: string;
};

const emptyLead = (sourceFile: string): ExtractedLead => ({
  companyName: '', contactName: '', contactEmail: '', contactPhone: '', contactTitle: '',
  website: '', address: '', industry: '', estimatedValue: 0, notes: '', otherContacts: [], sourceFile,
});

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

// Column names → fields. Covers generic spreadsheets and Apollo.io / ZoomInfo
// style exports (one row per person, separate first/last name and phone columns).
type Field =
  | 'companyName' | 'contactName' | 'firstName' | 'lastName' | 'contactTitle' | 'contactEmail'
  | 'directPhone' | 'mobilePhone' | 'contactPhone' | 'companyPhone'
  | 'website' | 'industry' | 'street' | 'city' | 'state' | 'zip' | 'address'
  | 'estimatedValue' | 'notes';

const HEADER_ALIASES: Record<Field, string[]> = {
  companyName: ['company', 'company name', 'business', 'business name', 'organization', 'organization name', 'org', 'account', 'account name'],
  contactName: ['contact', 'contact name', 'name', 'full name', 'person', 'lead name'],
  firstName: ['first name', 'firstname', 'first'],
  lastName: ['last name', 'lastname', 'last', 'surname'],
  contactTitle: ['title', 'job title', 'position', 'role', 'contact title'],
  contactEmail: ['email', 'e-mail', 'email address', 'contact email', 'mail', 'work email', 'business email'],
  directPhone: ['work direct phone', 'direct phone', 'direct dial', 'direct phone number'],
  mobilePhone: ['mobile phone', 'mobile', 'cell', 'cell phone'],
  contactPhone: ['phone', 'phone number', 'tel', 'telephone', 'contact phone', 'work phone', 'home phone', 'other phone'],
  companyPhone: ['corporate phone', 'company phone', 'main phone', 'hq phone', 'company phone number'],
  website: ['website', 'company website', 'web', 'url', 'domain', 'company domain'],
  industry: ['industry', 'company industry'],
  street: ['company address', 'company street', 'street', 'street address', 'address 1', 'address line 1'],
  city: ['company city', 'city'],
  state: ['company state', 'state', 'province', 'region'],
  zip: ['company postal code', 'company zip', 'postal code', 'zip', 'zip code'],
  address: ['address', 'full address', 'location', 'site address'],
  estimatedValue: ['value', 'estimated value', 'deal value', 'amount', 'deal size', 'budget'],
  notes: ['notes', 'note', 'description', 'comments', 'details', 'summary'],
};

function matchHeader(header: string): Field | null {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/**
 * Convert a header row + data rows into lead candidates, one per row.
 * Columns that match no known header are appended to notes as
 * "Header: value" so nothing that was in the file silently vanishes.
 */
export function rowsToLeads(rows: (string | number | null | undefined)[][], sourceFile: string): ExtractedLead[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h ?? ''));
  const mapping = headers.map(matchHeader);

  return rows.slice(1).map(raw => {
    const lead = emptyLead(sourceFile);
    const f: Partial<Record<Field, string>> = {};
    const extra: string[] = [];

    raw.forEach((cellRaw, idx) => {
      const cell = String(cellRaw ?? '').trim();
      if (!cell) return;
      const field = mapping[idx];
      if (field === 'notes') f.notes = f.notes ? `${f.notes}\n${cell}` : cell;
      else if (field) { if (!f[field]) f[field] = cell; } // first non-empty value wins
      else extra.push(`${headers[idx] || `Column ${idx + 1}`}: ${cell}`);
    });

    lead.companyName = f.companyName || '';
    lead.contactName = f.contactName || [f.firstName, f.lastName].filter(Boolean).join(' ');
    lead.contactTitle = f.contactTitle || '';
    lead.contactEmail = f.contactEmail || '';
    // The person's own line beats the switchboard.
    lead.contactPhone = f.directPhone || f.mobilePhone || f.contactPhone || f.companyPhone || '';
    lead.website = f.website || '';
    lead.industry = f.industry || '';
    const cityLine = [f.city, [f.state, f.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    lead.address = f.address || [f.street, cityLine].filter(Boolean).join(', ');
    if (f.estimatedValue) {
      const n = parseFloat(f.estimatedValue.replace(/[$,\s]/g, ''));
      if (!isNaN(n)) lead.estimatedValue = n;
    }
    if (f.companyPhone && f.companyPhone !== lead.contactPhone) extra.unshift(`Main phone: ${f.companyPhone}`);
    lead.notes = f.notes || '';

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

/**
 * Collapse rows for the same company into one lead: the first row is the
 * primary contact, everyone after it goes to otherContacts. `key` decides
 * what counts as the same company (e.g. ignoring Inc/LLC and punctuation).
 */
export function groupLeadsByCompany(leads: ExtractedLead[], key: (companyName: string) => string): ExtractedLead[] {
  const out: ExtractedLead[] = [];
  const byKey = new Map<string, ExtractedLead>();
  for (const l of leads) {
    const k = key(l.companyName);
    const existing = k ? byKey.get(k) : undefined;
    if (!existing) {
      const copy = { ...l, otherContacts: [...l.otherContacts] };
      out.push(copy);
      if (k) byKey.set(k, copy);
      continue;
    }
    if (l.contactName || l.contactEmail) {
      existing.otherContacts.push({ name: l.contactName || l.contactEmail, title: l.contactTitle, email: l.contactEmail, phone: l.contactPhone });
    }
    // Company-level gaps get filled from later rows.
    existing.website ||= l.website;
    existing.address ||= l.address;
    existing.industry ||= l.industry;
  }
  return out;
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
    ...emptyLead(fileName),
    companyName,
    contactName,
    contactEmail: email,
    contactPhone: phone,
    estimatedValue: 0,
    notes: `Imported from ${fileName} (page 1 extract):\n\n${excerpt}${text.length > 1500 ? '\n…(truncated — see attached original)' : ''}`,
    sourceFile: fileName,
  };
}
