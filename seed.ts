/**
 * Aaromach Command Center — Firestore Seed
 * Schema v3.1.0
 */

import * as admin from "firebase-admin";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "aaromach-command-center",
});

const db = admin.firestore();

// ─── REFERENCE IDs ────────────────────────────────────────────────────────────

const ADMIN_AUTH_UID  = "iktec1F0B8TSYhD8F4zh8dQr3mx1";
const TECH_AUTH_UID   = "1SWDGFnDF6Z4ylbf2AQgRhLua6w2"; // Corey Williams
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
    name: "System Administrator",
    email: "admin@aaromach.com",
    phone: null,
    avatarUrl: null,
    role: "admin",
    roles: ["super_admin"],
    status: "active",
    reliabilityScore: 100,
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
    roles: ["project_manager", "field_technician"],
    status: "active",
    reliabilityScore: 100,
    reliabilityStatus: "reliable",
    penaltyPoints30d: 0,
    hourlyRate: 65,
    skills: ["Cabling", "Networking", "Camera Systems", "Low Voltage"],
    address: "32701 Annapolis St, Wayne, MI 48184, USA",
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
    reliabilityScore: 100,
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

const assignments = [
  {
    id: "asmt-1779643575487",
    workOrderId: "asmt-1779643575487",
    techId: TECH_AUTH_UID,
    assignedTechnicianId: TECH_AUTH_UID,
    status: "completed",
    title: "Network Optimization",
    description: "Optimize network routing and firewall rules.",
    location: "100 Renaissance Center, Detroit, MI 48243",
    clientName: "Premium Brands",
    priority: "high",
    projectType: "Troubleshooting",
    pay: 250.00,
    payType: "fixed",
    scheduleDate: "2026-04-20",
    scheduleTime: "08:00 AM EST",
    source: "Imported",
    assignedAt: "2026-04-18T10:00:00Z",
    updatedAt: "2026-04-20T17:00:00Z",
  },
  {
    id: "asmt-1779646123386",
    workOrderId: "asmt-1779646123386",
    techId: TECH_AUTH_UID,
    assignedTechnicianId: TECH_AUTH_UID,
    status: "completed",
    title: "CCTV Expansion",
    description: "Install 4 additional IP cameras and configure NVR.",
    location: "100 Renaissance Center, Detroit, MI 48243",
    clientName: "Premium Brands",
    priority: "medium",
    projectType: "Installation",
    pay: 350.00,
    payType: "fixed",
    scheduleDate: "2026-04-21",
    scheduleTime: "10:00 AM EST",
    source: "Imported",
    assignedAt: "2026-04-18T11:00:00Z",
    updatedAt: "2026-04-21T18:00:00Z",
  },
  {
    id: "asmt-1779646128334",
    workOrderId: "asmt-1779646128334",
    techId: TECH_AUTH_UID,
    assignedTechnicianId: TECH_AUTH_UID,
    status: "completed",
    title: "Fiber Patching",
    description: "Patch fiber uplinks for floor 12 switch stack.",
    location: "100 Renaissance Center, Detroit, MI 48243",
    clientName: "Premium Brands",
    priority: "high",
    projectType: "Repair",
    pay: 180.00,
    payType: "fixed",
    scheduleDate: "2026-04-22",
    scheduleTime: "09:00 AM EST",
    source: "Imported",
    assignedAt: "2026-04-18T12:00:00Z",
    updatedAt: "2026-04-22T17:30:00Z",
  },
  {
    id: "asmt-1779663113690",
    workOrderId: "asmt-1779663113690",
    techId: TECH_AUTH_UID,
    assignedTechnicianId: TECH_AUTH_UID,
    status: "completed",
    title: "Site Wireless Audit",
    description: "Comprehensive heat map and coverage audit.",
    location: "100 Renaissance Center, Detroit, MI 48243",
    clientName: "Premium Brands",
    priority: "low",
    projectType: "Survey",
    pay: 300.00,
    payType: "fixed",
    scheduleDate: "2026-04-23",
    scheduleTime: "01:00 PM EST",
    source: "Imported",
    assignedAt: "2026-04-18T13:00:00Z",
    updatedAt: "2026-04-23T16:00:00Z",
  }
];

const weeklyLogs = [
  {
    id: 'wl-corey-current',
    technicianId: TECH_AUTH_UID,
    weekOf: '04-20-2026',
    status: 'Draft',
    items: [
      { id: 'wli-1', workOrderId: 'asmt-1779643575487', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false },
      { id: 'wli-2', workOrderId: 'asmt-1779646123386', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false },
      { id: 'wli-3', workOrderId: 'asmt-1779646128334', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false },
      { id: 'wli-4', workOrderId: 'asmt-1779663113690', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false }
    ],
    reimbursements: [],
    totalPayout: 1080.00,
  }
];

async function writeFlat(collection: string, docs: any[]) {
  for (const doc of docs) {
    const { id, ...data } = doc;
    await db.collection(collection).doc(id as string).set(data);
    console.log(`  ✅  ${collection}/${id}`);
  }
}

async function seed() {
  console.log("\n🚀  Aaromach seed starting…\n");
  await writeFlat("users", users);
  await writeFlat("assignments", assignments);
  await writeFlat("weeklyLogs", weeklyLogs);
  console.log("\n✅  Seed complete.\n");
  process.exit(0);
}

seed().catch((err: Error) => {
  console.error("\n❌  Seed failed:", err.message ?? err);
  process.exit(1);
});
