import 'server-only';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GoogleAuth } from 'google-auth-library';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { OPERATIONS_MANUAL, MANUAL_DOC_ID, type ManualSection } from '@/content/operations-manual';

/**
 * The Operations Manual's home: handbook/{sectionId} in Firestore (edited in
 * the app by Super Admins). The bundled copy in src/content seeds it the first
 * time. Every save re-publishes the whole manual to the Google Doc, so the Doc
 * is a mirror — edits made directly in the Doc are overwritten.
 *
 * Google Doc access: the server's service account must be an Editor on the Doc
 * and the Google Drive API must be enabled in the project. Status of the last
 * publish is in handbookMeta/sync.
 */
export type StoredSection = ManualSection & { order: number; updatedAt?: string; updatedBy?: string };

const fs = () => getFirestore(adminApp);

export async function loadManual(): Promise<StoredSection[]> {
  const snap = await fs().collection('handbook').get();
  if (snap.empty) return OPERATIONS_MANUAL.map((s, i) => ({ ...s, order: i }));
  return snap.docs.map(d => d.data() as StoredSection).sort((a, b) => a.order - b.order);
}

/** First save: copy the bundled manual into Firestore so edits have a home. */
async function seedIfEmpty(): Promise<void> {
  const col = fs().collection('handbook');
  if (!(await col.limit(1).get()).empty) return;
  const batch = fs().batch();
  OPERATIONS_MANUAL.forEach((s, i) => batch.set(col.doc(s.id), { ...s, order: i, updatedAt: new Date().toISOString(), updatedBy: 'import' }));
  await batch.commit();
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'section';

export async function saveSection(input: { id?: string; title: string; audience: ManualSection['audience']; body: string; order?: number }, by: string): Promise<StoredSection> {
  await seedIfEmpty();
  const col = fs().collection('handbook');
  const id = input.id || slug(input.title);
  const prev = (await col.doc(id).get()).data() as StoredSection | undefined;
  const order = input.order ?? prev?.order ?? (await col.count().get()).data().count;
  const saved: StoredSection = { id, title: input.title.trim(), audience: input.audience, body: input.body, order, updatedAt: new Date().toISOString(), updatedBy: by };
  await col.doc(id).set(saved);
  return saved;
}

export async function deleteSection(id: string): Promise<void> {
  await seedIfEmpty();
  await fs().collection('handbook').doc(id).delete();
}

const AUD_LABEL: Record<ManualSection['audience'], string> = { tech: 'All technicians', pm: 'Project Managers', office: 'Office / leadership' };

/** The whole manual as one HTML document, for the Google Doc. */
export function manualHtml(sections: StoredSection[]): string {
  const parts = sections.map((s, i) => {
    const body = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, s.body));
    return `${i ? '<p style="page-break-before:always"></p>' : ''}<h1>${esc(s.title)}</h1><p><em>Audience: ${AUD_LABEL[s.audience]}</em></p>${body}`;
  });
  const toc = sections.map(s => `<li>${esc(s.title)}</li>`).join('');
  return `<html><head><meta charset="utf-8"></head><body>
<h1>Aaromach Operations Manual</h1>
<p><em>Published from Command Center (Company planning → Operations manual) on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Detroit' })}. Edit it in the app — changes made directly in this document are overwritten on the next publish.</em></p>
<h2>Contents</h2><ol>${toc}</ol>
${parts.join('\n')}
</body></html>`;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Replace the Google Doc's content with the current manual. Never throws; returns the outcome. */
export async function publishToGoogleDoc(by: string): Promise<{ ok: boolean; error?: string }> {
  const docId = process.env.HANDBOOK_DOC_ID || MANUAL_DOC_ID;
  const meta = fs().doc('handbookMeta/sync');
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    if (!token) throw new Error('No Google access token for the server.');
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${docId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/html; charset=UTF-8' },
      body: manualHtml(await loadManual()),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({})) as { error?: { message?: string } };
      const hint = r.status === 403 || r.status === 404
        ? ` — share the Google Doc with the server's service account (${await auth.getCredentials().then(c => c.client_email).catch(() => 'see App Hosting')}) as Editor, and enable the Google Drive API.`
        : '';
      throw new Error(`Google Drive ${r.status}: ${d.error?.message || 'request failed'}${hint}`);
    }
    await meta.set({ ok: true, at: new Date().toISOString(), by, error: null }, { merge: true });
    return { ok: true };
  } catch (e) {
    const error = String((e as Error)?.message || e).slice(0, 500);
    await meta.set({ ok: false, at: new Date().toISOString(), by, error }, { merge: true }).catch(() => {});
    return { ok: false, error };
  }
}
