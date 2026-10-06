import type { Lead, LeadActivity } from './types';

export type Stage = Lead['stage'];

/** Pipeline stages in order, with the default win probability for forecasting. */
export const STAGES: { key: Stage; label: string; color: string; bg: string; probability: number }[] = [
  { key: 'new', label: 'New Lead', color: 'text-text-muted', bg: 'bg-bg-tertiary', probability: 10 },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-400', bg: 'bg-blue-400/10', probability: 20 },
  { key: 'qualified', label: 'Qualified', color: 'text-amber-400', bg: 'bg-amber-400/10', probability: 40 },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'text-purple-400', bg: 'bg-purple-400/10', probability: 60 },
  { key: 'negotiating', label: 'Negotiating', color: 'text-orange-400', bg: 'bg-orange-400/10', probability: 80 },
  { key: 'won', label: 'Won', color: 'text-text-green', bg: 'bg-text-green/10', probability: 100 },
  { key: 'lost', label: 'Lost', color: 'text-text-red', bg: 'bg-text-red/10', probability: 0 },
];

export const STAGE_LABELS = Object.fromEntries(STAGES.map(s => [s.key, s.label])) as Record<Stage, string>;
export const STAGE_COLORS = Object.fromEntries(STAGES.map(s => [s.key, s.color])) as Record<Stage, string>;

export const OPEN_STAGES: Stage[] = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating'];
export const isOpen = (l: Lead) => OPEN_STAGES.includes(l.stage);

export const SOURCES: { key: Lead['source']; label: string }[] = [
  { key: 'referral', label: 'Referral' },
  { key: 'existing_client', label: 'Existing Client' },
  { key: 'website', label: 'Website' },
  { key: 'cold_call', label: 'Cold Call' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'partner', label: 'Partner / GC' },
  { key: 'trade_show', label: 'Trade Show' },
  { key: 'field_nation', label: 'Field Nation' },
  { key: 'other', label: 'Other' },
];
export const sourceLabel = (s?: string) => SOURCES.find(x => x.key === s)?.label ?? (s || '').replace(/_/g, ' ');

/** What Aaromach actually sells — lets sales see pipeline by line of business. */
export const SERVICE_LINES = [
  'Structured Cabling',
  'Fiber',
  'Cameras / CCTV',
  'Access Control',
  'AV',
  'Network Racks',
  'Wireless / Wi-Fi',
  'VoIP',
  'Industrial Automation',
  'Service Contract',
];

export const INDUSTRIES = [
  'Commercial Office', 'Healthcare', 'Education', 'Manufacturing', 'Retail',
  'Warehouse / Logistics', 'Hospitality', 'Government', 'Multi-Family', 'General Contractor', 'Other',
];

export const LOST_REASONS = [
  'Price',
  'Went with competitor',
  'No budget',
  'No decision / went dark',
  'Timing — not now',
  'Scope not a fit',
  'Lost to in-house',
  'Other',
];

export const CALL_OUTCOMES = ['Connected', 'Left voicemail', 'No answer', 'Wrong number', 'Meeting booked'];

export const ACTIVITY_TYPES: { key: LeadActivity['type']; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'email', label: 'Email' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'site_walk', label: 'Site Walk' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'note', label: 'Note' },
];

/** Days without any touch before an open deal is flagged as going stale. */
export const STALE_DAYS = 14;

export function probabilityOf(l: Lead): number {
  if (typeof l.probability === 'number') return l.probability;
  return STAGES.find(s => s.key === l.stage)?.probability ?? 0;
}

export const weightedValue = (l: Lead) => (l.estimatedValue || 0) * probabilityOf(l) / 100;

export function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export const lastTouch = (l: Lead) => l.lastActivityAt || l.updatedAt || l.createdAt;

export function isStale(l: Lead): boolean {
  if (!isOpen(l)) return false;
  const d = daysSince(lastTouch(l));
  return d !== null && d >= STALE_DAYS;
}

/** YYYY-MM-DD in local time — follow-up / close dates are stored as plain dates. */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatMoney(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');

/** Existing leads that look like the same prospect — same company, email or phone. */
export function findDuplicates(leads: Lead[], c: { companyName?: string; contactEmail?: string; contactPhone?: string }, excludeId?: string): Lead[] {
  const company = norm(c.companyName);
  const email = norm(c.contactEmail);
  const phone = (c.contactPhone || '').replace(/\D/g, '').slice(-10);
  if (!company && !email && phone.length < 7) return [];
  return leads.filter(l => {
    if (l.id === excludeId) return false;
    if (company && norm(l.companyName) === company) return true;
    if (email && norm(l.contactEmail) === email) return true;
    if (phone.length >= 7 && (l.contactPhone || '').replace(/\D/g, '').slice(-10) === phone) return true;
    return false;
  });
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(leads: Lead[]): string {
  const cols: [string, (l: Lead) => unknown][] = [
    ['Company', l => l.companyName],
    ['Contact', l => l.contactName],
    ['Title', l => l.contactTitle],
    ['Email', l => l.contactEmail],
    ['Phone', l => l.contactPhone],
    ['Address', l => l.address],
    ['Industry', l => l.industry],
    ['Services', l => (l.serviceLines || []).join('; ')],
    ['Stage', l => STAGE_LABELS[l.stage]],
    ['Source', l => sourceLabel(l.source)],
    ['Owner', l => l.assignedToName || l.assignedTo],
    ['Est. Value', l => l.estimatedValue || 0],
    ['Probability %', l => probabilityOf(l)],
    ['Weighted', l => Math.round(weightedValue(l))],
    ['Expected Close', l => l.expectedCloseDate],
    ['Next Step', l => l.nextStep],
    ['Follow-Up', l => l.followUpDate],
    ['Lost Reason', l => [l.lostReasonCategory, l.lostReason].filter(Boolean).join(' — ')],
    ['Created', l => l.createdAt?.slice(0, 10)],
    ['Last Touch', l => lastTouch(l)?.slice(0, 10)],
  ];
  const rows = [cols.map(c => c[0]), ...leads.map(l => cols.map(c => c[1](l)))];
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
