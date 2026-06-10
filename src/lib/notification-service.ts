'use client';

import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { generateId } from './generateId';
import { ID_PREFIXES } from './constants';
import type { Technician, Notification } from './types';

/**
 * @fileOverview Operational Notification Dispatcher.
 * Coordinates system-wide alerts across Email, SMS, and Push protocols based on user preferences.
 */

export const NotificationService = {
  /**
   * Dispatch a notification to a specific user registry entry.
   * Checks user-defined operational preferences before execution.
   */
  async notify(userId: string, title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
          console.warn(`Registry Error: User ${userId} not found in database.`);
          return;
      }
      
      const user = { ...userDoc.data(), id: userDoc.id } as Technician;
      
      // Default to full communication protocol if preferences are uninitialized
      const prefs = user.notificationPreferences || { email: true, sms: true, push: true };
      
      const protocols: ('email' | 'sms' | 'push')[] = [];
      if (prefs.email) protocols.push('email');
      if (prefs.sms) protocols.push('sms');
      if (prefs.push) protocols.push('push');
      
      // Execute multi-channel handshake
      const writePromises = protocols.map(async (type) => {
        const notification: Omit<Notification, 'id'> = {
          userId,
          type,
          title: `[AAROMACH] ${title.toUpperCase()}`,
          body,
          timestamp: new Date().toISOString(),
          status: 'sent', // Simulated transmission success for prototype
          relatedEntityId: entity?.id,
          relatedEntityType: entity?.type
        };
        const id = await generateId(ID_PREFIXES.NOTIFICATION);
        return setDoc(doc(db, 'notifications', id), { ...notification, id });
      });

      await Promise.all(writePromises);
      
      console.log(`Notification Protocol Finalized: ${protocols.length} channels deployed for ${user.name}.`);
    } catch (e) {
      console.error("Critical Notification Protocol Failure:", e);
    }
  },

  /**
   * Dispatch a mass broadcast to a group of registry entries (e.g. all admins).
   */
  async broadcast(userIds: string[], title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    return Promise.all(userIds.map(id => this.notify(id, title, body, entity)));
  },

  /**
   * Notify all admins without requiring a pre-loaded admin list on the client.
   * Resolves admin IDs from Firestore directly — eliminates mock data dependency.
   */
  async notifyAdmins(title: string, body: string, entity?: { id: string, type: 'assignment' | 'project' | 'request' }) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'),
          where('roles', 'array-contains-any', ['super_admin', 'dispatch_admin']))
      );
      const adminIds = snap.docs.map(d => d.id);
      return this.broadcast(adminIds, title, body, entity);
    } catch (e) {
      console.error('Admin notification broadcast failed:', e);
    }
  }
};