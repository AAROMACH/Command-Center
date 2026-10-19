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
    // The bell always gets every alert (so a swiped-away phone alert is still
    // there) — no longer a switch.
    push: true,
    phone: raw?.phone ?? true,
    ...(raw?.events ? { events: raw.events } : {}),
    ...(raw?.eventChannels ? { eventChannels: raw.eventChannels } : {}),
  };
}

/** Whether this event should reach the person outside the bell. */
export const eventEnabled = (prefs: NotificationPreferences, event: string) => prefs.events?.[event] !== false;

export type OutsideChannel = 'phone' | 'email' | 'sms';

/**
 * What starts checked for someone who hasn't touched the grid: a tech's job
 * assignments, changes and removals by phone and email. Everything else (and
 * all text messages) starts off; people opt in.
 */
const DEFAULT_ON: Record<string, OutsideChannel[]> = {
  job_assignments: ['phone', 'email'],
};

/** Whether this event goes out on this channel: the grid's checkbox if set,
 *  otherwise the default above (an event switched off under the older
 *  per-event switches stays off). */
export function channelOn(prefs: NotificationPreferences, event: string, ch: OutsideChannel): boolean {
  const explicit = prefs.eventChannels?.[event]?.[ch];
  if (explicit !== undefined) return explicit;
  if (!eventEnabled(prefs, event)) return false;
  return (DEFAULT_ON[event] || []).includes(ch);
}

/** The full object to save when one grid checkbox changes. */
export function withEventChannel(raw: Partial<NotificationPreferences> | null | undefined, event: string, ch: OutsideChannel, value: boolean): NotificationPreferences {
  const p = resolveNotificationPrefs(raw);
  return { ...p, eventChannels: { ...(p.eventChannels || {}), [event]: { ...(p.eventChannels?.[event] || {}), [ch]: value } } };
}

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
