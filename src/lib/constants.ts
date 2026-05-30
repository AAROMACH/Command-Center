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
    LEDGER: "Historical Ledger",
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
  confirmed: "Confirmed",
  "on-my-way": "En Route",
  "in-progress": "On Site",
  "checked-out": "Checked Out",
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

export const RELIABILITY_TIERS = {
  ELITE: { label: 'Elite', min: 95, max: 100, variant: 'active' },
  RELIABLE: { label: 'Reliable', min: 85, max: 94, variant: 'active' },
  MONITORED: { label: 'Monitored', min: 70, max: 84, variant: 'onhold' },
  RESTRICTED: { label: 'Restricted', min: 50, max: 69, variant: 'high' },
  SUSPENDED: { label: 'Suspended Review', min: 0, max: 49, variant: 'missed' },
} as const;

export const RELIABILITY_EVENT_TYPES = {
  CRITICAL: {
    NO_SHOW: { type: 'no_show', label: 'No Show', scoreChange: -25, category: 'critical_failure', isAutomatic: false },
    SITE_ABANDONMENT: { type: 'site_abandonment', label: 'Site Abandonment', scoreChange: -35, category: 'critical_failure', isAutomatic: false },
    FALSIFIED_LOG: { type: 'falsified_log', label: 'Falsified Log', scoreChange: -50, category: 'critical_failure', isAutomatic: false },
    UNAUTHORIZED_CANCELLATION: { type: 'unauthorized_cancellation', label: 'Unauthorized Cancellation', scoreChange: -20, category: 'critical_failure', isAutomatic: false },
    SAFETY_VIOLATION: { type: 'safety_violation', label: 'Safety Violation', scoreChange: -30, category: 'critical_failure', isAutomatic: false },
  },
  OPERATIONAL: {
    MISSED_ACKNOWLEDGMENT: { type: 'missed_acknowledgment', label: 'Missed Acknowledgment', scoreChange: -2, category: 'operational_friction', isAutomatic: true },
    LATE_WEEKLY_LOG: { type: 'late_weekly_log', label: 'Late Weekly Log', scoreChange: -5, category: 'operational_friction', isAutomatic: true },
    WEEKLY_LOG_MISSING: { type: 'weekly_log_not_submitted', label: 'Weekly Log Missing', scoreChange: -10, category: 'operational_friction', isAutomatic: true },
    MISSING_PHOTOS: { type: 'missing_required_photos', label: 'Missing Required Photos', scoreChange: -3, category: 'operational_friction', isAutomatic: true },
    DELAYED_STATUS: { type: 'delayed_status_update', label: 'Delayed Status Update', scoreChange: -3, category: 'operational_friction', isAutomatic: true },
    POOR_COMMUNICATION: { type: 'poor_communication', label: 'Poor Communication', scoreChange: -4, category: 'operational_friction', isAutomatic: false },
  },
  RECOVERY: {
    COMPLETED_NO_ISSUE: { type: 'completed_assignment_no_issue', label: 'Completed No Issue', scoreChange: 1, category: 'positive_recovery', isAutomatic: true },
    TEN_STREAK: { type: 'ten_assignment_streak_no_issue', label: '10 Job Streak', scoreChange: 3, category: 'positive_recovery', isAutomatic: true },
    DIFFICULT_COMPLETED: { type: 'difficult_assignment_completed', label: 'Difficult Job Completed', scoreChange: 3, category: 'positive_recovery', isAutomatic: false },
    POSITIVE_FEEDBACK: { type: 'positive_client_feedback', label: 'Positive Feedback', scoreChange: 2, category: 'positive_recovery', isAutomatic: true },
    ACK_STREAK: { type: 'consistent_acknowledgment_streak', label: 'Ack Streak', scoreChange: 2, category: 'positive_recovery', isAutomatic: true },
  }
} as const;

export const PAY_TYPE_LABELS = {
  fixed: "Fixed",
  hourly: "Hourly",
  blended: "Blended",
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