'use client';

import type { ReliabilityEvent, ReliabilityTier, ReliabilityEventCategory } from './types';
import { RELIABILITY_TIERS, RELIABILITY_EVENT_TYPES } from './constants';
import { isAfter, subDays, parseISO } from 'date-fns';

/**
 * @fileOverview Utility engine for calculating Technician Operational Reliability.
 * Implements weighted scoring, rolling friction windows, and recovery paths.
 */

export function getReliabilityTier(score: number): ReliabilityTier {
  if (score >= RELIABILITY_TIERS.ELITE.min) return 'Elite';
  if (score >= RELIABILITY_TIERS.RELIABLE.min) return 'Reliable';
  if (score >= RELIABILITY_TIERS.MONITORED.min) return 'Monitored';
  if (score >= RELIABILITY_TIERS.RESTRICTED.min) return 'Restricted';
  return 'Suspended Review';
}

export function getTierColor(tier: ReliabilityTier): string {
  switch (tier) {
    case 'Elite': return 'text-text-green';
    case 'Reliable': return 'text-text-green';
    case 'Monitored': return 'text-accent-gold';
    case 'Restricted': return 'text-brand-red';
    case 'Suspended Review': return 'text-brand-red';
    default: return 'text-text-muted';
  }
}

export function getTierBadgeVariant(tier: ReliabilityTier): any {
  switch (tier) {
    case 'Elite': return 'active';
    case 'Reliable': return 'active';
    case 'Monitored': return 'onhold';
    case 'Restricted': return 'high';
    case 'Suspended Review': return 'missed';
    default: return 'outline';
  }
}

/**
 * Calculates current reliability score based on a list of events.
 * Score starts at 100 and applies a rolling 30-day window for operational friction.
 * Critical failures and positive recoveries apply based on their specific rules.
 */
export function calculateReliabilityScore(events: ReliabilityEvent[]): number {
  let score = 100;
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  // Sort events by date to ensure sequential processing if needed,
  // although simple sum works here.
  events.forEach(event => {
    const eventDate = parseISO(event.createdAt);
    
    // Rule: Operational friction only impacts score for 30 days
    if (event.category === 'operational_friction') {
      if (isAfter(eventDate, thirtyDaysAgo)) {
        score += event.scoreChange;
      }
    } else {
      // Critical and Recovery events are more persistent for score calc
      score += event.scoreChange;
    }
  });

  // Bound the score between 0 and 100
  return Math.min(100, Math.max(0, score));
}

export function getAllEventOptions() {
  return [
    ...Object.values(RELIABILITY_EVENT_TYPES.CRITICAL),
    ...Object.values(RELIABILITY_EVENT_TYPES.OPERATIONAL),
    ...Object.values(RELIABILITY_EVENT_TYPES.RECOVERY),
  ];
}
