import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import type { Technician, Notification } from './types';

export const NotificationService = {
  async notify(userId: string, title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        console.warn(`[notify] User ${userId} not found`);
        return;
      }

      const user = { ...userDoc.data(), id: userDoc.id } as Technician;
      const prefs = user.notificationPreferences || { email: true, sms: true, push: true };

      const protocols: ('email' | 'sms' | 'push')[] = [];
      if (prefs.email && user.email) protocols.push('email');
      if (prefs.sms && user.phone) protocols.push('sms');
      if (prefs.push) protocols.push('push');

      await Promise.all(protocols.map(async (type) => {
        // Determine delivery address
        const to = type === 'email' ? user.email : type === 'sms' ? user.phone : '';

        // Attempt real delivery via server-side API route
        let deliveryStatus: 'sent' | 'failed' | 'pending' = 'pending';
        if (to && type !== 'push') {
          try {
            const res = await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, to, title: `[AAROMACH] ${title.toUpperCase()}`, body }),
            });
            const result = await res.json();
            deliveryStatus = result.status === 'sent' ? 'sent' : result.status === 'skipped' ? 'pending' : 'failed';
          } catch {
            deliveryStatus = 'failed';
          }
        } else if (type === 'push') {
          deliveryStatus = 'pending'; // not yet wired to FCM
        }

        // Always write an in-app notification record regardless of delivery outcome
        const notification: Omit<Notification, 'id'> = {
          userId,
          type,
          title: `[AAROMACH] ${title.toUpperCase()}`,
          body,
          timestamp: new Date().toISOString(),
          status: deliveryStatus,
          relatedEntityId: entity?.id,
          relatedEntityType: entity?.type,
        };
        const id = await createDocId(ID_PREFIXES.NOTIFICATION);
        return setDoc(doc(db, 'notifications', id), { ...notification, id });
      }));

      console.log(`[notify] ${protocols.length} channel(s) dispatched for ${user.name}`);
    } catch (e) {
      console.error('[notify] Critical failure:', e);
    }
  },

  async broadcast(userIds: string[], title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    return Promise.all(userIds.map(id => this.notify(id, title, body, entity)));
  },

  async notifyAdmins(title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'),
          where('roles', 'array-contains-any', ['super_admin', 'dispatch_admin']))
      );
      const adminIds = snap.docs.map(d => d.id);
      return this.broadcast(adminIds, title, body, entity);
    } catch (e) {
      console.error('[notify] Admin broadcast failed:', e);
    }
  },
};
