/**
 * Estimating — the AAROMACH Sales Estimating Toolkit (v3 workbook) in the app.
 *
 *  - Service catalog: the Rate Sheet (code, unit, low / target / high price,
 *    base material cost, tech hours and other direct cost per unit).
 *  - Assumptions: wage, labor burden, margin target and floor, material
 *    uplift… editable in Assets & Materials → Service catalog.
 *  - Margin math, same as the Quote Builder tab:
 *      direct cost / unit = material × (1 + uplift) + tech hrs × wage × (1 + burden) + other
 *      sell / unit        = catalog target price × price adjustment (1.10 = +10%)
 *      GM %               = (sell − cost) / sell; ≥ target on target, < floor needs approval
 *  - Site walks: the step-by-step walkthrough a tech (on site with a tablet,
 *    or remote from plans) fills in. Quantities only — pricing happens on
 *    admin review, which turns an approved walk into a draft quote.
 */

// ── Catalog & assumptions ─────────────────────────────────────────────────────

export type CatalogService = {
  code: string;
  category: string;
  name: string;
  unit: string;
  priceLow: number;
  priceTarget: number;
  priceHigh: number;
  /** Base material cost / unit, before the uplift assumption. */
  materialCost: number;
  techHours: number;
  otherCost: number;
  note?: string;
  capability?: string;
  active?: boolean;
  /**
   * Hourly items can bill at one of the Labor rates (Labor rates & markups) instead
   * of their own price, so an hour of tech time has one price everywhere.
   */
  laborRateId?: string | null;
  /** Runtime only (resolveCatalog): the linked labor rate's name. */
  linkedRateLabel?: string;
};

export type EstimatingAssumptions = {
  wage: number;
  burdenPct: number;
  targetGmPct: number;
  floorGmPct: number;
  materialUpliftPct: number;
  taxPct: number;
  quoteValidityDays: number;
  homeState: string;
  serviceStates: string[];
  /** Drop calculator. */
  cableWastePct: number;
  defaultSlackFt: number;
  maxCopperRunFt: number;
  cableBoxFt: number;
  /** Quote boilerplate. */
  paymentTerms: string;
  exclusions: string;
  changeOrders: string;
  warranty: string;
};

export type EstimatingSettings = { assumptions: EstimatingAssumptions; services: CatalogService[] };

export const DEFAULT_ASSUMPTIONS: EstimatingAssumptions = {
  wage: 40,
  burdenPct: 25,
  targetGmPct: 45,
  floorGmPct: 35,
  materialUpliftPct: 10,
  taxPct: 0,
  quoteValidityDays: 30,
  homeState: 'MI',
  serviceStates: ['MI', 'IL', 'OH', 'IN', 'PA', 'WI'],
  cableWastePct: 10,
  defaultSlackFt: 12,
  maxCopperRunFt: 295,
  cableBoxFt: 1000,
  paymentTerms: 'Net 14 or Net 30. ACH, EFT or certified check. Deposit as agreed for this project.',
  exclusions: 'Permits, drywall/paint, lifts, after-hours access, ISP fees and licenses are excluded unless listed above. Fiber certification is excluded unless separately quoted (third party).',
  changeOrders: 'Unforeseen pathways or scope changes require written approval before the work is done.',
  warranty: 'Company-approved warranty only.',
};

