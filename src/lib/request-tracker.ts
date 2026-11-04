import type { Invoice, Project, Quote, ServiceRequest, WorkOrder } from './types';

/**
 * Request tracker — "where is my order": one progress bar per client request.
 *
 * Two tracks, decided by how the office handles the request:
 *  - Assignment (straight to a job, no quote):
 *      Received → Reviewed → Approved → Scheduled → In progress → Complete → Invoiced → Paid
 *  - Project (quoted first; the quote is what the project is invoiced from):
 *      Received → Reviewed → Quote sent → You approved → Project underway (fills with
 *      the project's task %) → Complete → Invoiced → Paid
 * Until the office picks one, the shared first stages show and the rest are "next".
 *
 * Each stage says who it's waiting on, so the bar never implies we're halfway
 * through the work when it's really waiting on the client's approval.
 */

export type StageState = 'done' | 'current' | 'upcoming' | 'stopped';
export type TrackerStage = {
  key: string;
  label: string;
  /** Bar position when this stage is reached. */
  pct: number;
  state: StageState;
  at?: string | null;
  /** While current: who has the next move. */
  waitingOn?: 'you' | 'us';
  detail?: string;
};
export type RequestTrack = {
  path: 'job' | 'project' | 'open';
  stages: TrackerStage[];
  pct: number;
  current: TrackerStage | null;
  declined: { reason: string; at?: string | null } | null;
};

export type TrackerLinks = {
  quote?: Quote | null;
  job?: WorkOrder | null;
  project?: Project | null;
  invoice?: Invoice | null;
};

const JOB_SCHEDULED = new Set(['assigned', 'confirmed', 'on-my-way', 'in-progress', 'checked-out', 'completed']);
const JOB_STARTED = new Set(['in-progress', 'checked-out', 'completed']);
const QUOTE_APPROVED = new Set(['approved', 'converted_to_project', 'converted_to_work_order', 'converted_to_invoice']);
const QUOTE_SENT = new Set(['sent', 'viewed', 'changes_requested', ...QUOTE_APPROVED]);
const INVOICE_SENT = new Set(['sent', 'paid', 'overdue']);

type Step = Omit<TrackerStage, 'state'> & { reached: boolean };

