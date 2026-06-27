import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

type AuditEvent = {
  entityCollection: string;
  entityId: string;
  changedBy: string;
  changedByName: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
};

/**
 * Writes a single field-change audit entry to `auditLog/{entityId}/events`.
 * Call this alongside any Firestore updateDoc/setDoc that modifies business-critical fields.
 */
export async function auditFieldChange(
  entityCollection: string,
  entityId: string,
  changedBy: string,
  changedByName: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();
  const events: AuditEvent[] = [];

  for (const field of Object.keys(newValues)) {
    const oldVal = oldValues[field];
    const newVal = newValues[field];
    // Only log if the value actually changed
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    events.push({
      entityCollection,
      entityId,
      changedBy,
      changedByName,
      field,
      oldValue: oldVal ?? null,
      newValue: newVal ?? null,
      changedAt: now,
    });
  }

  if (events.length === 0) return;

  const logCollection = collection(db, 'auditLog', entityId, 'events');
  await Promise.all(events.map(ev => addDoc(logCollection, { ...ev, _serverTs: serverTimestamp() })));
}

/** Convenience: record a single explicit event (status transitions, deletions, etc.) */
export async function auditEvent(
  entityCollection: string,
  entityId: string,
  changedBy: string,
  changedByName: string,
  action: string,
  details?: string
): Promise<void> {
  const logCollection = collection(db, 'auditLog', entityId, 'events');
  await addDoc(logCollection, {
    entityCollection,
    entityId,
    changedBy,
    changedByName,
    field: '__action__',
    oldValue: null,
    newValue: action,
    details: details || null,
    changedAt: new Date().toISOString(),
    _serverTs: serverTimestamp(),
  });
}
