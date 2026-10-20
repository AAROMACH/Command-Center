import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The conversation a Messages link points at: ?dm=<user> or ?project=<id>,
 * or ?msg=<message id> from older notifications — looked up to the other
 * person in that DM (or its project).
 */
export async function conversationFromLink(params: URLSearchParams, myId?: string | null): Promise<{ dm?: string; project?: string }> {
  const dm = params.get('dm'), project = params.get('project'), msg = params.get('msg');
  if (dm) return { dm };
  if (project) return { project };
  if (!msg) return {};
  try {
    const m = (await getDoc(doc(db, 'messages', msg))).data();
    if (!m) return {};
    if (m.projectId) return { project: m.projectId };
    return { dm: m.senderId === myId ? m.receiverId : m.senderId };
  } catch {
    return {};
  }
}
