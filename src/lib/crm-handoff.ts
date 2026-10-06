import type { Lead, Phase, Quote } from './types';

/**
 * Won deal → project for ops. Pure (no Firestore) so the browser and the
 * public-quote API route build the exact same record.
 *
 * Projects are created ON HOLD: sales hands off, ops assigns the crew,
 * confirms dates and flips it active.
 */

const PHASE_TEMPLATE = ['Site Survey & Prep', 'Rough-In / Install', 'Terminate, Test & Label', 'Closeout & Documentation'];

/** Extra phases worth calling out for specific service lines. */
const SERVICE_PHASES: Record<string, string> = {
  'Cameras / CCTV': 'Camera Aim, NVR Config & Client Walkthrough',
  'Access Control': 'Panel Programming & Credential Enrollment',
  'AV': 'AV Programming & Commissioning',
  'Network Racks': 'Rack Build & Dress',
  'Wireless / Wi-Fi': 'AP Placement & Wireless Survey Validation',
  'Fiber': 'Fiber Splicing & OTDR Testing',
  'Industrial Automation': 'PLC / Controls Commissioning',
};

export function buildProjectPhases(serviceLines: string[] = []): Phase[] {
  const extras = serviceLines.map(s => SERVICE_PHASES[s]).filter(Boolean);
  const names = [...PHASE_TEMPLATE.slice(0, 3), ...extras, PHASE_TEMPLATE[3]];
  return names.map((name, i) => ({ id: `ph-${i + 1}`, phaseNumber: i + 1, name, tasks: [] }));
}

export function buildProjectFromLead(lead: Lead, opts: { quote?: Pick<Quote, 'id' | 'title' | 'scopeSummary' | 'description' | 'total'> | null; createdBy: string; now?: string }) {
  const now = opts.now || new Date().toISOString();
  const quote = opts.quote || null;
  const services = lead.serviceLines || [];
  const scope = [
    quote?.scopeSummary || quote?.description,
    services.length ? `Services: ${services.join(', ')}` : '',
    lead.notes ? `Sales notes: ${lead.notes}` : '',
    quote ? `From quote ${quote.id}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    name: quote?.title || [lead.companyName, services.join(' / ')].filter(Boolean).join(' — '),
    client: lead.companyName,
    location: lead.address || '',
    status: 'on-hold' as const,
    startDate: '',
    estimatedDuration: '',
    assignedTechnicianIds: [] as string[],
    team: [],
    phases: buildProjectPhases(services),
    scope,
    onsiteContactName: lead.contactName || '',
    onsiteContactPhone: lead.contactPhone || '',
    siteHazardNotes: [],
    projectBudget: quote?.total || lead.estimatedValue || 0,
    actualBudget: 0,
    actualHours: 0,
    // Handoff trail back to the deal.
    sourceLeadId: lead.id,
    sourceQuoteId: quote?.id || null,
    soldBy: lead.assignedToName || lead.assignedTo || '',
    handoffAt: now,
    handoffBy: opts.createdBy,
  };
}
