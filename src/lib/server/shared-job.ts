import 'server-only';

// Jobs and projects as clients and helper techs may see them: every pay,
// cost and payroll field removed. Database rules can't hide single fields, so
// those users get these records from the server (api/client/data,
// api/tech/helper-jobs) instead of reading the documents themselves.

const JOB_PRIVATE = [
  'pay', 'payType', 'finalPay', 'blendedFixedPay', 'blendedIncludedHours', 'blendedHourlyRate',
  'payChangeRequest', 'reimbursements', 'auditReimbursement', 'auditOverhead',
  'isAudited', 'auditedAt', 'auditedBy', 'fieldNationFeeRate', 'payrollExcluded',
  // Free-text history lines can mention pay changes ("pay $120 → $150").
  'history',
];
const PROJECT_PRIVATE = ['addedParts', 'actualBudget', 'projectBudget', 'actualHours', 'estimatedHours'];

const strip = (doc: Record<string, unknown>, keys: string[]) => {
  const out = { ...doc };
  for (const k of keys) delete out[k];
  return JSON.parse(JSON.stringify(out)); // Firestore Timestamps etc. → plain JSON
};

export const sharedJob = (id: string, data: Record<string, unknown>) => ({ ...strip(data, JOB_PRIVATE), id });
export const sharedProject = (id: string, data: Record<string, unknown>) => ({ ...strip(data, PROJECT_PRIVATE), id });
