/**
 * Aaromach glossary — from the Dispatch Glossary (Handbook folder) plus the
 * Operations Manual's abbreviations, Command Center terms and document IDs.
 *
 * `tip: true` terms get a pop-up definition wherever they appear in the
 * manual (first use per section). Keep tips to abbreviations and codes so
 * ordinary words aren't underlined.
 */
export type GlossaryTerm = { term: string; definition: string; tip?: boolean; aka?: string[]; sop?: string };
export type GlossaryGroup = { title: string; terms: GlossaryTerm[] };

export const GLOSSARY: GlossaryGroup[] = [
  {
    title: 'General job terms',
    terms: [
      { term: 'Break-fix', definition: 'Something broke (printer, switch, POS) and needs repair or replacement.' },
      { term: 'Closeout', definition: 'Photos, notes and the customer signature proving the job is complete.' },
      { term: 'Dispatch', definition: 'Sending a technician to a job — and the team that does it (SOP-DSP-001).' },
      { term: 'ETA / ETD', definition: 'Estimated time of arrival / departure.', tip: true, aka: ['ETA', 'ETD'] },
      { term: 'Escalation', definition: 'Raising a problem or delay to dispatch, the COO or the client when it can’t be solved in time.' },
      { term: 'POC', definition: 'Point of contact — the person the tech checks in and out with on site.', tip: true },
      { term: 'SOW', definition: 'Scope of work — what needs to be done.', tip: true },
      { term: 'Smart hands', definition: 'On-site help for a remote IT team (plugging in, rebooting, swapping gear).' },
      { term: 'Ticket', definition: 'Another word for a job or issue report.' },
      { term: 'Troubleshooting', definition: 'Finding out why something isn’t working and fixing it (SOP-TECH-003).' },
      { term: 'WO', definition: 'Work order — the official job assignment. "WO#" is its number.', tip: true, aka: ['WO#'] },
      { term: 'Change order', definition: 'Work outside the approved quote/scope. Needs customer and COO approval before it’s done.' },
      { term: 'Punch list', definition: 'Small items left to finish or fix after the main work.' },
    ],
  },
  {
    title: 'Cabling & hardware',
    terms: [
      { term: 'Cat5 / Cat6 / Cat6A', definition: 'Ethernet cable categories; Cat6A supports 10 Gb over the full 100 m.', tip: true, aka: ['Cat6A', 'Cat6', 'Cat5', 'CAT6', 'CAT5'] },
      { term: 'Conduit', definition: 'A pipe or tube that protects cables.' },
      { term: 'Drop', definition: 'A single cable run from the rack to a wall jack or device.' },
      { term: 'Data jack / keystone', definition: 'The wall port where the cable terminates.' },
      { term: 'J-hook', definition: 'A hook that supports cables in ceilings.' },
      { term: 'Patch cable', definition: 'Short network cable between devices or panel and switch.' },
      { term: 'Patch panel', definition: 'The panel in the rack where cable runs terminate.' },
      { term: 'RJ45', definition: 'The 8-pin connector used on Ethernet cables and jacks.', tip: true },
      { term: 'Slack', definition: 'Extra cable left at each end of a run — Aaromach leaves 20 ft total (10 ft each end) where applicable.' },
      { term: 'SFP', definition: 'Small form-factor pluggable — a swappable fiber/copper module in a switch port.', tip: true, aka: ['SFPs'] },
    ],
  },
  {
    title: 'Network & IT equipment',
    terms: [
      { term: 'AP', definition: 'Access point — gives Wi-Fi to an area.', tip: true },
      { term: 'Cradlepoint', definition: 'A router that uses cellular data instead of wired internet.' },
      { term: 'Ethernet', definition: 'Wired network connection between devices.' },
      { term: 'Firewall', definition: 'Protects the network from outside threats.' },
      { term: 'MDF / IDF', definition: 'Main / intermediate distribution frame — the network rooms where cabling connects.', tip: true, aka: ['MDF', 'IDF'] },
      { term: 'Router', definition: 'Connects the site’s network to the internet.' },
      { term: 'Switch', definition: 'Connects devices within the same network.' },
      { term: 'UPS', definition: 'Uninterruptible power supply — battery backup for network gear.', tip: true },
      { term: 'VLAN', definition: 'Virtual LAN — separates traffic on the same switch into different networks.', tip: true },
      { term: 'DHCP', definition: 'Hands out IP addresses automatically. A 169.254.x.x address means it failed.', tip: true },
      { term: 'DNS', definition: 'Turns names (like google.com) into IP addresses.', tip: true },
      { term: 'RSSI', definition: 'Wi-Fi signal strength; –65 dBm or better is good.', tip: true },
      { term: 'Wi-Fi', definition: 'Wireless network connection.' },
    ],
  },
  {
    title: 'Computers, phones & retail tech',
    terms: [
      { term: 'Imaging', definition: 'Copying a preconfigured setup (OS + programs) onto computers.' },
      { term: 'Peripheral devices', definition: 'Keyboards, mice, scanners and similar accessories.' },
      { term: 'Patch (software)', definition: 'A fix or improvement installed on software or an operating system.' },
      { term: 'POTS', definition: 'Plain old telephone service — analog line used for alarms, fax or older phones.', tip: true },
      { term: 'VoIP', definition: 'Voice over IP — phone service over the internet and network cable.', tip: true },
      { term: 'Digital signage', definition: 'Screens used for ads or menus.' },
      { term: 'KDS', definition: 'Kitchen display system — screen showing food orders.', tip: true },
      { term: 'POS', definition: 'Point of sale — registers, card readers and checkout touchscreens.', tip: true },
      { term: 'Site survey / site walk', definition: 'A visit to gather photos, quantities and measurements for a quote (Site Walks in Command Center).' },
    ],
  },
  {
    title: 'Testing & tools',
    terms: [
      { term: 'Butt set', definition: 'Handset used to test phone lines (often POTS).' },
      { term: 'Cable tester', definition: 'Checks that cables are wired and working correctly.' },
      { term: 'Multimeter', definition: 'Measures voltage, current and continuity.' },
      { term: 'PoE', definition: 'Power over Ethernet — power sent through the network cable (about 44–57 VDC).', tip: true },
      { term: 'Toner / tone & probe', definition: 'Tool used to trace where a cable runs.' },
      { term: 'VAC / VDC', definition: 'Volts AC (outlets) / volts DC (adapters, PoE).', tip: true, aka: ['VAC', 'VDC'] },
    ],
  },
  {
    title: 'Command Center & dispatch',
    terms: [
      { term: 'Command Center', definition: 'Aaromach’s operations app — jobs, schedules, photos, weekly logs, pay, quotes, invoices and this manual.' },
      { term: 'Field Nation (FN)', definition: 'Marketplace where some client work orders come from. FN labor pay is net of the platform fee.', tip: true, aka: ['FN'] },
      { term: 'On my way / Check in / Check out', definition: 'Job status taps in Command Center: leaving for the job, arrived, finished on site.' },
      { term: 'Helper', definition: 'A second tech on a job; helper pay is set by dispatch/payroll and paid as entered.' },
      { term: 'Verified', definition: 'Dispatch has checked a completed job’s photos, notes and sign-off; it’s ready for billing and payroll.' },
      { term: 'Weekly log', definition: 'A tech’s list of jobs, mileage and reimbursements for one week. Submitted Sat–Sun, approved by payroll, then paid.' },
      { term: 'WLOG', definition: 'Weekly log number (e.g. WLOG-042), shown at the top of each log.', tip: true },
      { term: 'ASMT', definition: 'Assignment number — a job assigned to a technician.', tip: true },
      { term: 'Hold (pay hold)', definition: 'Payroll holds a job’s pay (usually waiting on the customer); it’s paid on a later week.' },
      { term: 'Pay adjustment', definition: 'A correction to a tech’s pay after approval, paid on their next open log.' },
      { term: 'Payroll ticket', definition: 'A tech’s dispute after approval: incorrect pay, missing reimbursement or missing job.' },
      { term: 'QT- / INV- numbers', definition: 'Quote and invoice numbers: QT-MMDDYY-### and INV-MMDDYY-###.', tip: true, aka: ['QT-', 'INV-'] },
      { term: 'Deposit', definition: 'Amount due when a customer approves a quote; billed on a deposit invoice and taken off the final invoice.' },
      { term: 'Client / vendor', definition: 'The company giving Aaromach the job.' },
      { term: 'Subcontractor', definition: 'A tech who isn’t an Aaromach employee doing work for us — see Associate Technician (SOP-TECH-002).' },
      { term: 'Revision', definition: 'A re-upload of missing or corrected job info for the client.' },
    ],
  },
  {
    title: 'Safety',
    terms: [
      { term: 'OSHA 10', definition: 'Occupational Safety & Health Administration 10-hour safety certification.', tip: true, aka: ['OSHA'] },
      { term: 'PJRA', definition: 'Pre-Job Safety & Risk Assessment — the tailboard done before work starts (DOC-SAF-003).', tip: true, sop: 'pre-job-safety-risk-assessment-pjra' },
      { term: 'LOTO', definition: 'Lock-Out/Tag-Out — controlling hazardous energy before work (DOC-SAF-002).', tip: true, sop: 'lock-out-tag-out-loto-procedure' },
      { term: 'PPE', definition: 'Personal protective equipment — glasses, gloves, hard hat, vest.', tip: true },
      { term: 'PFAS', definition: 'Personal fall arrest system — harness, lanyard and anchor.', tip: true },
      { term: 'NFPA 70E', definition: 'The standard for electrical safety in the workplace (arc flash, approach boundaries).', tip: true },
      { term: 'Arc flash', definition: 'A dangerous electrical explosion of heat and light from a fault.' },
      { term: 'CPR / AHA', definition: 'Cardiopulmonary resuscitation; AHA = American Heart Association certification.', tip: true, aka: ['CPR', 'AHA'] },
      { term: 'Stop-work authority', definition: 'Anyone may stop the job if a risk is unclear or unsafe.' },
    ],
  },
  {
    title: 'Quality, business & management',
    terms: [
      { term: 'SLA', definition: 'Service level agreement — response and completion times promised to the client.', tip: true },
      { term: 'MSP', definition: 'Managed service provider — ongoing IT support for a monthly fee.', tip: true },
      { term: 'RMM', definition: 'Remote monitoring & management tool.', tip: true },
      { term: 'ISO 9001', definition: 'Quality management standard; Aaromach is self-declared compliant (DOC-ISO-001).', tip: true, sop: 'iso-9001-quality-guidelines-aaromach' },
      { term: 'QMS', definition: 'Quality management system — our policies, SOPs and records.', tip: true },
      { term: 'CAPA', definition: 'Corrective and preventive action — fixing a problem and stopping it recurring (DOC-ISO-004).', tip: true, sop: 'corrective-and-preventive-action' },
      { term: 'KPI', definition: 'Key performance indicator — a measured target.', tip: true, aka: ['KPIs'] },
      { term: 'RACI', definition: 'Responsible, Accountable, Consulted, Informed — who does what on a process.', tip: true },
      { term: 'MTTR', definition: 'Mean time to resolve a ticket.', tip: true },
      { term: 'CSAT', definition: 'Customer satisfaction score.', tip: true },
      { term: 'DSO', definition: 'Days sales outstanding — how long customers take to pay.', tip: true },
      { term: 'OKR', definition: 'Objectives and key results — quarterly goals with measurable results.', tip: true, aka: ['OKRs'] },
      { term: 'CapEx', definition: 'Capital expenditure — buying equipment or assets.', tip: true },
      { term: 'BOM', definition: 'Bill of materials — the parts list for a job.', tip: true },
      { term: 'PO', definition: 'Purchase order.', tip: true, aka: ['POs'] },
      { term: 'BANT', definition: 'Budget, Authority, Need, Timeline — how sales qualifies a lead.', tip: true },
      { term: 'BICSI', definition: 'Industry association that sets cabling design and installation standards.', tip: true },
      { term: 'NAICS', definition: 'North American Industry Classification System code for the business type.', tip: true },
      { term: 'E&O', definition: 'Errors & omissions (professional liability) insurance.', tip: true },
    ],
  },
  {
    title: 'Document IDs',
    terms: [
      { term: 'SOP-TECH-001', definition: 'Skilled Technicians SOP', tip: true, sop: 'skilled-technicians-sop' },
      { term: 'SOP-TECH-002', definition: 'Associate Technician SOP', tip: true, sop: 'associate-technician-sop' },
      { term: 'SOP-TECH-003', definition: 'Technician Troubleshooting Playbook', tip: true, sop: 'technician-troubleshooting-playbook' },
      { term: 'SOP-TECH-004', definition: 'Technician App Guide (Command Center)', tip: true, sop: 'technician-app-guide-command-center' },
      { term: 'SOP-PM-001', definition: 'Project Manager SOP', tip: true, sop: 'project-manager-sop' },
      { term: 'SOP-DSP-001', definition: 'Dispatch SOP', tip: true, sop: 'dispatch-sop' },
      { term: 'SOP-PAY-001', definition: 'Payroll SOP', tip: true, sop: 'payroll-sop' },
      { term: 'SOP-SALES-001', definition: 'Head of Sales SOP', tip: true, sop: 'head-of-sales-sop' },
      { term: 'SOP-COO-001', definition: 'Chief Operations Officer SOP', tip: true, sop: 'coo-sop' },
      { term: 'SOP-CEO-001', definition: 'Chief Executive Officer SOP', tip: true, sop: 'ceo-sop' },
      { term: 'DOC-SAF-001', definition: 'Safety & Health Manual (general, fall protection, electrical)', tip: true, sop: 'safety-health-manual' },
      { term: 'DOC-SAF-002', definition: 'Lock-Out/Tag-Out Procedure', tip: true, sop: 'lock-out-tag-out-loto-procedure' },
      { term: 'DOC-SAF-003', definition: 'Pre-Job Safety & Risk Assessment (PJRA)', tip: true, sop: 'pre-job-safety-risk-assessment-pjra' },
      { term: 'DOC-ISO-001', definition: 'ISO 9001 Quality Guidelines', tip: true, sop: 'iso-9001-quality-guidelines-aaromach' },
      { term: 'DOC-ISO-002', definition: 'Customer Focus Record', tip: true, sop: 'customer-focus-record-aaromach' },
      { term: 'DOC-ISO-003', definition: 'Risk & Opportunity Register', tip: true, sop: 'risk-opportunity-register' },
      { term: 'DOC-ISO-004', definition: 'Corrective & Preventive Action (CAPA) Record', tip: true, sop: 'corrective-and-preventive-action' },
      { term: 'DOC-ISO-005', definition: 'Management Review Record', tip: true, sop: 'management-review-record' },
      { term: 'DOC-ISO-006', definition: 'Internal Audit Form', tip: true, sop: 'internal-audit-form' },
      { term: 'DOC-MKT-001', definition: 'Vendor Capability Statement', tip: true, sop: 'vendor-capability-statement' },
    ],
  },
];