type Row = [code: string, category: string, name: string, unit: string, low: number, target: number, high: number, material: number, hours: number, other: number, note: string, capability: string];
const ROWS: Row[] = [
  ['SVC-004', 'Hourly labor', 'Standard on-site technician', 'hour', 100, 115, 145, 0, 1, 0, 'Per technician; include minimum, travel and complexity', 'Advertised'],
  ['SVC-005', 'Hourly labor', 'Remote troubleshooting', 'hour', 85, 105, 130, 0, 1, 0, 'Confirm remote support coverage', 'Advertised'],
  ['SVC-006', 'Hourly labor', 'Advanced network configuration', 'hour', 125, 155, 200, 0, 1, 0, 'Only where qualified engineer available', 'Confirm depth'],
  ['SVC-007', 'Hourly labor', 'After-hours technician', 'hour', 150, 175, 225, 0, 1, 0, 'Require scheduling and authorization', 'Confirm availability'],
  ['SVC-008', 'Copper', 'CAT5e installed drop', 'drop', 125, 185, 300, 20, 1.2, 8, 'Typical accessible route, termination and basic test', 'Advertised'],
  ['SVC-009', 'Copper', 'CAT6 installed drop', 'drop', 150, 250, 400, 32.5, 1.6, 12.5, 'Define max routed length, access, testing and patch panel', 'Advertised'],
  ['SVC-010', 'Copper', 'CAT6A installed drop', 'drop', 200, 325, 500, 55, 2.1, 15, 'Thicker cable and higher termination effort', 'Advertised'],
  ['SVC-011', 'Copper', 'Third-party copper certification coordination', 'link', 45, 85, 150, 0, 1, 0, 'Certification performed by qualified external provider; external fees extra', 'Third-party only'],
  ['SVC-012', 'Copper', 'Patch panel install / terminate', '24 ports', 450, 750, 1300, 140, 3, 30, 'Clarify if cable terminations already included', 'Advertised'],
  ['SVC-013', 'Copper', 'Network rack cleanup', 'project', 400, 850, 1800, 100, 4, 35, 'Survey first; varies by cable volume', 'Advertised'],
  ['SVC-014', 'Fiber', 'Indoor fiber run with termination', 'run', 300, 650, 1200, 140, 5, 50, 'Distance, strands, pathway, optics and testing excluded unless specified', 'Advertised'],
  ['SVC-015', 'Fiber', 'Fiber fusion splice', 'splice', 35, 65, 120, 0, 1, 0, 'Mobilization and test equipment may dominate small jobs', 'Confirm method'],
  // Not in the v3 workbook — placeholder prices for the office to set.
  ['FIB-01', 'Fiber', 'Fusion splicer / fiber equipment mobilization', 'trip', 150, 250, 450, 0, 1, 75, 'Bringing out the fusion splicer and fiber test gear for a visit (placeholder price — set in Service catalog)', 'Operational'],
  ['SVC-016', 'Fiber', 'Third-party fiber certification coordination', 'link', 100, 200, 400, 0, 1, 0, 'Third-party OTDR/loss certification only; external fees extra', 'Third-party only'],
  ['SVC-017', 'Network', 'Router / firewall setup', 'device', 200, 350, 650, 45, 2.5, 25, 'Hardware, subscriptions and advanced security policies separate', 'Advertised'],
  ['SVC-018', 'Network', 'Managed switch install / configure', 'device', 200, 350, 650, 65, 2.5, 20, 'VLAN, PoE and network complexity affect scope', 'Advertised'],
  ['SVC-019', 'Network', 'Wi-Fi AP mount / configure', 'device', 150, 250, 400, 30, 1.8, 20, 'New cable drop and hardware separate', 'Advertised'],
  ['SVC-020', 'Network', 'Wi-Fi survey / assessment', 'site', 250, 500, 950, 20, 3.5, 40, 'Predictive vs physical survey must be specified', 'Advertised'],
  ['SVC-021', 'Network', 'Small-site network assessment', 'site', 250, 500, 850, 15, 3, 30, 'Define deliverables and written report', 'Advertised'],
  ['SVC-022', 'Devices', 'POS device connectivity / setup', 'device', 150, 250, 450, 15, 3, 35, 'Payment processor coordination may be needed', 'Advertised'],
  ['SVC-023', 'Devices', 'Printer / workstation integration', 'device', 100, 175, 300, 25, 1.5, 15, 'Software licenses and vendor support excluded', 'Advertised'],
  ['SVC-024', 'Security', 'IP camera cable / install labor', 'camera', 175, 325, 550, 15, 1.5, 10, 'Camera, NVR, lift and recording configuration separate', 'Confirm full scope'],
  ['SVC-025', 'AV', 'AV connection / display integration labor', 'device', 150, 275, 500, 65, 3.5, 35, 'Mounting structural/electrical work separately scoped', 'Confirm full scope'],
  ['SVC-026', 'Support', 'Preventative network care', 'site/month', 150, 300, 450, 35, 2.5, 30, 'Scope, included hours, response and exclusions required', 'Proposed offering'],
  ['SVC-027', 'Support', 'Managed network support', 'site/month', 400, 750, 1500, 20, 2, 15, 'Requires monitoring platform and defined SLA', 'Proposed offering'],
  ['TRV-01', 'Travel', 'Technician travel time', 'tech-hour', 85, 115, 155, 0, 1, 0, 'Billable technician travel; avoid duplication with labor', 'Operational'],
  ['TRV-02', 'Travel', 'Mileage / vehicle mobilization', 'mile', 1, 1.5, 2.25, 0, 0, 0.75, 'Round-trip billable miles', 'Operational'],
  ['TRV-03', 'Travel', 'Out-of-state mobilization fee', 'trip', 150, 350, 850, 0, 1, 100, 'Administrative/logistical mobilization; travel and lodging separate', 'Operational'],
  ['TRV-04', 'Travel', 'Lodging and per diem', 'day', 175, 250, 400, 0, 0, 140, 'Actual cost plus handling; document actuals', 'Operational'],
  ['ADM-01', 'Admin', 'Project administration / coordination', 'project', 125, 275, 650, 0, 2, 20, 'Scheduling, vendor coordination, document control', 'Operational'],
  ['ADM-02', 'Admin', 'Site survey / field assessment', 'site', 225, 450, 900, 0, 3, 25, 'On-site survey and basic scope report', 'Operational'],
  ['DOC-01', 'Documentation', 'Basic network topology diagram', 'diagram', 175, 350, 600, 0, 2.5, 25, 'Simple physical/logical diagram of small network', 'Documentation'],
  ['DOC-02', 'Documentation', 'Detailed network topology / VLAN map', 'diagram', 450, 850, 1500, 0, 7, 50, 'Multiple switches, VLANs, addressing, port mapping', 'Documentation'],
  ['DOC-03', 'Documentation', 'Complex multi-site / redundant topology', 'project', 1200, 2400, 5500, 0, 20, 150, 'Multi-site WAN, segmentation, failover and detailed documentation', 'Documentation'],
  ['DOC-04', 'Documentation', 'As-built cable / port schedule', 'site', 150, 325, 750, 0, 2.5, 25, 'Label map, port schedule and closeout documentation', 'Documentation'],
  ['CMP-01', 'Site conditions', 'Site complexity / difficult-access allowance', 'job', 150, 450, 1200, 0, 4, 50, 'Unusual pathways, congested ceilings, restricted access; scope clearly', 'Operational'],
  ['CMP-02', 'Site conditions', 'Lift / elevated-access coordination', 'day', 200, 400, 900, 0, 1, 220, 'Rental plus mobilization, operator and logistics as scoped', 'Operational'],
  ['CMP-03', 'Site conditions', 'After-hours / restricted-access mobilization', 'visit', 175, 350, 750, 0, 2, 75, 'Premium mobilization; avoid duplicate after-hours labor charges', 'Operational'],
  ['CMP-04', 'Site conditions', 'Conduit / pathway modification', 'hour', 125, 175, 275, 25, 1, 15, 'Low-voltage pathway work only; verify permits and licensing', 'Operational'],
  ['CHG-01', 'Admin', 'Approved scope change / additional work', 'hour', 100, 135, 200, 15, 1, 10, 'Written change order; use for actual added work, not hidden fee', 'Change order'],
  ['TST-01', 'Testing', 'Basic cable verification / labeling', 'link', 20, 40, 80, 3, 0.3, 3, 'Continuity/wiremap; not standards certification', 'Testing'],
  ['TST-02', 'Testing', 'Third-party certification pass-through', 'job', 300, 650, 1500, 0, 1, 300, 'Placeholder only: obtain external vendor quote', 'Testing'],
  ['LOG-01', 'Admin', 'Shipping / freight / procurement', 'order', 35, 95, 250, 0, 0.5, 30, 'Actual shipping, receiving, and procurement handling', 'Operational'],
  ['DSP-01', 'Travel', 'Small-job dispatch / mobilization', 'visit', 125, 225, 400, 0, 1.5, 40, 'No minimum project size; covers mobilization', 'Operational'],
  ['PRM-01', 'Site conditions', 'Permit / compliance coordination', 'project', 125, 300, 750, 0, 2, 35, 'Permit fees charged separately; verify jurisdiction', 'Operational'],
  ['WST-01', 'Site conditions', 'Cable removal / disposal', 'hour', 90, 125, 190, 5, 1, 10, 'Existing cable removal and approved disposal', 'Operational'],
];

