import type { NotificationPreferences } from './types';

/**
 * One reading of a user's notification preferences for every screen and the
 * delivery code. A channel that was never set is ON — that's what delivery
 * has always done — so settings pages must show it on too. Before this, the
 * profile and settings pages showed unset channels as off, and toggling one
 * channel saved a partial object that silently turned the others off.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = { email: true, sms: true, push: true };

export function resolveNotificationPrefs(raw: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return {
    email: raw?.email ?? DEFAULT_NOTIFICATION_PREFS.email,
    sms: raw?.sms ?? DEFAULT_NOTIFICATION_PREFS.sms,
    push: raw?.push ?? DEFAULT_NOTIFICATION_PREFS.push,
  };
}

/** The full object to save when one channel changes — never a partial. */
export function withNotificationPref(
  raw: Partial<NotificationPreferences> | null | undefined,
  channel: keyof NotificationPreferences,
  value: boolean,
): NotificationPreferences {
  return { ...resolveNotificationPrefs(raw), [channel]: value };
}