export function buildRequestTrack(req: ServiceRequest, links: TrackerLinks = {}): RequestTrack {
  const { quote, job, project, invoice } = links;
  const status = String(req.status || '');
  const declinedStatus = ['rejected', 'denied'].includes(status);
  const reviewed = !!req.reviewedAt || ['reviewed', 'approved', 'closed'].includes(status);
  const approved = !!req.approvedAt || status === 'approved' || status === 'closed';
  const path: RequestTrack['path'] = req.conversionType === 'project' || req.quoteId || quote || project ? 'project'
    : req.conversionType === 'assignment' || job ? 'job' : 'open';

  const steps: Step[] = [
    { key: 'received', label: 'Request received', pct: 10, reached: true, at: req.createdAt || req.submittedDate, waitingOn: 'us' },
    { key: 'reviewed', label: 'Under review', pct: 20, reached: reviewed, at: req.reviewedAt, waitingOn: 'us' },
  ];

  if (path === 'project') {
    const quoteSent = !!quote && QUOTE_SENT.has(quote.status);
    const quoteApproved = !!quote && QUOTE_APPROVED.has(quote.status);
    const prog = project ? projectTaskProgress(project) : null;
    const projectDone = project?.status === 'completed';
    steps.push(
      { key: 'quote', label: 'Quote sent', pct: 35, reached: quoteSent, at: quote?.sentAt, waitingOn: 'us',
        detail: quote ? `${quote.quoteNumber}${quote.total ? ` · $${Math.round(quote.total).toLocaleString()}` : ''}` : undefined },
      { key: 'client_ok', label: 'You approved the quote', pct: 50, reached: quoteApproved, at: quote?.approvedAt, waitingOn: 'you' },
      { key: 'underway', label: 'Project underway', reached: !!project && project.status !== 'on-hold',
        pct: 60 + Math.round(25 * ((prog?.pct ?? 0) / 100)), at: (project as { createdAt?: string } | null)?.createdAt || project?.startDate, waitingOn: 'us',
        detail: prog && prog.total ? `${prog.done} of ${prog.total} tasks done` : undefined },
      { key: 'complete', label: 'Work complete', pct: 85, reached: projectDone, at: (project as { completedAt?: string } | null)?.completedAt, waitingOn: 'us' },
    );
  } else {
    const jobStatus = job?.status || '';
    steps.push(
      { key: 'approved', label: 'Approved', pct: 30, reached: approved, at: req.approvedAt, waitingOn: 'us' },
      { key: 'scheduled', label: 'Scheduled', pct: 45, reached: JOB_SCHEDULED.has(jobStatus), at: (job as { assignedAt?: string } | null)?.assignedAt, waitingOn: 'us',
        detail: job?.scheduleDate ? `For ${job.scheduleDate}${job.scheduleTime ? ` at ${job.scheduleTime}` : ''}` : undefined },
      { key: 'in_progress', label: 'Work in progress', pct: 65, reached: JOB_STARTED.has(jobStatus), at: (job as { checkInAt?: string } | null)?.checkInAt, waitingOn: 'us' },
      { key: 'complete', label: 'Work complete', pct: 85, reached: jobStatus === 'completed', at: (job as { completedAt?: string } | null)?.completedAt, waitingOn: 'us' },
    );
  }
  steps.push(
    { key: 'invoiced', label: 'Invoiced', pct: 95, reached: !!invoice && INVOICE_SENT.has(invoice.status), at: (invoice as { sentAt?: string } | null)?.sentAt || invoice?.issueDate, waitingOn: 'us',
      detail: invoice ? `${invoice.invoiceNumber} · $${Math.round(invoice.total || 0).toLocaleString()}${invoice.dueDate ? ` · due ${invoice.dueDate}` : ''}` : undefined },
    { key: 'paid', label: 'Paid', pct: 100, reached: invoice?.status === 'paid', at: (invoice as { paidAt?: string } | null)?.paidAt, waitingOn: 'you' },
  );

  // A stage counts as done only if every stage before it is done too (data
  // can run ahead — e.g. a job scheduled before anyone clicked "reviewed").
  // Reaching a later stage implies the earlier ones happened.
  let lastReached = -1;
  steps.forEach((s, i) => { if (s.reached) lastReached = i; });
  const stages: TrackerStage[] = steps.map(({ reached: _r, ...s }, i) => ({
    ...s,
    state: i <= lastReached ? 'done' : i === lastReached + 1 ? (declinedStatus ? 'stopped' : 'current') : 'upcoming',
  }));
  // While the project is underway, its bar keeps filling with the task %.
  const underway = stages.find(s => s.key === 'underway');
  const currentIdx = stages.findIndex(s => s.state === 'current' || s.state === 'stopped');
  const pctNow = underway && underway.state === 'done' && stages[currentIdx]?.key === 'complete'
    ? underway.pct
    : lastReached >= 0 ? stages[lastReached].pct : 0;
  return {
    path,
    stages,
    pct: pctNow,
    current: currentIdx >= 0 ? stages[currentIdx] : null,
    declined: declinedStatus ? { reason: req.rejectionReason || 'No reason given.', at: req.closedAt || req.reviewedAt } : null,
  };
}

/** Same as components/project-views projectProgress, without the UI import. */
function projectTaskProgress(project: Project) {
  const tasks = (project.phases || []).flatMap(p => p.tasks || []).filter(Boolean);
  const done = tasks.filter(t => t.isCompleted).length;
  return { done, total: tasks.length, pct: tasks.length ? (done / tasks.length) * 100 : 0 };
}
