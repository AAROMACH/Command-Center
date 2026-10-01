// scripts/find-unlogged-completions.js
//
// READ-ONLY report: every completed job (assignments + workOrders) that is not
// on its technician's weekly log, i.e. never reached payroll. Same rules as
// Payroll Audit → Unlogged (src/lib/weekly-log-audit.ts) — use this to pull
// the list before that tab is deployed.
//
//   node scripts/find-unlogged-completions.js > unlogged.csv
//
// Needs serviceAccountKey.json in the repo root (gitignored), same as import.js.
// Writes nothing to Firestore.

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const jobTechId = j => j.assignedTechnicianId || (j.assignedTechIds && j.assignedTechIds[0]) || j.techId || '';
const isArchived = j => !!j.archived || j.status === 'archived';

function completionSource(job) {
  const history = [...(job.history || [])].reverse();
  for (const h of history) {
    const d = String((h && h.details) || '');
    if (/^Force-completed/i.test(d)) return 'Admin force-complete (not filed)';
    if (/^Mark Complete at/i.test(d)) return 'Tech calendar "Mark Complete"';
    if (/Mission finalized/i.test(d)) return 'Tech completion - week prompt dismissed or filing failed';
    if (/Status update to COMPLETED/i.test(d)) return 'Tech dashboard completion - filing skipped';
    if (/Registry parameters adjusted/i.test(d)) return 'Admin edit (status set to Completed)';
  }
  return 'Unknown - no completion entry in history';
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
  });

  const rows = [];
  for (const job of jobs.values()) {
    if (job.status !== 'completed' || isArchived(job) || job.payrollExcluded) continue;
    const techId = jobTechId(job);
    if (!techId) continue;
    const own = loggedByTech.get(techId);
    const ids = [job.id, job.workOrderId].filter(Boolean);
    if (own && ids.some(id => own.has(id))) continue;
    const elsewhere = ids.map(id => firstTechForId.get(id)).find(Boolean);
    rows.push({ job, techId, elsewhere });
  }
  rows.sort((a, b) => parseDate(b.job.scheduleDate) - parseDate(a.job.scheduleDate));

  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const out = [['Assignment', 'Collection', 'Work Order', 'Title', 'Client', 'Technician', 'Schedule Date', 'Week Of', 'Pay', 'Likely Cause', 'Logged Under Other Tech'].map(esc).join(',')];
  for (const { job, techId, elsewhere } of rows) {
    out.push([
      job.id, job._coll, job.externalWorkOrderId || job.workOrderId || job.id, job.title, job.clientName,
      names.get(techId) || techId, job.scheduleDate, weekOf(job.scheduleDate), Number(job.pay) || 0,
      completionSource(job), elsewhere ? (names.get(elsewhere) || elsewhere) : '',
    ].map(esc).join(','));
  }
  console.log(out.join('\n'));

  const total = rows.reduce((s, r) => s + (Number(r.job.pay) || 0), 0);
  console.error(`\n${rows.length} completed job(s) not on their tech's weekly log · $${total.toFixed(2)} listed pay`);
  const byTech = new Map();
  rows.forEach(r => byTech.set(r.techId, (byTech.get(r.techId) || 0) + 1));
  [...byTech.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.error(`  ${names.get(t) || t}: ${n}`));
}

main().catch(err => { console.error(err); process.exit(1); });
