import type { WorkOrder, SlaStatus } from './types';

// Default SLA targets by priority (minutes for response, hours for resolution)
export const SLA_DEFAULTS: Record<string, { responseMinutes: number; resolutionHours: number }> = {
  critical: { responseMinutes: 15,  resolutionHours: 4  },
  high:     { responseMinutes: 60,  resolutionHours: 8  },
  medium:   { responseMinutes: 240, resolutionHours: 24 },
  low:      { responseMinutes: 480, resolutionHours: 48 },
};

export type SlaInfo = {
  status: SlaStatus;
  responseTarget: number;      // minutes
  resolutionTarget: number;    // hours
  minutesUntilResponseBreach: number | null;  // null = already responded or no target
  hoursUntilResolutionBreach: number | null;  // null = completed or no target
  responseBreached: boolean;
  resolutionBreached: boolean;
};

export function computeSla(wo: WorkOrder, now = new Date()): SlaInfo {
  const defaults = SLA_DEFAULTS[wo.priority] || SLA_DEFAULTS.medium;
  const responseTarget = wo.slaResponseTarget ?? defaults.responseMinutes;
  const resolutionTarget = wo.slaResolutionTarget ?? defaults.resolutionHours;

  // SLA clock starts when the work order is created/scheduled
  // Use scheduleDate+scheduleTime as the clock start if available, else now
  let clockStart: Date | null = null;
  if (wo.scheduleDate && wo.scheduleTime) {
    const combined = `${wo.scheduleDate}T${wo.scheduleTime}`;
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) clockStart = parsed;
  }

  if (!clockStart) {
    return {
      status: 'on-track',
      responseTarget,
      resolutionTarget,
      minutesUntilResponseBreach: null,
      hoursUntilResolutionBreach: null,
      responseBreached: false,
      resolutionBreached: false,
    };
  }

  const elapsedMs = now.getTime() - clockStart.getTime();
  const elapsedMinutes = elapsedMs / 60000;
  const elapsedHours = elapsedMs / 3600000;

  // Response SLA
  const hasResponded = !!wo.firstResponseAt;
  const responseBreached = !hasResponded && elapsedMinutes > responseTarget;
  const minutesUntilResponseBreach = hasResponded
    ? null
    : responseTarget - elapsedMinutes;

  // Resolution SLA
  const isResolved = wo.status === 'completed';
  const resolutionBreached = !isResolved && elapsedHours > resolutionTarget;
  const hoursUntilResolutionBreach = isResolved
    ? null
    : resolutionTarget - elapsedHours;

  let status: SlaStatus = 'on-track';
  if (isResolved) {
    status = 'met';
  } else if (resolutionBreached || responseBreached) {
    status = 'breached';
  } else {
    // At-risk: within 20% of target remaining
    const responseAtRisk = !hasResponded && minutesUntilResponseBreach !== null && minutesUntilResponseBreach < responseTarget * 0.2;
    const resolutionAtRisk = hoursUntilResolutionBreach !== null && hoursUntilResolutionBreach < resolutionTarget * 0.2;
    if (responseAtRisk || resolutionAtRisk) status = 'at-risk';
  }

  return {
    status,
    responseTarget,
    resolutionTarget,
    minutesUntilResponseBreach,
    hoursUntilResolutionBreach,
    responseBreached,
    resolutionBreached,
  };
}

export function formatSlaCountdown(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 0) return `${Math.round(Math.abs(hours))}h over`;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

export function slaStatusColor(status: SlaStatus): string {
  switch (status) {
    case 'met':      return 'text-text-green';
    case 'on-track': return 'text-text-muted';
    case 'at-risk':  return 'text-accent-gold';
    case 'breached': return 'text-brand-red';
    default:         return 'text-text-muted';
  }
}
