/**
 * @fileOverview System-wide operational terminology and constants.
 * This file serves as the single source of truth for the "Command Center" lexicon.
 */

export const TERMINOLOGY = {
  PORTAL: {
    ADMIN: "Command Center",
    TECH: "Operational Terminal",
    CLIENT: "Site Pulse",
  },
  ENTITIES: {
    OPERATIVE: "Field Operative",
    MISSION: "Tactical Assignment",
    INTAKE: "Service Intake",
    REGISTRY: "Operational Registry",
  },
  ACTIONS: {
    AUDIT: "Registry Audit",
    DISPATCH: "Logistical Routing",
    SETTLE: "Financial Settlement",
  }
} as const;

export const PRIORITY_LABELS = {
  low: "Standard",
  medium: "Nominal",
  high: "Priority",
  critical: "Emergency",
} as const;

export const STATUS_LABELS = {
  // Assignment Statuses
  unassigned: "Awaiting Allocation",
  assigned: "Ready for Dispatch",
  "in-progress": "Live Session",
  completed: "Finalized Registry",
  
  // Project Statuses
  active: "Operational",
  "on-hold": "Standby",
  
  // Financial Statuses
  paid: "Settled",
  sent: "Transmitted",
  draft: "Unfinalized",
} as const;