/** Monthly support is sold as a Service Plan (Billing), not from site walks. */
const DEFAULT_OFF = new Set(['SVC-026', 'SVC-027']);

export const DEFAULT_SERVICES: CatalogService[] = ROWS.map(([code, category, name, unit, priceLow, priceTarget, priceHigh, materialCost, techHours, otherCost, note, capability]) =>
  ({ code, category, name, unit, priceLow, priceTarget, priceHigh, materialCost, techHours, otherCost, note, capability, active: !DEFAULT_OFF.has(code) }));

/** Billed by the hour (hour, tech-hour…) — these can follow a labor rate. */
export const isHourlyUnit = (unit: string) => /hour|\bhr\b/i.test(unit || '');

type RateLike = { id: string; label: string; rate: number; unit: 'hour' | 'flat' };

/** Catalog with linked hourly items priced at their labor rate. */
export function resolveCatalog(services: CatalogService[], laborRates: RateLike[]): CatalogService[] {
  const rates = new Map(laborRates.filter(r => r.unit === 'hour' && r.rate > 0).map(r => [r.id, r]));
  return services.map(s => {
    const r = s.laborRateId ? rates.get(s.laborRateId) : undefined;
    return r ? { ...s, priceLow: r.rate, priceTarget: r.rate, priceHigh: r.rate, linkedRateLabel: r.label } : s;
  });
}

