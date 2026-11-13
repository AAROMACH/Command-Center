/**
 * How-to guide for the in-app help assistant (api/assistant).
 *
 * Each guide is a click path the assistant can hand the user as steps:
 *  - `path`  — open this page (the walkthrough points at its sidebar link).
 *  - `click` — the visible label of the button / tab to press, EXACTLY as it
 *              appears on screen, so the walkthrough can highlight it.
 *  - steps with neither are instructions ("paste the details…").
 * When you rename a button or move a feature, update its guide here — the
 * assistant only knows what this file and the page list tell it.
 */

export type GuideStep = { say: string; path?: string; click?: string };
export type Guide = { id: string; portal: 'admin' | 'tech' | 'client' | 'sales'; title: string; keywords: string; steps: GuideStep[] };

export const APP_GUIDES: Guide[] = [
  // ── Admin: jobs & dispatch ────────────────────────────────────────────
  {
    id: 'import-jobs', portal: 'admin', title: 'Import jobs (Field Nation / pasted work orders)',
    keywords: 'import jobs paste work orders field nation bulk upload add many jobs',
    steps: [
      { say: 'Open Dispatch.', path: '/admin/dispatch' },
      { say: 'Click Import jobs (top right).', click: 'Import jobs' },
      { say: 'Paste the job details, one value per line, then continue to the review.' },
      { say: 'Review each row — skip duplicates, fix fields (double-click to edit) — then import.', click: 'Import Clean Rows' },
      { say: 'Imported jobs land in Dispatch → Unassigned, ready to assign.' },
    ],
  },
  {
    id: 'new-job', portal: 'admin', title: 'Create a single job by hand',
    keywords: 'new job create work order add job manual dispatch entry',
    steps: [
      { say: 'Open Dispatch.', path: '/admin/dispatch' },
      { say: 'Click New job.', click: 'New job' },
      { say: 'Pick the client and site, fill in the job, schedule and pay.' },
      { say: 'Save it.', click: 'Create Dispatch Entry' },
    ],
  },
  {
    id: 'assign-tech', portal: 'admin', title: 'Assign a technician to a job',
    keywords: 'assign tech technician dispatch unassigned give job to',
    steps: [
      { say: 'Open Dispatch.', path: '/admin/dispatch' },
      { say: 'Stay on the Unassigned tab.', click: 'Unassigned' },
      { say: "Find the job and click its Assign button, then pick the technician in Assign technician." },
    ],
  },
  {
    id: 'add-helper', portal: 'admin', title: 'Add a helper to a job',
    keywords: 'helper second tech additional technician crew add helper',
    steps: [
      { say: 'Open Assignments.', path: '/admin/assignments' },
      { say: 'Open the job.' },
      { say: 'In the Team section click Add helper and pick the tech.', click: 'Add helper' },
    ],
  },
  {
    id: 'build-route', portal: 'admin', title: 'Build a route and send it to a tech',
    keywords: 'route routes group jobs day plan send to tech map suggest',
    steps: [
      { say: 'Open Dispatch.', path: '/admin/dispatch' },
      { say: 'Open the Routes tab.', click: 'Routes' },
      { say: 'Click New route and name it.', click: 'New route' },
      { say: 'Add jobs to it (Add Jobs, or drag them in). Watch the warnings for spread-out jobs or tight times.', click: 'Add Jobs' },
      { say: 'Pick the tech in Assign technician — or click Suggest a tech for the best fits.', click: 'Suggest a tech' },
      { say: 'Send every route that has a tech and jobs.', click: 'Send to Assigned' },
    ],
  },
  {
    id: 'review-queue', portal: 'admin', title: 'Review imported jobs that need checking',
    keywords: 'review queue duplicates imported check flagged',
    steps: [
      { say: 'Open Dispatch.', path: '/admin/dispatch' },
      { say: 'Open the Review Queue tab and send each job to dispatch or archive it.', click: 'Review Queue' },
    ],
  },
  {
    id: 'service-request', portal: 'admin', title: 'Log or handle a client service request',
    keywords: 'service request intake client request call ticket approve reject',
    steps: [
      { say: 'Open Requests.', path: '/admin/requests' },
      { say: 'To log a new one click New Service Intake; to handle one, open it from the Requested tab.', click: 'Requested' },
      { say: 'Approve it into a job or quote, or reject it.' },
    ],
  },
  {
    id: 'schedule-view', portal: 'admin', title: "See the company schedule / who's working when",
    keywords: 'schedule calendar who is working today week',
    steps: [{ say: 'Open Schedule.', path: '/admin/calendar' }],
  },

  // ── Admin: sales & quotes ─────────────────────────────────────────────
  {
    id: 'new-quote', portal: 'admin', title: 'Create and send a quote',
    keywords: 'quote estimate proposal send quote new quote',
    steps: [
      { say: 'Open Quotes & Invoices.', path: '/admin/quotes' },
      { say: 'Click New quote, add the lines and customer.', click: 'New quote' },
      { say: 'From Drafts, send it.', click: 'Send quote' },
    ],
  },
  {
    id: 'review-site-walk', portal: 'admin', title: 'Review a site walk and turn it into a quote',
    keywords: 'site walk survey review approve quote from site walk missed items',
    steps: [
      { say: 'Open Quotes & Invoices.', path: '/admin/quotes' },
      { say: 'Open the Site walks tab and open the submitted walk.', click: 'Site walks' },
      { say: 'Check the lines — Check for missed items reads the notes for anything left off.', click: 'Check for missed items' },
      { say: 'Approve it to make a draft quote (or send it back to the tech).', click: 'Approve & create draft quote' },
    ],
  },
  {
    id: 'import-leads', portal: 'admin', title: 'Import sales leads',
    keywords: 'import leads crm prospects list spreadsheet',
    steps: [
      { say: 'Open CRM.', path: '/admin/crm' },
      { say: 'Click Import leads.', click: 'Import leads' },
    ],
  },
  {
    id: 'convert-project', portal: 'admin', title: 'Turn an accepted quote into a project',
    keywords: 'convert quote project accepted approved quote',
    steps: [
      { say: 'Open Quotes & Invoices.', path: '/admin/quotes' },
      { say: 'Open the Approved tab and click Convert to project on the quote.', click: 'Convert to project' },
    ],
  },

  // ── Admin: people, money, comms ───────────────────────────────────────
  {
    id: 'add-person', portal: 'admin', title: 'Add a technician, staff member or client user',
    keywords: 'add person new tech hire user invite account directory',
    steps: [
      { say: 'Open Directory.', path: '/admin/directory' },
      { say: 'Click Add person and fill in their details and role.', click: 'Add person' },
    ],
  },
  {
    id: 'time-off-requests', portal: 'admin', title: 'Approve time-off requests',
    keywords: 'time off pto vacation approve requests',
    steps: [
      { say: 'Open Directory.', path: '/admin/directory' },
      { say: 'Open Requests, then Time off.', click: 'Time off' },
    ],
  },
  {
    id: 'payroll', portal: 'admin', title: 'Review and pay weekly logs (payroll)',
    keywords: 'payroll pay techs weekly logs approve pay out audit',
    steps: [
      { say: 'Open Payroll.', path: '/admin/payroll/audit' },
      { say: 'Pick the week and tech, check each job, approve, then pay out.' },
    ],
  },
  {
    id: 'announcement', portal: 'admin', title: 'Send an announcement to techs or clients',
    keywords: 'announcement broadcast message everyone notify all',
    steps: [
      { say: 'Open Messages.', path: '/admin/messaging' },
      { say: 'Click New announcement and choose who gets it.', click: 'New announcement' },
    ],
  },

  // ── Tech ──────────────────────────────────────────────────────────────
  {
    id: 'tech-job-flow', portal: 'tech', title: 'Work a job: confirm, start trip, check in, check out, complete',
    keywords: 'check in check out on my way start trip confirm complete job status',
    steps: [
      { say: 'Open Assignments.', path: '/tech/assignments' },
      { say: 'Open the job.' },
      { say: 'Tap Confirm when you accept it.', click: 'Confirm' },
      { say: 'Tap Start trip when you leave for the site.', click: 'Start trip' },
      { say: 'Tap Check in when you arrive.', click: 'Check in' },
      { say: 'Tap Check out when you leave, then Mark complete when the work is done (photos and notes first).', click: 'Check out' },
    ],
  },
  {
    id: 'weekly-log', portal: 'tech', title: 'Submit your weekly log (to get paid)',
    keywords: 'weekly log submit pay timesheet hours week',
    steps: [
      { say: 'Open Logs.', path: '/tech/logs' },
      { say: "If this week has no log yet, click Start a weekly log.", click: 'Start a weekly log' },
      { say: 'Confirm each job on it, then submit (also on Dashboard → Submit weekly log).' },
    ],
  },
  {
    id: 'missing-job', portal: 'tech', title: 'Report a job missing from your log / dispute pay',
    keywords: 'missing job dispute pay wrong not on log',
    steps: [
      { say: 'Open Logs.', path: '/tech/logs' },
      { say: 'Open the week, then Report a missing job (or File a general dispute).', click: 'Report a missing job' },
    ],
  },
  {
    id: 'reimbursement', portal: 'tech', title: 'Add a receipt / reimbursement',
    keywords: 'receipt reimbursement expense bought materials gas parking',
    steps: [
      { say: 'Open Earnings.', path: '/tech/earnings' },
      { say: 'Click Add reimbursement and attach the receipt.', click: 'Add reimbursement' },
    ],
  },
  {
    id: 'log-trip', portal: 'tech', title: 'Log a trip / mileage',
    keywords: 'mileage trip miles drive log a trip',
    steps: [
      { say: 'Open Assignments.', path: '/tech/assignments' },
      { say: 'Use Log a trip from the job’s actions.', click: 'Log a trip' },
    ],
  },
  {
    id: 'site-walk', portal: 'tech', title: 'Do a site walk (survey for a quote)',
    keywords: 'site walk survey walkthrough quote measure drops',
    steps: [
      { say: 'Open Site Walks.', path: '/tech/site-walks' },
      { say: 'Click New site walk and follow the steps; submit at Review.', click: 'New site walk' },
    ],
  },
  {
    id: 'time-off', portal: 'tech', title: 'Request time off',
    keywords: 'time off vacation sick day pto request off',
    steps: [
      { say: 'Open your Profile.', path: '/tech/profile' },
      { say: 'Click Request time off.', click: 'Request time off' },
    ],
  },
  {
    id: 'my-pay', portal: 'tech', title: 'See your pay',
    keywords: 'pay earnings paystub how much paid',
    steps: [{ say: 'Open Earnings — Weekly pay shows each week.', path: '/tech/earnings' }],
  },
  {
    id: 'sop', portal: 'tech', title: 'Read company procedures (SOP / handbook)',
    keywords: 'sop handbook procedure manual safety how to policy',
    steps: [{ say: 'Open SOP.', path: '/tech/sop' }],
  },

  // ── Client ────────────────────────────────────────────────────────────
  {
    id: 'client-request', portal: 'client', title: 'Request service',
    keywords: 'request service ticket problem broken need help new request',
    steps: [
      { say: 'Open Requests.', path: '/client/tickets' },
      { say: 'Click New service request, describe it, then Send request.', click: 'New service request' },
    ],
  },
  {
    id: 'client-quote', portal: 'client', title: 'Accept or decline a quote',
    keywords: 'quote accept decline approve estimate',
    steps: [
      { say: 'Open Quotes.', path: '/client/quotes' },
      { say: 'Open the quote and click Accept quote (or Decline quote).', click: 'Accept quote' },
    ],
  },
  {
    id: 'client-invoices', portal: 'client', title: 'See and pay invoices',
    keywords: 'invoice bill pay billing',
    steps: [{ say: 'Open Billing.', path: '/client/financials' }],
  },
];

/** Guides as compact text for the model. */
export function guideText(guides: Guide[]): string {
  return guides.map(g =>
    `[${g.id}] ${g.title} (${g.portal})\n` + g.steps.map((s, i) =>
      `  ${i + 1}. ${s.say}${s.path ? ` {path:${s.path}}` : ''}${s.click ? ` {click:"${s.click}"}` : ''}`).join('\n'),
  ).join('\n');
}
