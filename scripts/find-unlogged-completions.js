// scripts/find-unlogged-completions.js
//
// READ-ONLY report: every completed job (assignments + workOrders) that is not
// on its technician's weekly log, i.e. never reached payroll. Same rules as
// Payroll Audit → Unlogged (src/lib/weekly-log-audit.ts) — use this to pull
// the list before that tab is deployed.
//
//   node scripts/find-unlogged-completions.js > unlogged.csv
//
// Credentials (read-only service account recommended — Cloud Datastore Viewer):
//   - FIREBASE_SERVICE_ACCOUNT_B64 env var: the key JSON, base64-encoded, or
//   - serviceAccountKey.json in the repo root (gitignored), same as import.js.
// Writes nothing to Firestore.

const admin = require('firebase-admin');
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  ? JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
  : require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const isArchived = j => !!j.archived || j.status === 'archived';

function completionSource(job) {
  const history = [...(job.history || [])].reverse();
  for (const h of history) {
    const d = String((h && h.details) || '');
    if (/^Force-completed/i.test(d)) return 'Admin force-complete (not filed)';
    if (/^Mark Complete at/i.test(d)) return 'Tech calendar "Mark Complete"';
    if (/Mission finalized/i.test(d)) return 'Tech completion - week prompt dismissed or filing failed';
    if (/Status update to COMPLETED/i.test(d)) return 'Tech dashboard completion - filing skipped';
  }
  return null; // never explicitly marked complete in the app
}

function parseDate(s) {
  if (!s) return 0;
  const p = String(s).split(/[-/]/);
  if (p.length !== 3) return 0;
  const d = p[0].length === 4 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(+p[2], +p[0] - 1, +p[1]);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function weekOf(s) {
  const t = parseDate(s);
  if (!t) return '';
  const d = new Date(t);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`;
}

async function main() {
  const [asmtSnap, woSnap, logSnap, userSnap] = await Promise.all([
    db.collection('assignments').get(),
    db.collection('workOrders').get(),
    db.collection('weeklyLogs').get(),
    db.collection('users').get(),
  ]);

  const names = new Map(userSnap.docs.map(d => [d.id, d.data().name || d.data().fullName || d.id]));

  const jobs = new Map();
  woSnap.docs.forEach(d => jobs.set(d.id, { ...d.data(), id: d.id, _coll: 'workOrders' }));
  asmtSnap.docs.forEach(d => jobs.set(d.id, { ...d.data(), id: d.id, _coll: 'assignments' }));

  const loggedByTech = new Map();
  const reportedExtByTech = new Map();
  const normExt = v => String(v == null ? '' : v).trim().replace(/\s+/g, '').replace(/^wo-/i, '').toLowerCase();
  const jobExt = j => normExt(j.externalWorkOrderId || (j.source === 'Imported' ? (j.workOrderId || j.id) : ''));
  const firstTechForId = new Map();
  logSnap.docs.forEach(d => {
    const log = d.data();
    if (!log.techId) return;
    const set = loggedByTech.get(log.techId) || new Set();
    const ids = [
      ...(log.items || []).map(i => i.workOrderId),
      ...(log.missingAssignmentReports || []).map(r => r.assignmentId),
    ].filter(Boolean);
    ids.forEach(id => { set.add(id); if (!firstTechForId.has(id)) firstTechForId.set(id, log.techId); });
    loggedByTech.set(log.techId, set);
    const ext = reportedExtByTech.get(log.techId) || new Set();
    (log.missingAssignmentReports || []).forEach(r => { const n = normExt(r.externalWorkOrderId); if (n) ext.add(n); });
    reportedExtByTech.set(log.techId, ext);
  });

  // Same rule as Payroll Audit -> Unlogged (src/lib/weekly-log-audit.ts).
  // Every completed job not on its own tech's log is printed, with Listed =
  // YES only for the ones the tab shows; the rest carry the reason they're not.
  const techIdsOf = j => [...new Set([j.techId, j.assignedTechnicianId, ...(j.assignedTechIds || [])].filter(Boolean))];
  const rows = [];
  for (const job of jobs.values()) {
    if (job.status !== 'completed' || isArchived(job) || job.payrollExcluded) continue;
    const techIds = techIdsOf(job);
    if (techIds.length === 0) continue;
    const techId = job.assignedTechnicianId || techIds[0];
    const ids = [job.id, job.workOrderId].filter(Boolean);
    if (techIds.some(t => ids.some(id => loggedByTech.get(t) && loggedByTech.get(t).has(id)))) continue;
    const elsewhere = ids.map(id => firstTechForId.get(id)).find(Boolean);
    const ext = jobExt(job);
    const source = completionSource(job);
    let reason = '', reasonKey = '';
    if (elsewhere) { reason = `Already on ${names.get(elsewhere) || elsewhere}'s log`; reasonKey = "On another tech's log"; }
    else if (ext && techIds.some(t => reportedExtByTech.get(t) && reportedExtByTech.get(t).has(ext))) { reason = `Matches missing-job report WO ${ext.toUpperCase()}`; reasonKey = 'Matches a missing-job report'; }
    else if (!source) { reason = 'Never marked complete in app (test/seed data, import, or old record)'; reasonKey = 'Never marked complete in app'; }
    rows.push({ job, techId, source, reason, reasonKey, listed: !reason });
  }
  rows.sort((a, b) => (b.listed - a.listed) || (parseDate(b.job.scheduleDate) - parseDate(a.job.scheduleDate)));

  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const out = [['Listed', 'Assignment', 'Collection', 'Work Order', 'Title', 'Client', 'Technician', 'Schedule Date', 'Week Of', 'Pay', 'Marked Complete By', 'Not Listed Because'].map(esc).join(',')];
  for (const { job, techId, source, reason, listed } of rows) {
    out.push([
      listed ? 'YES' : 'no', job.id, job._coll, job.externalWorkOrderId || job.workOrderId || job.id, job.title, job.clientName,
      names.get(techId) || techId, job.scheduleDate, weekOf(job.scheduleDate), Number(job.pay) || 0,
      source || '', reason,
    ].map(esc).join(','));
  }
  console.log(out.join('\n'));

  const listed = rows.filter(r => r.listed);
  const total = listed.reduce((s, r) => s + (Number(r.job.pay) || 0), 0);
  console.error(`\n${listed.length} job(s) marked complete but on no weekly log · $${total.toFixed(2)} listed pay`);
  const byTech = new Map();
  listed.forEach(r => byTech.set(r.techId, (byTech.get(r.techId) || 0) + 1));
  [...byTech.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.error(`  ${names.get(t) || t}: ${n}`));
  const notListed = rows.filter(r => !r.listed);
  if (notListed.length) {
    console.error(`\n${notListed.length} other completed job(s) not listed:`);
    const byReason = new Map();
    notListed.forEach(r => byReason.set(r.reasonKey, (byReason.get(r.reasonKey) || 0) + 1));
    [...byReason.entries()].forEach(([k, n]) => console.error(`  ${n}  ${k}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