/** Glossary as a manual section (so it's in the Google Doc too). */
export function glossaryMarkdown(): string {
  return [
    '| | |\n| :-- | :-- |\n| **Document ID** | DOC-REF-001 |\n| **Version** | 1.0 |\n| **Effective date** | November 2026 |\n| **Owner** | COO |',
    'Terms, abbreviations and document IDs used across the manual and in Command Center. In the app, underlined terms show their definition when tapped.',
    ...GLOSSARY.map(g => `## ${g.title}\n\n| Term | Meaning |\n| :-- | :-- |\n${g.terms.map(t => `| **${t.term.replace(/\|/g, '/')}** | ${t.definition.replace(/\|/g, '/')} |`).join('\n')}`),
  ].join('\n\n');
}

/** Words that get a pop-up: term + aliases → the term's entry. Longest first so "Cat6A" wins over "Cat6". */
export const GLOSSARY_TIPS: { word: string; entry: GlossaryTerm }[] = GLOSSARY
  .flatMap(g => g.terms)
  .filter(t => t.tip)
  .flatMap(t => [t.term, ...(t.aka || [])].filter(w => !/[\s/]/.test(w) || /^(OSHA 10|ISO 9001|NFPA 70E)$/.test(w)).map(word => ({ word, entry: t })))
  .sort((a, b) => b.word.length - a.word.length);
