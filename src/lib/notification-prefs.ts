import type { NotificationPreferences } from './types';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'phone';

/**
 * One reading of a user's notification preferences for every screen and the
 * delivery code. A channel that was never set is ON — that's what delivery
 * has always done — so settings pages must show it on too. Before this, the
 * profile and settings pages showed unset channels as off, and toggling one
 * channel saved a partial object that silently turned the others off.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = { email: true, sms: true, push: true, phone: true };

export function resolveNotificationPrefs(raw: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return {
    email: raw?.email ?? DEFAULT_NOTIFICATION_PREFS.email,
    sms: raw?.sms ?? DEFAULT_NOTIFICATION_PREFS.sms,
    push: raw?.push ?? DEFAULT_NOTIFICATION_PREFS.push,
    phone: raw?.phone ?? true,
    ...(raw?.events ? { events: raw.events } : {}),
  };
}

/** Whether this event should reach the person outside the bell. */
export const eventEnabled = (prefs: NotificationPreferences, event: string) => prefs.events?.[event] !== false;

/** The full object to save when one event switch changes. */
export function withEventPref(raw: Partial<NotificationPreferences> | null | undefined, event: string, value: boolean): NotificationPreferences {
  const p = resolveNotificationPrefs(raw);
  return { ...p, events: { ...(p.events || {}), [event]: value } };
}

/** The full object to save when one channel changes — never a partial. */
export function withNotificationPref(
  raw: Partial<NotificationPreferences> | null | undefined,
  channel: NotificationChannel,
  value: boolean,
): NotificationPreferences {
  return { ...resolveNotificationPrefs(raw), [channel]: value };
}
