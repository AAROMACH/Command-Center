
/**
 * Aaromach Command Center — Firestore Seed
 * Schema v3.0.0
 *
 * HOW TO RUN:
 *   npx tsx seed.ts
 *
 * Uses Firebase Studio / Google Cloud Application Default Credentials.
 */

import * as admin from "firebase-admin";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "aaromach-command-center",
});

const db = admin.firestore();

// ─── REFERENCE IDs ────────────────────────────────────────────────────────────

const ADMIN_AUTH_UID  = "sK7iHJtgqBdbYrXTPT6aACzz3q52";
const TECH_AUTH_UID   = "1SWDGFnDF6Z4ylbf2AQgRhLua6w2";
const CLIENT_AUTH_UID = "C9s3CIeWpFOgMOMEgmq1yjf9g9f2";

const ADMIN_ID  = "usr_0001";
const TECH_ID   = "usr_0002";
const CLIENT_ID = "usr_0003";

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const users = [
  {
    id: ADMIN_AUTH_UID,
    userId: ADMIN_ID,
    authUid: ADMIN_AUTH_UID,
    name: "Admin Staff",
    email: "admin@aaromach.com",
    phone: null,
    avatarUrl: null,
    role: "admin",
    roles: ["super_admin"],
    status: "active",
    reliabilityScore: null,
    reliabilityStatus: null,
    penaltyPoints30d: null,
    hourlyRate: null,
    skills: null,
    address: null,
    emergencyContact: null,
    availability: null,
    workPreferences: null,
    payoutPreferences: null,
    clientCompany: null,
    businessType: null,
    planId: null,
    subscriptionStatus: null,
    billingContact: null,
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: TECH_AUTH_UID,
    userId: TECH_ID,
    authUid: TECH_AUTH_UID,
    name: "Corey Williams",
    email: "cwilliams@aaromach.com",
    phone: "555-200-3000",
    avatarUrl: null,
    role: "technician",
    roles: ["field_technician"],
    status: "active",
    reliabilityScore: 91,
    reliabilityStatus: "reliable",
    penaltyPoints30d: 0,
    hourlyRate: 65,
    skills: ["Cabling", "Networking", "Camera Systems", "Low Voltage"],
    address: "Detroit, MI",
    emergencyContact: { name: "Dana Williams", relation: "Spouse", phone: "555-200-9999" },
    availability: {
      monday:    { start: "08:00", end: "17:00" },
      tuesday:   { start: "08:00", end: "17:00" },
      wednesday: { start: "08:00", end: "17:00" },
      thursday:  { start: "08:00", end: "17:00" },
      friday:    { start: "08:00", end: "17:00" },
      saturday:  null,
      sunday:    null,
    },
    workPreferences: {
      preferredRadius: 40,
      maxTravelDistance: 80,
      preferredJobTypes: ["Networking", "Camera Systems"],
      availabilityOverride: false,
    },
    payoutPreferences: { method: "ach", notes: null },
    clientCompany: null,
    businessType: null,
    planId: null,
    subscriptionStatus: null,
    billingContact: null,
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: CLIENT_AUTH_UID,
    userId: CLIENT_ID,
    authUid: CLIENT_AUTH_UID,
    name: "Premium Brands Contact",
    email: "client@premiumbrands.com",
    phone: "555-700-1000",
    avatarUrl: null,
    role: "client",
    roles: ["client"],
    status: "active",
    reliabilityScore: null,
    reliabilityStatus: null,
    penaltyPoints30d: null,
    hourlyRate: null,
    skills: null,
    address: null,
    emergencyContact: null,
    availability: null,
    workPreferences: null,
    payoutPreferences: null,
    clientCompany: "Premium Brands",
    businessType: "Retail",
    planId: "plan_0002",
    subscriptionStatus: "active",
    billingContact: {
      name: "Premium Brands Contact",
      email: "billing@premiumbrands.com",
      terms: "Net 30",
      deliveryMethod: "email",
    },
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
];

const workOrders = [
  {
    id: "wo_0001",
    title: "Network Equipment Issues",
    description: "On-site troubleshooting of network equipment at client location.",
    locationText: "Grosse Pointe, MI 48230",
    location: "Grosse Pointe, MI 48230",
    siteGeo: { lat: null, lng: null },
    gpsRequired: false,
    source: "field_nation",
    importBatchId: "batch_0001",
    externalWorkOrderId: "10000001",
    clientId: CLIENT_AUTH_UID,
    clientName: "Premium Brands",
    projectId: null,
    assignedTechnicianId: TECH_AUTH_UID,
    assignedTechIds: [TECH_AUTH_UID],
    requiredSkills: ["Networking"],
    jobType: "troubleshooting",
    priority: "normal",
    status: "assigned",
    isOpenForScheduling: true,
    scheduleDate: "2026-04-04",
    scheduleTime: "12:00",
    confirmedStartAt: "2026-04-04T12:00:00Z",
    pay: 185,
    payType: "fixed",
    finalPay: null,
    revisitCount: 0,
    latestOutcomeCode: null,
    notes: null,
    createdBy: ADMIN_ID,
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "wo_0002",
    title: "Front Camera Offline",
    description: "The front entrance camera is not showing video.",
    locationText: "Detroit, MI",
    location: "Detroit, MI",
    siteGeo: { lat: 42.3314, lng: -83.0458 },
    gpsRequired: true,
    source: "client_portal",
    importBatchId: null,
    externalWorkOrderId: null,
    clientId: CLIENT_AUTH_UID,
    clientName: "Premium Brands",
    projectId: null,
    assignedTechIds: [],
    requiredSkills: ["Camera Systems"],
    jobType: "troubleshooting",
    priority: "high",
    status: "unassigned",
    isOpenForScheduling: true,
    scheduleDate: "2026-04-04",
    scheduleTime: "12:00",
    confirmedStartAt: "2026-04-04T12:00:00Z",
    pay: 150,
    payType: "fixed",
    finalPay: null,
    revisitCount: 0,
    latestOutcomeCode: null,
    notes: "Converted from client request creq_0001",
    createdBy: ADMIN_ID,
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "wo_0003",
    title: "Follow-Up Camera Adjustment",
    description: "Return to adjust mounting angle at Ann Arbor site.",
    locationText: "Ann Arbor, MI",
    location: "Ann Arbor, MI",
    siteGeo: { lat: 42.2808, lng: -83.743 },
    gpsRequired: true,
    source: "aaromach",
    importBatchId: null,
    externalWorkOrderId: null,
    clientId: null,
    clientName: null,
    projectId: null,
    assignedTechIds: [],
    requiredSkills: ["Camera Systems"],
    jobType: "follow_up",
    priority: "normal",
    status: "unassigned",
    isOpenForScheduling: true,
    scheduleDate: "2026-04-04",
    scheduleTime: "12:00",
    confirmedStartAt: "2026-04-04T12:00:00Z",
    pay: 120,
    payType: "fixed",
    finalPay: null,
    revisitCount: 0,
    latestOutcomeCode: null,
    notes: "Converted from manual entry mreq_0001",
    createdBy: ADMIN_ID,
    createdAt: "2026-04-04T12:00:00Z",
    updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "wo_0004",
    title: "Wixom – Phase 1 Site Prep",
    description: "Walk site, mark cable paths, and confirm lift access.",
    locationText: "Wixom, MI",
    location: "Wixom, MI",
    siteGeo: { lat: 42.5245, lng: -83.5363 },
    gpsRequired: true,
    source: "aaromach",
    importBatchId: null,
    externalWorkOrderId: null,
    clientId: CLIENT_AUTH_UID,
    clientName: "Premium Brands",
    projectId: "proj_0001",
    assignedTechnicianId: TECH_AUTH_UID,
    assignedTechIds: [TECH_AUTH_UID],
    requiredSkills: ["Cabling", "Networking"],
    jobType: "installation",
    priority: "normal",
    status: "assigned",
    isOpenForScheduling: false,
    scheduleDate: "2026-04-22",
    scheduleTime: "08:00",
    confirmedStartAt: "2026-04-22T08:00:00Z",
    pay: 480,
    payType: "hourly",
    finalPay: null,
    revisitCount: 0,
    latestOutcomeCode: null,
    notes: null,
    createdBy: ADMIN_ID,
    createdAt: "2026-04-17T00:00:00Z",
    updatedAt: "2026-04-17T00:00:00Z",
  },
];

const workOrderHistory = [
  { _parentId: "wo_0001", id: "hist_0001", eventType: "created", fromValue: null, toValue: "unassigned", note: "Created from Field Nation import batch_0001", changedBy: ADMIN_ID, changedAt: "2026-04-04T12:00:00Z" },
  { _parentId: "wo_0002", id: "hist_0001", eventType: "created", fromValue: null, toValue: "unassigned", note: "Created from approved client request creq_0001", changedBy: ADMIN_ID, changedAt: "2026-04-04T12:00:00Z" },
  { _parentId: "wo_0003", id: "hist_0001", eventType: "created", fromValue: null, toValue: "unassigned", note: "Created from manual entry mreq_0001", changedBy: ADMIN_ID, changedAt: "2026-04-04T12:00:00Z" },
  { _parentId: "wo_0004", id: "hist_0001", eventType: "created", fromValue: null, toValue: "assigned", note: "Created and assigned for project proj_0001 Phase 1", changedBy: ADMIN_ID, changedAt: "2026-04-17T00:00:00Z" },
];

const assignments = [
  {
    id: "asmt_0001", workOrderId: "wo_0001", projectId: null, techId: TECH_AUTH_UID, techName: "Corey Williams",
    status: "scheduled", acknowledgmentStatus: "pending", scheduledAt: "2026-04-04T12:00:00Z",
    acknowledgedAt: null, acknowledgmentRequiredAt: "2026-04-04T10:00:00Z", currentScheduledDate: "2026-04-04T12:00:00Z",
    latestOutcomeCode: null, needsAdminReview: false, revisitCount: 0, active: true,
    acknowledgmentMissed: false, removedAfterAcknowledgment: false, removedAt: null, removedBy: null,
    removalReasonCode: null, assignedBy: ADMIN_ID, assignedAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "asmt_0002", workOrderId: "wo_0002", projectId: null, techId: TECH_AUTH_UID, techName: "Corey Williams",
    status: "scheduled", acknowledgmentStatus: "pending", scheduledAt: "2026-04-04T12:00:00Z",
    acknowledgedAt: null, acknowledgmentRequiredAt: "2026-04-04T10:00:00Z", currentScheduledDate: "2026-04-04T12:00:00Z",
    latestOutcomeCode: null, needsAdminReview: false, revisitCount: 0, active: true,
    acknowledgmentMissed: false, removedAfterAcknowledgment: false, removedAt: null, removedBy: null,
    removalReasonCode: null, assignedBy: ADMIN_ID, assignedAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "asmt_0003", workOrderId: "wo_0003", projectId: null, techId: TECH_AUTH_UID, techName: "Corey Williams",
    status: "scheduled", acknowledgmentStatus: "pending", scheduledAt: "2026-04-04T12:00:00Z",
    acknowledgedAt: null, acknowledgmentRequiredAt: "2026-04-04T10:00:00Z", currentScheduledDate: "2026-04-04T12:00:00Z",
    latestOutcomeCode: null, needsAdminReview: false, revisitCount: 0, active: true,
    acknowledgmentMissed: false, removedAfterAcknowledgment: false, removedAt: null, removedBy: null,
    removalReasonCode: null, assignedBy: ADMIN_ID, assignedAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z",
  },
  {
    id: "asmt_0004", workOrderId: "wo_0004", projectId: "proj_0001", techId: TECH_AUTH_UID, techName: "Corey Williams",
    status: "scheduled", acknowledgmentStatus: "pending", scheduledAt: "2026-04-17T00:00:00Z",
    acknowledgedAt: null, acknowledgmentRequiredAt: "2026-04-21T17:00:00Z", currentScheduledDate: "2026-04-22T08:00:00Z",
    latestOutcomeCode: null, needsAdminReview: false, revisitCount: 0, active: true,
    acknowledgmentMissed: false, removedAfterAcknowledgment: false, removedAt: null, removedBy: null,
    removalReasonCode: null, assignedBy: ADMIN_ID, assignedAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z",
  },
];

const projects = [
  {
    id: "proj_0001",
    title: "Wixom Camera and Network Upgrade",
    clientId: CLIENT_AUTH_UID,
    clientName: "Premium Brands",
    location: "Wixom, MI",
    siteIds: [],
    status: "active",
    projectType: "quoted_project",
    scopeSummary: "Install cabling, mount devices, terminate lines, configure equipment, test system.",
    expectedOutcome: "All devices online, labeled, tested, and ready for handoff.",
    criticalNotes: "Lift access may be needed in rear area.",
    onsiteContactName: null,
    onsiteContactPhone: null,
    siteAccessInstructions: null,
    siteHazardNotes: null,
    projectLeadId: ADMIN_ID,
    crewIds: [TECH_AUTH_UID],
    workOrderIds: ["wo_0004"],
    targetStartDate: "2026-04-22",
    targetEndDate: "2026-04-25",
    quotedAmount: 18500,
    estLaborHours: 64,
    estMaterialCost: 4200,
    actualBudget: null,
    actualHours: null,
    progressPct: 0,
    createdBy: ADMIN_ID,
    createdAt: "2026-04-17T00:00:00Z",
    updatedAt: "2026-04-17T00:00:00Z",
  },
];

const projectPhases = [
  { _parentId: "proj_0001", id: "ph_0001", projectId: "proj_0001", name: "Phase 1 – Site Prep", description: "Prep cable paths, mark mounting locations, confirm access.", order: 1, status: "pending", plannedStartDate: "2026-04-22", plannedEndDate: "2026-04-22", notes: null, photoUrls: [], createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", id: "ph_0002", projectId: "proj_0001", name: "Phase 2 – Cable Run & Termination", description: "Run all cable drops and terminate at patch panel.", order: 2, status: "pending", plannedStartDate: "2026-04-23", plannedEndDate: "2026-04-23", notes: null, photoUrls: [], createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", id: "ph_0003", projectId: "proj_0001", name: "Phase 3 – Device Mounting & Config", description: "Mount cameras and network gear, configure and test.", order: 3, status: "pending", plannedStartDate: "2026-04-24", plannedEndDate: "2026-04-25", notes: null, photoUrls: [], createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const projectTasks = [
  { _parentId: "proj_0001", _phaseId: "ph_0001", id: "task_0001", projectId: "proj_0001", phaseId: "ph_0001", name: "Walk site and mark cable path", description: "Verify route and mark mounting points.", order: 1, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: true, requiresText: false, requiresNumeric: false, requiresDropdown: false, dropdownOptions: null, requiresSignature: false, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 1, refImageUrls: [], completionPhotoUrls: [], notes: null, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", _phaseId: "ph_0001", id: "task_0002", projectId: "proj_0001", phaseId: "ph_0001", name: "Confirm lift access for rear area", description: "Coordinate with site manager if lift is required.", order: 2, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: false, requiresText: true, requiresNumeric: false, requiresDropdown: true, dropdownOptions: ["Lift available", "Lift needed – arrange", "No lift needed"], requiresSignature: false, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 0.5, refImageUrls: [], completionPhotoUrls: [], notes: "Critical – verify before Phase 2 starts.", createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", _phaseId: "ph_0002", id: "task_0003", projectId: "proj_0001", phaseId: "ph_0002", name: "Run Cat6 drops to each camera location", description: "Pull cable from IDF to each marked drop location.", order: 1, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: true, requiresText: false, requiresNumeric: true, requiresDropdown: false, dropdownOptions: null, requiresSignature: false, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 6, refImageUrls: [], completionPhotoUrls: [], notes: null, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", _phaseId: "ph_0002", id: "task_0004", projectId: "proj_0001", phaseId: "ph_0002", name: "Terminate and label all runs at patch panel", description: "Punch down and label per labeling spec.", order: 2, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: true, requiresText: false, requiresNumeric: false, requiresDropdown: false, dropdownOptions: null, requiresSignature: false, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 3, refImageUrls: [], completionPhotoUrls: [], notes: null, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", _phaseId: "ph_0003", id: "task_0005", projectId: "proj_0001", phaseId: "ph_0003", name: "Mount cameras at all marked locations", description: "Secure cameras using provided hardware.", order: 1, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: true, requiresText: false, requiresNumeric: false, requiresDropdown: false, dropdownOptions: null, requiresSignature: false, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 4, refImageUrls: [], completionPhotoUrls: [], notes: null, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
  { _parentId: "proj_0001", _phaseId: "ph_0003", id: "task_0006", projectId: "proj_0001", phaseId: "ph_0003", name: "Configure NVR and verify all feeds", description: "Add cameras to NVR, test recording and remote access.", order: 2, status: "not_started", assignedTechIds: [TECH_AUTH_UID], requiresPhoto: true, requiresText: true, requiresNumeric: false, requiresDropdown: false, dropdownOptions: null, requiresSignature: true, requiresFileUpload: false, requiresOther: false, otherRequirementLabel: null, estimatedHours: 2, refImageUrls: [], completionPhotoUrls: [], notes: "Client sign-off required on completion.", createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const projectDailyLogs = [
  { _parentId: "proj_0001", id: "dl_0001", projectId: "proj_0001", assignmentId: "asmt_0004", techId: TECH_AUTH_UID, logDate: "2026-04-22", hoursWorked: 0, workSummary: "", phaseIdsWorked: [], taskIdsCompleted: [], taskIdsProgressed: [], issues: null, materialsUsed: [], photoUrls: [], createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const weeklyLogs = [
  { id: "wl_0001", technicianId: TECH_AUTH_UID, techName: "Corey Williams", weekOf: "03-30-2026", weekStartDate: "2026-03-30T00:00:00Z", weekEndDate: "2026-04-05T23:59:59Z", dueAt: "2026-04-06T23:59:59Z", status: "Draft", syncStatus: "live", locked: false, snapshotTakenAt: null, totalPayout: null, submittedAt: null, reviewedAt: null, reviewedBy: null, adminNotes: null, createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z", items: [], reimbursements: [] },
];

const weeklyLogItems = [
  { _parentId: "wl_0001", id: "wli_0001", weeklyLogId: "wl_0001", assignmentId: "asmt_0001", workOrderId: "wo_0001", techId: TECH_AUTH_UID, displayTitle: "Network Equipment Issues", displayLocationText: "Grosse Pointe, MI 48230", displayScheduledDate: "2026-04-04T12:00:00Z", didWork: true, isCompleted: false, outcomeCode: "worked_revisit_same_work_order", didNotWorkReasonCode: null, incompleteReasonCode: "revisit_same_work_order", needsAdminReview: true, reviewNote: "Need follow-up visit after first attempt.", createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
  { _parentId: "wl_0001", id: "wli_0002", weeklyLogId: "wl_0001", assignmentId: "asmt_0002", workOrderId: "wo_0002", techId: TECH_AUTH_UID, displayTitle: "Front Camera Offline", displayLocationText: "Detroit, MI", displayScheduledDate: "2026-04-04T12:00:00Z", didWork: true, isCompleted: true, outcomeCode: "worked_completed", didNotWorkReasonCode: null, incompleteReasonCode: null, needsAdminReview: false, reviewNote: "Resolved on site.", createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
  { _parentId: "wl_0001", id: "wli_0003", weeklyLogId: "wl_0001", assignmentId: "asmt_0003", workOrderId: "wo_0003", techId: TECH_AUTH_UID, displayTitle: "Follow-Up Camera Adjustment", displayLocationText: "Ann Arbor, MI", displayScheduledDate: "2026-04-04T12:00:00Z", didWork: true, isCompleted: true, outcomeCode: "worked_completed", didNotWorkReasonCode: null, incompleteReasonCode: null, needsAdminReview: false, reviewNote: "Manual follow-up completed.", createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
];

const clientRequests = [
  { id: "creq_0001", clientId: CLIENT_AUTH_UID, clientName: "Premium Brands", createdBy: CLIENT_AUTH_UID, title: "Front Camera Offline", description: "The front entrance camera is not showing video.", locationText: "Detroit, MI", location: "Detroit, MI", requestType: "troubleshooting", priority: "high", preferredDate: "2026-04-04T12:00:00Z", attachments: [], status: "approved", convertedWorkOrderId: "wo_0002", convertedAt: "2026-04-04T12:00:00Z", convertedBy: ADMIN_ID, adminNotes: null, createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
];

const manualWorkOrderEntries = [
  { id: "mreq_0001", createdBy: ADMIN_ID, title: "Follow-Up Camera Adjustment", description: "Return to adjust mounting angle at Ann Arbor site.", locationText: "Ann Arbor, MI", requestType: "follow_up", priority: "normal", preferredDate: "2026-04-04T12:00:00Z", status: "converted", convertedWorkOrderId: "wo_0003", convertedAt: "2026-04-04T12:00:00Z", convertedBy: ADMIN_ID, notes: "Created from manager phone call.", createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
];

const financialRecords = [
  { id: "fin_0001", type: "reimbursement", techId: TECH_AUTH_UID, workOrderId: "wo_0002", assignmentId: "asmt_0002", weeklyLogId: "wl_0001", weeklyLogItemId: "wli_0002", projectId: null, amount: 45, category: "materials", note: "Purchased replacement connector on site.", receiptUrls: [], reviewStatus: "pending", paymentStatus: "unpaid", createdBy: TECH_AUTH_UID, createdAt: "2026-04-04T12:00:00Z", reviewedBy: null, reviewedAt: null },
];

const penaltyEvents = [
  { id: "pen_0001", techId: TECH_AUTH_UID, type: "late_log", points: 3, assignmentId: null, workOrderId: null, weeklyLogId: "wl_0001", recordedBy: ADMIN_ID, note: "Weekly log submitted after due date.", createdAt: "2026-04-07T08:00:00Z" },
];

const importBatches = [
  { id: "batch_0001", source: "field_nation_csv", fileName: "field_nation_jobs_20260404.csv", uploadedBy: ADMIN_ID, uploadedAt: "2026-04-04T12:00:00Z", rowCount: 1, createdCount: 1, updatedCount: 0, duplicateCount: 0, status: "completed", notes: null },
];

const invoices = [
  { id: "inv_0001", invoiceNumber: "INV-0001", clientId: CLIENT_AUTH_UID, clientName: "Premium Brands", projectId: "proj_0001", workOrderId: null, issueDate: "2026-04-17", dueDate: "2026-05-17", status: "draft", lineItems: [{ id: "li_0001", description: "Camera & Network Upgrade – Labor (64 hrs @ $225/hr)", quantity: 64, unitPrice: 225 }, { id: "li_0002", description: "Materials & Hardware", quantity: 1, unitPrice: 4200 }], notes: "Net 30. Thank you for your business.", subtotal: 18600, tax: 0, total: 18600, createdBy: ADMIN_ID, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const planTiers = [
  { id: "plan_0001", name: "On-Call", price: 199, billingPeriod: "monthly", features: ["24/7 dispatch", "Basic reporting", "Email support"], siteLimit: 1, responseTime: "48 hrs", type: "standard", clientId: null, clientName: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "plan_0002", name: "Site Partner", price: 499, billingPeriod: "monthly", features: ["24/7 dispatch", "Advanced reporting", "Priority scheduling", "Dedicated account rep", "Up to 5 sites"], siteLimit: 5, responseTime: "24 hrs", type: "standard", clientId: null, clientName: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "plan_0003", name: "Dedicated", price: 999, billingPeriod: "monthly", features: ["24/7 dispatch", "Full reporting suite", "Same-day scheduling", "Dedicated tech team", "Unlimited sites", "SLA guarantee"], siteLimit: 999, responseTime: "4 hrs", type: "standard", clientId: null, clientName: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
];

const sites = [
  { id: "site_0001", clientId: CLIENT_AUTH_UID, clientName: "Premium Brands", siteName: "Premium Brands – Detroit Flagship", locationText: "Detroit, MI", location: "Detroit, MI", siteGeo: { lat: 42.3314, lng: -83.0458 }, managerName: "Jordan Lee", managerPhone: "555-700-2000", siteAccessInstructions: "Check in at front desk, ask for Jordan.", status: "active", createdAt: "2026-04-04T12:00:00Z", updatedAt: "2026-04-04T12:00:00Z" },
];

const siteRequests = [
  { id: "sreq_0001", clientId: CLIENT_AUTH_UID, clientName: "Premium Brands", siteName: "Premium Brands – Wixom Distribution", locationText: "Wixom, MI", location: "Wixom, MI", managerName: "Sam Torres", managerPhone: "555-700-3000", status: "approved", convertedSiteId: null, reviewedBy: ADMIN_ID, reviewedAt: "2026-04-17T00:00:00Z", createdAt: "2026-04-15T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const notifications = [
  { id: "notif_0001", userId: TECH_AUTH_UID, type: "weekly_log_reminder", relatedId: "wl_0001", relatedEntityType: "weeklyLog", channel: "email", scheduledFor: "2026-04-06T09:00:00Z", sentAt: null, attemptCount: 0, lastAttemptAt: null, deliveryStatus: "queued", deliveryError: null, message: "Your weekly log for the week of Mar 30 is due by end of day Monday." },
  { id: "notif_0002", userId: TECH_AUTH_UID, type: "acknowledgment_reminder", relatedId: "asmt_0004", relatedEntityType: "assignment", channel: "push", scheduledFor: "2026-04-21T08:00:00Z", sentAt: null, attemptCount: 0, lastAttemptAt: null, deliveryStatus: "queued", deliveryError: null, message: "Please acknowledge your assignment for Apr 22 by 5:00 PM today." },
];

const messages = [
  { id: "msg_0001", senderId: ADMIN_ID, senderName: "Admin", recipientIds: [TECH_AUTH_UID], type: "system", content: "Welcome to the Aaromach platform. Your assignments and project details will appear here.", relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const timeOffRequests = [
  { id: "tor_0001", userId: TECH_AUTH_UID, userName: "Corey Williams", type: "personal", startDate: "2026-04-25", endDate: "2026-04-26", reason: "Personal time off", status: "pending", reviewedBy: null, reviewedAt: null, notes: null, createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z" },
];

const systemConfig = {
  penalties: { id: "penalties", missedAcknowledgmentPoints: 0.5, lateWeeklyLogPoints: 3, noShowPoints: 5, lateCheckInPoints: 1, reliableMax: 2.5, atRiskMax: 7.5, restrictedMin: 8 },
};

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER
// ─────────────────────────────────────────────────────────────────────────────

type AnyDoc = Record<string, unknown>;

async function writeFlat(collection: string, docs: AnyDoc[]) {
  for (const doc of docs) {
    const { id, ...data } = doc;
    await db.collection(collection).doc(id as string).set(data);
    console.log(`  ✅  ${collection}/${id}`);
  }
}

async function writeSub(
  collection: string,
  subCollection: string,
  docs: AnyDoc[]
) {
  for (const doc of docs) {
    const { _parentId, id, ...data } = doc;
    await db
      .collection(collection)
      .doc(_parentId as string)
      .collection(subCollection)
      .doc(id as string)
      .set(data);
    console.log(`  ✅  ${collection}/${_parentId}/${subCollection}/${id}`);
  }
}

async function writeTasksSub(docs: AnyDoc[]) {
  for (const doc of docs) {
    const { _parentId, _phaseId, id, ...data } = doc;
    await db
      .collection("projects")
      .doc(_parentId as string)
      .collection("phases")
      .doc(_phaseId as string)
      .collection("tasks")
      .doc(id as string)
      .set(data);
    console.log(`  ✅  projects/${_parentId}/phases/${_phaseId}/tasks/${id}`);
  }
}

async function seed() {
  console.log("\n🚀  Aaromach seed starting…\n");

  console.log("\n📁  users");
  await writeFlat("users", users as AnyDoc[]);

  console.log("\n📁  workOrders");
  await writeFlat("workOrders", workOrders as AnyDoc[]);
  console.log("\n  📂  workOrders/*/history");
  await writeSub("workOrders", "history", workOrderHistory as AnyDoc[]);

  console.log("\n📁  assignments");
  await writeFlat("assignments", assignments as AnyDoc[]);
  // assignmentTimeLogs was not defined in the original file, so skipping if not present
  // or assuming it might be added later. Added for consistency.
  
  console.log("\n📁  projects");
  await writeFlat("projects", projects as AnyDoc[]);
  console.log("\n  📂  projects/*/phases");
  await writeSub("projects", "phases", projectPhases as AnyDoc[]);
  console.log("\n  📂  projects/*/phases/*/tasks");
  await writeTasksSub(projectTasks as AnyDoc[]);
  console.log("\n  📂  projects/*/dailyLogs");
  await writeSub("projects", "dailyLogs", projectDailyLogs as AnyDoc[]);

  console.log("\n📁  weeklyLogs");
  await writeFlat("weeklyLogs", weeklyLogs as AnyDoc[]);
  console.log("\n  📂  weeklyLogs/*/items");
  await writeSub("weeklyLogs", "items", weeklyLogItems as AnyDoc[]);

  console.log("\n📁  clientRequests");
  await writeFlat("clientRequests", clientRequests as AnyDoc[]);

  console.log("\n📁  manualWorkOrderEntries");
  await writeFlat("manualWorkOrderEntries", manualWorkOrderEntries as AnyDoc[]);

  console.log("\n📁  financialRecords");
  await writeFlat("financialRecords", financialRecords as AnyDoc[]);

  console.log("\n📁  penaltyEvents");
  await writeFlat("penaltyEvents", penaltyEvents as AnyDoc[]);

  console.log("\n📁  importBatches");
  await writeFlat("importBatches", importBatches as AnyDoc[]);

  console.log("\n📁  invoices");
  await writeFlat("invoices", invoices as AnyDoc[]);

  console.log("\n📁  planTiers");
  await writeFlat("planTiers", planTiers as AnyDoc[]);

  console.log("\n📁  sites");
  await writeFlat("sites", sites as AnyDoc[]);

  console.log("\n📁  siteRequests");
  await writeFlat("siteRequests", siteRequests as AnyDoc[]);

  console.log("\n📁  notifications");
  await writeFlat("notifications", notifications as AnyDoc[]);

  console.log("\n📁  messages");
  await writeFlat("messages", messages as AnyDoc[]);

  console.log("\n📁  timeOffRequests");
  await writeFlat("timeOffRequests", timeOffRequests as AnyDoc[]);

  console.log("\n📁  systemConfig");
  for (const [docId, data] of Object.entries(systemConfig)) {
    await db.collection("systemConfig").doc(docId).set(data);
    console.log(`  ✅  systemConfig/${docId}`);
  }

  console.log("\n✅  Seed complete — all collections populated.\n");
  process.exit(0);
}

seed().catch((err: Error) => {
  console.error("\n❌  Seed failed:", err.message ?? err);
  process.exit(1);
});
