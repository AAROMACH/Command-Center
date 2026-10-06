import { db } from './firebase';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { makeLeadActivityId } from './doc-ids';
import { STAGE_LABELS, type Stage } from './crm';
import type { Lead, LeadActivity } from './types';

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
