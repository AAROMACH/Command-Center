import { db } from './firebase';
import { addDoc, collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import { buildProjectFromLead } from './crm-handoff';
import { NotificationService } from './notification-service';
import { makeLeadActivityId } from './doc-ids';
import { STAGE_LABELS, type Stage } from './crm';
import type { Lead, LeadActivity, Quote, SiteSurvey } from './types';

/** Writes an activity and bumps the lead's last-touch timestamps. */
export async function logLeadActivity(
  leadId: string,
  activity: Omit<LeadActivity, 'id' | 'leadId' | 'createdAt'>,
  touchLead = true,
): Promise<void> {
  const now = new Date().toISOString();
  const id = await makeLeadActivityId();
  // Firestore rejects undefined fields.
  const clean = Object.fromEntries(Object.entries(activity).filter(([, v]) => v !== undefined));
  await addDoc(collection(db, 'leadActivities'), { ...clean, id, leadId, createdAt: now });
  if (touchLead) {
    await updateDoc(doc(db, 'leads', leadId), { updatedAt: now, lastActivityAt: now });
  }
}

/**
 * Moves a lead to a new stage, stamping closedAt / stageChangedAt and leaving
 * an audit note in the timeline. `extra` carries stage-specific fields
 * (lost reason, final value).
 */
export async function changeLeadStage(
  lead: Lead,
  stage: Stage,
  userId: string,
  extra: Partial<Lead> = {},
): Promise<void> {
  if (stage === lead.stage && Object.keys(extra).length === 0) return;
  const now = new Date().toISOString();
  const closing = stage === 'won' || stage === 'lost';
  await updateDoc(doc(db, 'leads', lead.id), {
    ...extra,
    stage,
    updatedAt: now,
    stageChangedAt: now,
    ...(closing ? { closedAt: now } : {}),
  });
  let description = `Stage changed: ${STAGE_LABELS[lead.stage]} → ${STAGE_LABELS[stage]}`;
  if (stage === 'lost' && (extra.lostReasonCategory || extra.lostReason)) {
    description += ` (${[extra.lostReasonCategory, extra.lostReason].filter(Boolean).join(' — ')})`;
  }
  await logLeadActivity(lead.id, { type: 'note', description, createdBy: userId }, false);
}

/**
 * A quote written for a lead: link it, carry the quote total onto the deal,
 * and move early-stage leads to Proposal Sent.
 */
export async function syncLeadOnQuoteCreated(lead: Lead, quoteId: string, total: number, userId: string): Promise<void> {
  const early: Stage[] = ['new', 'contacted', 'qualified'];
  const extra: Partial<Lead> = { quoteIds: [...(lead.quoteIds || []), quoteId] };
  if (total > 0) extra.estimatedValue = total;
  if (early.includes(lead.stage)) {
    await changeLeadStage(lead, 'proposal_sent', userId, extra);
  } else {
    await updateDoc(doc(db, 'leads', lead.id), { ...extra, updatedAt: new Date().toISOString() });
  }
  await logLeadActivity(lead.id, {
    type: 'proposal',
    description: `Quote ${quoteId} created${total > 0 ? ` — $${Math.round(total).toLocaleString()}` : ''}`,
    createdBy: userId,
  });
}

/** Creates the ops project for a won deal and links it back. Returns the project id. */
export async function handOffToOps(lead: Lead, quotes: Quote[], userId: string, surveys: SiteSurvey[] = []): Promise<string> {
  if (lead.projectId) return lead.projectId;
  const quote = quotes
    .filter(q => (q.leadId === lead.id || (lead.quoteIds || []).includes(q.id)) && (q.status === 'approved' || q.status.startsWith('converted')))
    .sort((a, b) => (b.approvedAt || b.updatedAt || '').localeCompare(a.approvedAt || a.updatedAt || ''))[0];
  const projectId = await createDocId(ID_PREFIXES.PROJECT);
  await setDoc(doc(db, 'projects', projectId), { ...buildProjectFromLead(lead, { quote, surveys: surveys.filter(s => s.leadId === lead.id), createdBy: userId }), id: projectId });
  await updateDoc(doc(db, 'leads', lead.id), { projectId, updatedAt: new Date().toISOString() });
  await logLeadActivity(lead.id, { type: 'note', description: `Handed off to ops — project ${projectId} created (on hold)`, createdBy: userId }, false);
  // Fire-and-forget: the hand-off is done whether or not the alert lands.
  NotificationService.notifyAdmins(
    'New project from sales',
    `${lead.companyName} was won${lead.estimatedValue ? ` ($${Math.round(lead.estimatedValue).toLocaleString()})` : ''}${lead.assignedToName ? ` by ${lead.assignedToName}` : ''}.\nProject ${projectId} is on hold — assign a crew and set dates to kick it off.`,
    { id: projectId, type: 'project' },
  );
  return projectId;
}

/**
 * Deletes a lead and its timeline/tasks. Quotes, site surveys, the account
 * and any ops project are real records of their own and are left in place.
 */
export async function deleteLead(leadId: string): Promise<void> {
  const acts = await getDocs(query(collection(db, 'leadActivities'), where('leadId', '==', leadId)));
  for (let i = 0; i < acts.docs.length; i += 400) {
    const batch = writeBatch(db);
    acts.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'leads', leadId));
}