/** Which labor rate an hourly catalog item most likely is, by name. */
const RATE_HINTS: [RegExp, RegExp][] = [
  [/after.?hours/i, /after.?hours|overtime|emergency/i],
  [/remote/i, /remote/i],
  [/advanced|engineer/i, /advanced|engineer|senior|config/i],
  [/travel/i, /travel|drive/i],
  [/standard|on.?site/i, /standard|on.?site|field|technician|labor/i],
];
export function suggestLaborRate(s: Pick<CatalogService, 'name' | 'unit'>, laborRates: RateLike[]): RateLike | null {
  if (!isHourlyUnit(s.unit)) return null;
  const hourly = laborRates.filter(r => r.unit === 'hour');
  for (const [item, rate] of RATE_HINTS) {
    if (!item.test(s.name)) continue;
    const hits = hourly.filter(r => rate.test(r.label));
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function unitCost(s: Pick<CatalogService, 'materialCost' | 'techHours' | 'otherCost'>, a: EstimatingAssumptions): number {
  return r2((s.materialCost || 0) * (1 + a.materialUpliftPct / 100) + (s.techHours || 0) * a.wage * (1 + a.burdenPct / 100) + (s.otherCost || 0));
}

export type MarginStatus = 'on_target' | 'below_target' | 'below_floor' | 'none';
export function marginStatus(gmPct: number | null, a: EstimatingAssumptions): MarginStatus {
  if (gmPct == null) return 'none';
  if (gmPct >= a.targetGmPct) return 'on_target';
  if (gmPct >= a.floorGmPct) return 'below_target';
  return 'below_floor';
}
export const MARGIN_LABEL: Record<MarginStatus, string> = {
  on_target: 'On target', below_target: 'Below target', below_floor: 'Below floor — needs approval', none: '—',
};

// ── Site walks ───────────────────────────────────────────────────────────────

export type CableType = 'CAT5e' | 'CAT6' | 'CAT6A' | 'Fiber';
export const CABLE_TYPES: CableType[] = ['CAT5e', 'CAT6', 'CAT6A', 'Fiber'];
const DROP_CODE: Record<CableType, string> = { CAT5e: 'SVC-008', CAT6: 'SVC-009', CAT6A: 'SVC-010', Fiber: 'SVC-014' };

/** A group of identical drops measured together (one room, one row of desks…). */
export type DropRun = {
  id: string;
  label: string;
  qty: number;
  cable: CableType;
  /** Horizontal route, closet to outlet, along the pathway. */
  horizontalFt: number;
  /** Up and down: into the ceiling, down the wall, rack height. */
  verticalFt: number;
  /** Service loop + termination slack. */
  slackFt: number;
  plenum: boolean;
};

export const dropLength = (d: Pick<DropRun, 'horizontalFt' | 'verticalFt' | 'slackFt'>) =>
  Math.max(0, (Number(d.horizontalFt) || 0) + (Number(d.verticalFt) || 0) + (Number(d.slackFt) || 0));

export type DropTotals = Record<CableType, { drops: number; feet: number; withWaste: number; boxes: number; longest: number }>;
export function dropTotals(runs: DropRun[], a: EstimatingAssumptions): DropTotals {
  const t = Object.fromEntries(CABLE_TYPES.map(c => [c, { drops: 0, feet: 0, withWaste: 0, boxes: 0, longest: 0 }])) as DropTotals;
  runs.forEach(r => {
    const qty = Math.max(0, Math.round(Number(r.qty) || 0));
    const len = dropLength(r);
    const x = t[r.cable];
    x.drops += qty;
    x.feet += qty * len;
    x.longest = Math.max(x.longest, qty ? len : 0);
  });
  CABLE_TYPES.forEach(c => {
    const x = t[c];
    x.feet = Math.round(x.feet);
    x.withWaste = Math.round(x.feet * (1 + a.cableWastePct / 100));
    x.boxes = c === 'Fiber' || !x.withWaste ? 0 : Math.ceil(x.withWaste / (a.cableBoxFt || 1000));
  });
  return t;
}
/** Copper runs over the TIA 90 m (295 ft) channel limit. */
export const longRuns = (runs: DropRun[], a: EstimatingAssumptions) =>
  runs.filter(r => r.cable !== 'Fiber' && (Number(r.qty) || 0) > 0 && dropLength(r) > a.maxCopperRunFt);

export type SiteConditions = {
  buildingStatus: string;
  ceilingType: string;
  ceilingHeightFt: number;
  floors: number;
  difficultAccess: boolean;
  liftNeeded: boolean;
  liftDays: number;
  afterHours: boolean;
  afterHoursVisits: number;
  permitRequired: boolean;
  removeExisting: boolean;
  removalHours: number;
  pathwayWork: boolean;
  pathwayHours: number;
  unionSite: boolean;
  roundTripMiles: number;
  travelHours: number;
  lodgingNights: number;
  accessNotes: string;
};

export const BUILDING_STATUSES = ['Occupied', 'New construction', 'Renovation', 'Vacant'];
export const CEILING_TYPES = ['Drop / grid', 'Hard lid', 'Open deck', 'Mixed'];

/** Service areas a walk can cover — chips on step 1; they decide what's asked next. */
export const WALK_AREAS = [
  { key: 'cabling', label: 'Copper cabling', categories: ['Copper'] },
  { key: 'fiber', label: 'Fiber', categories: ['Fiber'] },
  { key: 'network', label: 'Network', categories: ['Network'] },
  { key: 'wifi', label: 'Wi-Fi', categories: ['Network'] },
  { key: 'cameras', label: 'Cameras', categories: ['Security'] },
  { key: 'av', label: 'AV', categories: ['AV'] },
  { key: 'devices', label: 'POS / devices', categories: ['Devices'] },
  { key: 'support', label: 'Support / troubleshooting', categories: ['Support', 'Labor'] },
] as const;
export type WalkArea = typeof WALK_AREAS[number]['key'];

/** One-tap counts per area on the Equipment step. */
export const QUICK_ITEMS: Record<WalkArea, { code: string; label: string }[]> = {
  cabling: [{ code: 'SVC-012', label: 'Patch panels (24-port)' }, { code: 'SVC-013', label: 'Rack cleanup' }, { code: 'TST-01', label: 'Verify / label links' }],
  fiber: [{ code: 'SVC-015', label: 'Fusion splices' }, { code: 'SVC-016', label: '3rd-party fiber cert. links' }],
  network: [{ code: 'SVC-017', label: 'Routers / firewalls' }, { code: 'SVC-018', label: 'Managed switches' }, { code: 'DOC-01', label: 'Basic topology diagram' }],
  wifi: [{ code: 'SVC-019', label: 'Access points' }, { code: 'SVC-020', label: 'Wi-Fi survey' }],
  cameras: [{ code: 'SVC-024', label: 'Cameras' }],
  av: [{ code: 'SVC-025', label: 'Displays / AV devices' }],
  devices: [{ code: 'SVC-022', label: 'POS devices' }, { code: 'SVC-023', label: 'Printers / workstations' }],
  support: [{ code: 'SVC-004', label: 'On-site tech hours' }, { code: 'SVC-005', label: 'Remote hours' }, { code: 'SVC-006', label: 'Advanced config hours' }],
};

/** Service Matrix discovery questions, by area. */
export const DISCOVERY: Record<WalkArea | 'general', string[]> = {
  general: [
    'What is the preferred start date, and how urgent is the job?',
    'Are drawings, bid deadlines or low-voltage specs available?',
    'Any vendor onboarding or PO requirements?',
  ],
  cabling: ['Does the spec require a manufacturer system warranty?', 'Where are the MDF / IDF closets, and is there rack space and power?'],
  fiber: ['What endpoints, distance, strand count and fiber type?', 'Is formal certification or OTDR results required? (third party only)'],
  network: ['ISP, number of users, VLANs, PoE devices and uptime requirements?', 'Standardizing on a vendor (Cisco, Meraki, Aruba, Fortinet, Ubiquiti…)?'],
  wifi: ['What devices connect, and do people roam between areas (phones, scanners)?'],
  cameras: ['Is the recording system (NVR) already selected? Where does it go, and how many days of recording?'],
  av: ['Which displays, mounting and signal standards?'],
  devices: ['Which POS vendor, and who controls payment processing?', 'How many devices, and who manages software credentials?'],
  support: ['What fails, how often, and what is the business impact?', 'What hours and response time do they need?'],
};

export type WalkLine = {
  id: string;
  code: string;
  qty: number;
  notes?: string;
  /** Where it came from: the drop calculator, site conditions, or added by hand. */
  source: 'drops' | 'conditions' | 'manual' | 'addon';
  /** Review only: unchecked by the walker — shown grayed, not sent. */
  excluded?: boolean;
  /** Admin review only: 1 = catalog target, 1.10 = +10%, 0.95 = −5%. */
  priceFactor?: number;
};

export type WalkPhoto = { url: string; storagePath: string; name: string; caption?: string };

export type SiteWalkStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'archived';

export type SiteWalk = {
  id: string;
  status: SiteWalkStatus;
  mode: 'on_site' | 'remote';
  customerCompany: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  siteName: string;
  siteAddress: string;
  siteState: string;
  walkDate: string;
  areas: WalkArea[];
  conditions: SiteConditions;
  drops: DropRun[];
  /** Equipment / services added on the walk (drop and condition lines are derived). */
  manualLines: WalkLine[];
  /** Condition lines the walker turned off. */
  skippedSuggestions: string[];
  answers: Record<string, string>;
  photos: WalkPhoto[];
  scopeNotes: string;
  /** Snapshot built on submit; admin edits these on review. */
  lines: WalkLine[];
  leadId?: string | null;
  clientId?: string | null;
  /** The client's existing site, when picked (else the address is typed). */
  siteId?: string | null;
  /** Site step: "New network drops needed?" — the Drops step shows only on yes. */
  needsDrops?: boolean | null;
  /** Devices step: count, where, and who supplies the hardware, per device type. */
  devices?: Partial<Record<DeviceKey, DeviceEntry>>;
  /** Checks step: Wi-Fi tests and troubleshooting notes. */
  tests?: Partial<WalkTests>;
  /** Yes/no add-ons and labor hours asked on the steps. */
  extras?: Partial<WalkExtras>;
  /** Where the walker left off (reopening resumes here). */
  lastStep?: string;
  /** Add-on services picked on Review: catalog code → quantity. */
  addOns?: Record<string, number>;
  /** Lines unchecked on Review (kept visible, grayed, not sent). */
  excludedLines?: string[];
  assignedTechId?: string | null;
  assignedTechName?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  returnNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  quoteId?: string | null;
};

export const emptyConditions = (): SiteConditions => ({
  buildingStatus: '', ceilingType: '', ceilingHeightFt: 0, floors: 1,
  difficultAccess: false, liftNeeded: false, liftDays: 1, afterHours: false, afterHoursVisits: 1,
  permitRequired: false, removeExisting: false, removalHours: 0, pathwayWork: false, pathwayHours: 0,
  unionSite: false, roundTripMiles: 0, travelHours: 0, lodgingNights: 0, accessNotes: '',
});

export const genLineId = () => Math.random().toString(36).slice(2, 10);

/** Lines the drop calculator produces: one per cable type (+ patch panels for copper). */
export function dropLines(runs: DropRun[], a: EstimatingAssumptions): WalkLine[] {
  const t = dropTotals(runs, a);
  const out: WalkLine[] = [];
  CABLE_TYPES.forEach(c => {
    const x = t[c];
    if (!x.drops) return;
    out.push({ id: `drops-${c}`, code: DROP_CODE[c], qty: x.drops, source: 'drops',
      notes: `${x.drops} × avg ${Math.round(x.feet / x.drops)} ft · ${x.withWaste.toLocaleString()} ft incl. ${a.cableWastePct}% waste${x.boxes ? ` (${x.boxes} × ${a.cableBoxFt} ft box${x.boxes > 1 ? 'es' : ''})` : ''}` });
  });
  const copper = t.CAT5e.drops + t.CAT6.drops + t.CAT6A.drops;
  if (copper) out.push({ id: 'drops-panels', code: 'SVC-012', qty: Math.ceil(copper / 24), source: 'drops', notes: `${copper} copper ports` });
  return out;
}

/** Lines suggested from site conditions and travel. */
export function conditionLines(c: SiteConditions, siteState: string, a: EstimatingAssumptions): WalkLine[] {
  const out: WalkLine[] = [];
  const add = (key: string, code: string, qty: number, notes: string) => { if (qty > 0) out.push({ id: `cond-${key}`, code, qty, source: 'conditions', notes }); };
  if (c.difficultAccess) add('complex', 'CMP-01', 1, 'Difficult access / congested pathways');
  if (c.liftNeeded) add('lift', 'CMP-02', Math.max(1, c.liftDays || 1), `Lift needed${c.ceilingHeightFt ? ` — ${c.ceilingHeightFt} ft ceiling` : ''}`);
  if (c.afterHours) add('afterhours', 'CMP-03', Math.max(1, c.afterHoursVisits || 1), 'After-hours / restricted access');
  if (c.permitRequired) add('permit', 'PRM-01', 1, 'Permit / compliance');
  if (c.removeExisting) add('removal', 'WST-01', c.removalHours || 0, 'Remove existing cable');
  if (c.pathwayWork) add('pathway', 'CMP-04', c.pathwayHours || 0, 'Conduit / pathway modification');
  add('miles', 'TRV-02', Math.round(c.roundTripMiles || 0), 'Round-trip miles');
  add('travel', 'TRV-01', c.travelHours || 0, 'Travel time');
  if (siteState && siteState !== a.homeState) add('oos', 'TRV-03', 1, `Out of state (${siteState})`);
  add('lodging', 'TRV-04', c.lodgingNights || 0, 'Lodging / per diem nights');
  return out;
}

/** Every line on the walk right now: derived + hand-added (skipped suggestions removed). */
type LineSource = Pick<SiteWalk, 'drops' | 'conditions' | 'siteState' | 'manualLines' | 'skippedSuggestions' | 'needsDrops' | 'areas' | 'devices' | 'extras' | 'addOns' | 'excludedLines'>;

/** Every line the walk produces, with `excluded` set on the ones unchecked on Review. */
export function walkCandidateLines(w: LineSource, a: EstimatingAssumptions): WalkLine[] {
  // Unchecked lines; "skippedSuggestions" is the older name for the same thing.
  const off = new Set([...(w.excludedLines || []), ...(w.skippedSuggestions || [])]);
  // Older walks have no needsDrops answer: their drops still count.
  const drops = w.needsDrops === false ? [] : (w.drops || []);
  return [
    ...dropLines(drops, a),
    ...conditionLines(w.conditions, w.siteState, a),
    ...deviceLines(w),
    ...extraLines(w),
    ...addOnLines(w),
    ...(w.manualLines || []).filter(l => (Number(l.qty) || 0) > 0),
  ].map(l => (off.has(l.id) ? { ...l, excluded: true } : l));
}

/** The lines that go to the office: everything still checked. */
export function buildWalkLines(w: LineSource, a: EstimatingAssumptions): WalkLine[] {
  return walkCandidateLines(w, a).filter(l => !l.excluded).map(({ excluded: _e, ...l }) => l);
}

export type PricedLine = WalkLine & { service: CatalogService | null; sell: number; extended: number; cost: number; gp: number; gmPct: number | null };

export function priceLine(l: WalkLine, catalog: Map<string, CatalogService>, a: EstimatingAssumptions): PricedLine {
  const service = catalog.get(l.code) || null;
  const qty = Number(l.qty) || 0;
  const sell = service ? r2(service.priceTarget * (l.priceFactor ?? 1)) : 0;
  const extended = r2(sell * qty);
  const cost = service ? r2(unitCost(service, a) * qty) : 0;
  const gp = r2(extended - cost);
  return { ...l, service, sell, extended, cost, gp, gmPct: extended > 0 ? Math.round((gp / extended) * 1000) / 10 : null };
}

export function walkTotals(lines: PricedLine[], a: EstimatingAssumptions) {
  const subtotal = r2(lines.reduce((s, l) => s + l.extended, 0));
  const cost = r2(lines.reduce((s, l) => s + l.cost, 0));
  const gp = r2(subtotal - cost);
  const gmPct = subtotal > 0 ? Math.round((gp / subtotal) * 1000) / 10 : null;
  const tax = r2(subtotal * (a.taxPct || 0) / 100);
  return { subtotal, cost, gp, gmPct, tax, total: r2(subtotal + tax), status: marginStatus(gmPct, a) };
}

/** Plain-text scope for the quote: site, conditions, cabling takeoff, answers. */
export function walkScopeText(w: SiteWalk, a: EstimatingAssumptions): string {
  const c = w.conditions;
  const out: string[] = [];
  out.push(`Site walk ${w.walkDate || ''} (${w.mode === 'remote' ? 'remote' : 'on site'}) by ${w.createdByName}`.trim());
  const site = [w.siteName, w.siteAddress].filter(Boolean).join(', ');
  if (site) out.push(`Site: ${site}`);
  const cond = [c.buildingStatus, c.floors ? `${c.floors} floor(s)` : '', c.ceilingType ? `${c.ceilingType} ceiling${c.ceilingHeightFt ? ` @ ${c.ceilingHeightFt} ft` : ''}` : '',
    c.difficultAccess && 'difficult access', c.liftNeeded && 'lift required', c.afterHours && 'after-hours work', c.permitRequired && 'permit required', c.unionSite && 'union site']
    .filter(Boolean).join(', ');
  if (cond) out.push(`Conditions: ${cond}`);
  const t = dropTotals(w.drops || [], a);
  const cab = CABLE_TYPES.filter(k => t[k].drops).map(k => `${t[k].drops} ${k} ${k === 'Fiber' ? 'run' : 'drop'}${t[k].drops > 1 ? 's' : ''} (~${t[k].withWaste.toLocaleString()} ft)`);
  if (cab.length) out.push(`Cabling: ${cab.join(', ')}`);
  (w.drops || []).filter(d => d.qty).forEach(d => out.push(`  • ${d.label || 'Drops'}: ${d.qty} × ${d.cable}${d.plenum ? ' plenum' : ''}, ${dropLength(d)} ft each`));
  if (c.accessNotes) out.push(`Access: ${c.accessNotes}`);
  const devs = DEVICE_DEFS.filter(d => (w.areas || []).includes(d.area) && (Number(w.devices?.[d.key]?.count) || 0) > 0);
  if (devs.length) {
    out.push('Devices:');
    devs.forEach(d => { const e = w.devices![d.key]!; out.push(`  • ${e.count} × ${d.label}${e.locations ? ` — ${e.locations}` : ''}${e.supply ? ` (${SUPPLY_LABEL[e.supply]})` : ''}`); });
  }
  const tests = w.tests || {};
  const speed = [tests.downMbps ? `${tests.downMbps} down` : '', tests.upMbps ? `${tests.upMbps} up` : '', tests.pingMs ? `${tests.pingMs} ms ping` : ''].filter(Boolean).join(' / ');
  if (speed) out.push(`Speed test: ${speed} (Mbps)`);
  if (tests.wifiman) out.push(`WiFiman: ${tests.wifiman}`);
  if (tests.deadZones) out.push(`Weak / dead Wi-Fi areas: ${tests.deadZones}`);
  if (tests.symptoms) out.push(`Reported problem: ${tests.symptoms}`);
  const qa = Object.entries(w.answers || {}).filter(([, v]) => v?.trim());
  if (qa.length) { out.push('Discovery:'); qa.forEach(([q, v]) => out.push(`  • ${q} ${v.trim()}`)); }
  if (w.scopeNotes) out.push(`Notes: ${w.scopeNotes}`);
  return out.join('\n');
}

/** Terms block for the quote, from the assumptions. */
export const quoteTermsText = (a: EstimatingAssumptions) => [
  `PAYMENT TERMS: ${a.paymentTerms}`,
  `EXCLUSIONS: ${a.exclusions}`,
  `CHANGE ORDERS: ${a.changeOrders}`,
  `WARRANTY: ${a.warranty}`,
  `VALIDITY: ${a.quoteValidityDays} days.`,
].join('\n');


// ── Standardized walk questions (pages/site-walk) ────────────────────────────
// Every walk asks the same things for the same kind of job, and every answer
// maps to a catalog code, so the office prices walks the same way.

export type DeviceKey = 'firewall' | 'switch' | 'ap' | 'camera' | 'display' | 'pos' | 'workstation';
export type DeviceEntry = { count: number; locations: string; supply: 'us' | 'customer' | 'existing' | '' };
export const DEVICE_DEFS: { key: DeviceKey; area: WalkArea; label: string; code: string; where: string }[] = [
  { key: 'ap', area: 'wifi', label: 'Wi-Fi access points', code: 'SVC-019', where: 'Where each AP goes (room, ceiling height, mount)' },
  { key: 'switch', area: 'network', label: 'Network switches', code: 'SVC-018', where: 'Closet / rack, PoE needed?' },
  { key: 'firewall', area: 'network', label: 'Router / firewall', code: 'SVC-017', where: 'Where the ISP comes in' },
  { key: 'camera', area: 'cameras', label: 'Cameras', code: 'SVC-024', where: 'Indoor / outdoor, what each one covers' },
  { key: 'display', area: 'av', label: 'Displays / AV devices', code: 'SVC-025', where: 'Room, wall type, size' },
  { key: 'pos', area: 'devices', label: 'POS stations', code: 'SVC-022', where: 'Counter / register locations' },
  { key: 'workstation', area: 'devices', label: 'Printers / workstations', code: 'SVC-023', where: 'Desk / room' },
];
export const SUPPLY_LABEL: Record<Exclude<DeviceEntry['supply'], ''>, string> = {
  us: 'We supply it', customer: 'Customer supplies it', existing: 'Reusing existing',
};

export type WalkTests = { downMbps: number; upMbps: number; pingMs: number; wifiman: string; deadZones: string; symptoms: string };
export type WalkExtras = {
  rackCleanup: boolean;
  topology: 'none' | 'basic' | 'detailed';
  wifiSurvey: boolean;
  asBuilt: boolean;
  /** Troubleshooting / support: estimated tech hours on site and remote. */
  supportHours: number;
  remoteHours: number;
  configHours: number;
};

/** Areas whose work is counted on the Devices step. */
const DEVICE_AREAS: WalkArea[] = ['network', 'wifi', 'cameras', 'av', 'devices'];

/** The walk's steps, in order — Drops and Devices appear only when they apply. */
export type WalkStep = 'job' | 'site' | 'drops' | 'devices' | 'checks' | 'review';
export function walkSteps(w: Pick<SiteWalk, 'areas' | 'needsDrops'>): WalkStep[] {
  const areas = w.areas || [];
  return [
    'job', 'site',
    ...(w.needsDrops ? ['drops' as const] : []),
    ...(areas.some(a => DEVICE_AREAS.includes(a)) ? ['devices' as const] : []),
    'checks', 'review',
  ];
}
export const STEP_LABEL: Record<WalkStep, string> = {
  job: 'Job', site: 'Site', drops: 'Drops', devices: 'Devices', checks: 'Checks & photos', review: 'Review',
};

/** Device counts → catalog lines (only for the job types chosen). */
export function deviceLines(w: Pick<SiteWalk, 'areas' | 'devices'>): WalkLine[] {
  const areas = new Set(w.areas || []);
  return DEVICE_DEFS.flatMap(d => {
    const e = w.devices?.[d.key];
    const n = Math.round(Number(e?.count) || 0);
    if (!n || !areas.has(d.area)) return [];
    const notes = [e?.locations?.trim(), e?.supply ? SUPPLY_LABEL[e.supply] : ''].filter(Boolean).join(' · ');
    return [{ id: `dev-${d.key}`, code: d.code, qty: n, source: 'manual' as const, ...(notes ? { notes } : {}) }];
  });
}

/** Yes/no add-ons and hours → catalog lines. */
export function extraLines(w: Pick<SiteWalk, 'areas' | 'extras'>): WalkLine[] {
  const x = w.extras || {};
  const areas = new Set(w.areas || []);
  const out: WalkLine[] = [];
  const add = (key: string, code: string, qty: number, notes?: string) => { if (qty > 0) out.push({ id: `x-${key}`, code, qty, source: 'manual', ...(notes ? { notes } : {}) }); };
  if (x.rackCleanup) add('rack', 'SVC-013', 1, 'Rack / closet cleanup');
  if (areas.has('network') && x.topology === 'basic') add('topo', 'DOC-01', 1);
  if (areas.has('network') && x.topology === 'detailed') add('topo', 'DOC-02', 1);
  if (areas.has('wifi') && x.wifiSurvey) add('survey', 'SVC-020', 1);
  if (x.asBuilt) add('asbuilt', 'DOC-04', 1, 'Label map / port schedule');
  if (areas.has('network')) add('config', 'SVC-006', Number(x.configHours) || 0, 'Advanced configuration hours');
  if (areas.has('support')) {
    add('onsite', 'SVC-004', Number(x.supportHours) || 0, 'Estimated on-site hours');
    add('remote', 'SVC-005', Number(x.remoteHours) || 0, 'Estimated remote hours');
  }
  return out;
}


// ── Add-on services (Review step) ────────────────────────────────────────────
// The ten extras that most often get forgotten on a walk, straight from the
// service catalog. `areas` = the job types they usually go with (shown first);
// `qty` = a sensible starting quantity from what the walk already knows.
export const ADD_ONS: { code: string; label: string; hint: string; areas: WalkArea[]; qty?: (w: Pick<SiteWalk, 'drops' | 'needsDrops'>) => number }[] = [
  { code: 'TST-01', label: 'Test & label every link', hint: 'Continuity / wiremap and labels on each drop', areas: ['cabling'],
    qty: w => (w.needsDrops === false ? 0 : (w.drops || []).filter(d => d.cable !== 'Fiber').reduce((n, d) => n + (Number(d.qty) || 0), 0)) },
  { code: 'SVC-015', label: 'Fiber fusion splices', hint: 'Per splice', areas: ['fiber'] },
  { code: 'FIB-01', label: 'Bring out the fusion splicer', hint: 'Splicer + fiber test gear, per visit', areas: ['fiber'] },
  { code: 'SVC-011', label: 'Third-party copper certification', hint: 'Per link — certified by an outside tester', areas: ['cabling'] },
  { code: 'SVC-016', label: 'Third-party fiber certification', hint: 'Per link — OTDR / loss testing by an outside tester', areas: ['fiber'] },
  { code: 'DOC-04', label: 'As-built label map / port schedule', hint: 'Closeout documentation', areas: ['cabling', 'fiber', 'network'] },
  { code: 'SVC-007', label: 'After-hours technician time', hint: 'Hours, when work must happen after hours', areas: [] },
  { code: 'ADM-01', label: 'Project coordination', hint: 'Scheduling, vendors, documents — larger jobs', areas: [] },
  { code: 'LOG-01', label: 'Shipping / procurement', hint: 'Per order we buy and receive', areas: ['network', 'wifi', 'cameras', 'av', 'devices'] },
  { code: 'DSP-01', label: 'Small-job dispatch', hint: 'Covers the trip on a small job', areas: ['support'] },
];

export function addOnLines(w: Pick<SiteWalk, 'addOns'>): WalkLine[] {
  return Object.entries(w.addOns || {}).filter(([, q]) => (Number(q) || 0) > 0)
    .map(([code, q]) => ({ id: `addon-${code}`, code, qty: Number(q), source: 'addon' as const }));
}

// ── Photo checklist (Checks step) ────────────────────────────────────────────
// The same photos on every walk of a kind, so the office can price from them.
export const PHOTO_CHECKLIST: Record<WalkArea | 'general', string[]> = {
  general: ['Building entrance / access', 'Where work happens (wide shot)'],
  cabling: ['MDF / IDF closet and rack', 'Ceiling space above the drop areas', 'Wall / desk where drops land'],
  fiber: ['Both ends of each fiber run', 'Existing fiber enclosure'],
  network: ['ISP modem / demarc', 'Existing switches and firewall'],
  wifi: ['WiFiman / speed test screenshot', 'Each planned AP spot'],
  cameras: ['View from each camera spot', 'NVR location'],
  av: ['Each display wall', 'Where the AV source sits'],
  devices: ['Each POS / register counter'],
  support: ['The failing equipment', 'Any error screens'],
};

/** One line under each step's title: what the tech does there. */
export const STEP_GUIDE: Record<WalkStep, string> = {
  job: 'Who it is for, where, and what kind of job. Pick every job type that applies — it decides the next questions.',
  site: 'Look at the building. Answer the drops question first, then the conditions that make the job harder or longer.',
  drops: 'Walk each route from the closet to the outlet. One row per group of identical drops.',
  devices: 'Count each kind of device, write where each one goes, and who supplies the hardware.',
  checks: 'Run the tests, take the listed photos, and answer the questions so the office can price without calling you.',
  review: 'Check every line. Uncheck anything the customer doesn\'t want, and add any extra services.',
};
