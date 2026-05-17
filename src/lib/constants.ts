/**
 * @fileOverview System-wide operational terminology and constants.
 * This file serves as the single source of truth for the Aaromach Command Center lexicon.
 * Domain: Low-Voltage Cabling, IT Infrastructure, Networking, AV, Security Systems
 */

export const TERMINOLOGY = {
  PORTAL: {
    ADMIN: "Command Center",
    TECH: "Field Terminal",
    CLIENT: "Client Portal",
  },
  ENTITIES: {
    OPERATIVE: "Field Technician",
    ASSIGNMENT: "Assignment",
    PROJECT: "Project",
    INTAKE: "Service Intake",
    MISSION: "Mission",
    LEDGER: "Tactical Ledger",
    BRIEFING: "Operational Briefing",
  },
  ACTIONS: {
    AUDIT: "Payroll Review",
    DISPATCH: "Tech Assignment",
    SETTLE: "Payment Settlement",
  },
  CONFIG: {
    NOTIFICATIONS: "Notifications",
    SECURITY: "Security",
    INTEGRATIONS: "Integrations",
  },
} as const;

export const PRIORITY_LABELS = {
  low: "Routine",
  medium: "Standard",
  high: "Priority",
  critical: "Emergency Dispatch",
} as const;

export const STATUS_LABELS = {
  // Assignment / Work Order Statuses
  unassigned: "Unassigned",
  assigned: "Scheduled",
  "in-progress": "On Site",
  completed: "Closed",
  scheduled: "Scheduled",
  checked_in: "Checked In",
  checked_out: "Checked Out",

  // Project Statuses
  ACTIVE: "Active",
  "on-hold": "On Hold",
  pending: "Pending",
  not_started: "Not Started",

  // Weekly Log / Payroll Statuses
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  locked: "Locked",

  // Financial Statuses
  paid: "Paid",
  sent: "Invoiced",
  unpaid: "Outstanding",

  // Review / Acknowledgment Statuses
  under_review: "Under Review",
  rejected: "Rejected",
  converted: "Converted to Work Order",
} as const;

export const PAY_TYPE_LABELS = {
  fixed: "Fixed Rate",
  hourly: "Hourly",
  blended: "Blended Rate",
} as const;

export const OUTCOME_CODE_LABELS = {
  worked_completed: "Completed",
  worked_revisit_same_work_order: "Revisit Required",
  worked_revisit_new_work_order: "New Work Order Needed",
  did_not_work: "No Work Performed",
} as const;

export const PENALTY_TYPE_LABELS = {
  late_log: "Late Weekly Log",
  no_show: "No Show",
  late_check_in: "Late Check-In",
  missed_acknowledgment: "Missed Acknowledgment",
} as const;

export const ROLE_LABELS = {
  admin: "Administrator",
  technician: "Field Technician",
  client: "Client",
} as const;

export const REQUEST_TYPE_LABELS = {
  follow_up: "Follow-Up Visit",
  new_install: "New Installation",
  break_fix: "Break / Fix",
  maintenance: "Preventive Maintenance",
  survey: "Site Survey",
} as const;

export const NOTIFICATION_TYPE_LABELS = {
  weekly_log_reminder: "Weekly Log Reminder",
  assignment_update: "Work Order Update",
  payment_update: "Payment Update",
  system_alert: "System Alert",
} as const;
