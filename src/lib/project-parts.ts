'use client';

import { useEffect, useState } from 'react';
import { deleteField, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Project, ProjectPart } from './types';

/**
 * Materials & parts added on a project carry our COST next to the sell price,
 * so they live in projectBilling/{projectId} — readable by office admins only
 * (firestore.rules). The project record itself is readable by the client and
 * the crew; parts used to sit there, which put our cost and markup within
 * reach of a client's browser.
 */

const ref = (projectId: string) => doc(db, 'projectBilling', projectId);
const clean = (parts: ProjectPart[]) => JSON.parse(JSON.stringify(parts)) as ProjectPart[];

/** Older projects still hold parts on the project record. */
const legacy = (project: Pick<Project, 'addedParts'>) => project.addedParts || [];

export async function readProjectParts(project: Pick<Project, 'id' | 'addedParts'>): Promise<ProjectPart[]> {
  const snap = await getDoc(ref(project.id));
  return snap.exists() ? ((snap.data().addedParts as ProjectPart[]) || []) : legacy(project);
}

export async function writeProjectParts(projectId: string, parts: ProjectPart[]): Promise<void> {
  await setDoc(ref(projectId), { projectId, addedParts: clean(parts), updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Live parts for a project (admin screens). Moves an older project's parts
 * off the project record the first time it's opened.
 */
export function useProjectParts(project: Pick<Project, 'id' | 'addedParts'> | null): ProjectPart[] {
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const id = project?.id;
  const old = project ? legacy(project) : [];
  useEffect(() => {
    if (!id) { setParts([]); return; }
    return onSnapshot(ref(id), snap => {
      if (snap.exists()) {
        setParts((snap.data().addedParts as ProjectPart[]) || []);
        // Moved already — make sure the copy on the project is gone.
        if (old.length) updateDoc(doc(db, 'projects', id), { addedParts: deleteField() }).catch(() => {});
        return;
      }
      setParts(old);
      if (old.length) {
        writeProjectParts(id, old)
          .then(() => updateDoc(doc(db, 'projects', id), { addedParts: deleteField() }))
          .catch(() => {});
      }
    }, () => setParts(old));
  }, [id, old.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return parts;
}

/** Move every older project's parts off the project record (admin, once). */
export function migrateLegacyParts(projects: Pick<Project, 'id' | 'addedParts'>[]): void {
  projects.filter(p => (p.addedParts || []).length).forEach(p => {
    getDoc(ref(p.id))
      .then(snap => (snap.exists() ? undefined : writeProjectParts(p.id, p.addedParts || [])))
      .then(() => updateDoc(doc(db, 'projects', p.id), { addedParts: deleteField() }))
      .catch(() => {});
  });
}
