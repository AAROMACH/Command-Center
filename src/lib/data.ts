import type { Technician, WorkOrder, Project, ProjectDocument, TimesheetLog, ServiceRequest, AssignmentTimeLog, WeeklyLog, FinancialRecord, TimeOffRequest, SiteRequest, ReliabilityEvent, ProjectDailyLog, Expense, Report, Invoice, AdminMessage } from './types';
import { PlaceHolderImages } from './placeholder-images';

const getImageUrl = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const technicians: Technician[] = [
  {
    id: 'iktec1F0B8TSYhD8F4zh8dQr3mx1',
    name: 'System Administrator',
    role: 'Super Admin',
    roles: ['super_admin'],
    email: 'admin@aaromach.com',
    phone: '555-000-0000',
    currentLocation: 'Detroit, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 0,
    skills: ['Management', 'Operations'],
    avatarUrl: getImageUrl('user-avatar-1'),
    availability: {},
    workPreferences: {
      preferredRadius: 0,
      maxTravelDistance: 0,
      preferredJobTypes: [],
      availabilityOverride: true,
    }
  },
  {
    id: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    name: 'Corey Williams',
    role: 'Project Manager',
    roles: ['project_manager', 'field_technician'],
    email: 'cwilliams@aaromach.com',
    phone: '555-200-3000',
    address: '32701 Annapolis St, Wayne, MI 48184, USA',
    hourlyRate: 65,
    emergencyContact: {
      name: 'Dana Williams',
      relation: 'Spouse',
      phone: '555-200-9999'
    },
    currentLocation: 'Detroit, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 4,
    skills: ['Cabling', 'Networking', 'Camera Systems', 'Low Voltage'],
    avatarUrl: getImageUrl('technician-6'),
    availability: {
      'monday': { start: '08:00', end: '17:00' },
      'tuesday': { start: '08:00', end: '17:00' },
      'wednesday': { start: '08:00', end: '17:00' },
      'thursday': { start: '08:00', end: '17:00' },
      'friday': { start: '08:00', end: '17:00' },
      'saturday': null,
      'sunday': null,
    },
    workPreferences: {
      preferredRadius: 40,
      maxTravelDistance: 80,
      preferredJobTypes: ['Networking', 'Camera Systems'],
      availabilityOverride: false,
    },
    payoutPreferences: { method: 'ach', notes: null }
  },
  {
    id: 'tech-001',
    name: 'Alex Johnson',
    role: 'Lead Field Technician',
    roles: ['project_lead', 'field_technician'],
    email: 'alex.j@aaromach.com',
    phone: '555-111-2222',
    address: '123 Woodward Ave, Detroit, MI 48201',
    hourlyRate: 65,
    emergencyContact: {
      name: 'Sarah Johnson',
      relation: 'Spouse',
      phone: '555-111-9999'
    },
    currentLocation: 'Detroit, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 0,
    skills: ['HVAC', 'Plumbing', 'Electrical', 'Cabling'],
    avatarUrl: getImageUrl('technician-1'),
    availability: {
      'monday': { start: '08:00', end: '17:00' },
      'tuesday': { start: '08:00', end: '17:00' },
      'wednesday': { start: '08:00', end: '17:00' },
      'thursday': { start: '08:00', end: '17:00' },
      'friday': { start: '08:00', end: '17:00' },
      'saturday': null,
      'sunday': null,
    },
    workPreferences: {
      preferredRadius: 25,
      maxTravelDistance: 50,
      preferredJobTypes: ['HVAC', 'Electrical'],
      availabilityOverride: false,
    }
  },
  {
    id: 'C9s3CIeWpFOgMOMEgmq1yjf9g9f2',
    name: 'Premium Brands Contact',
    role: 'Client Lead',
    roles: ['client'],
    email: 'client@premiumbrands.com',
    phone: '555-700-1000',
    clientCompany: 'Premium Brands',
    businessType: 'Retail',
    currentLocation: 'Troy, MI',
    reliabilityScore: 100,
    currentWorkload: 0,
    skills: [],
    avatarUrl: getImageUrl('technician-4'),
    availability: {},
    managedSites: [
      { id: 'site-det-01', name: 'Detroit Renaissance Data Center', location: '100 Renaissance Center, Detroit, MI 48243' }
    ],
    planId: 'plan_0002', 
    subscriptionStatus: 'active',
    workPreferences: {
      preferredRadius: 0,
      maxTravelDistance: 0,
      preferredJobTypes: [],
      availabilityOverride: true,
    }
  }
];

export const workOrders: WorkOrder[] = [
  {
    id: 'wo-189372',
    title: 'IDF Rack Stabilization',
    description: 'Mount secondary stabilization rails for core switch racks in IDF-4.',
    location: '2000 Town Center, Southfield, MI 48075',
    requiredSkills: ['Rack & Stack', 'Low Voltage'],
    priority: 'medium',
    status: 'unassigned',
    clientName: 'Town Center Management',
    projectType: 'Installation',
    scheduleDate: '2026-05-30',
    scheduleTime: '10:00 AM EST',
    pay: 150.00,
    payType: 'fixed',
    source: 'Manual',
  }
];

export const assignments: WorkOrder[] = [
  {
    id: 'asmt-1779643575487',
    title: 'Network Optimization',
    description: 'Optimize network routing and firewall rules.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Networking', 'Cybersecurity'],
    priority: 'high',
    status: 'completed',
    techId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Troubleshooting',
    scheduleDate: '2026-04-20',
    scheduleTime: '08:00 AM EST',
    pay: 250.00,
    payType: 'fixed',
    source: 'Imported',
  },
  {
    id: 'asmt-1779646123386',
    title: 'CCTV Expansion',
    description: 'Install 4 additional IP cameras and configure NVR.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Low Voltage', 'Networking'],
    priority: 'medium',
    status: 'completed',
    techId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Installation',
    scheduleDate: '2026-04-21',
    scheduleTime: '10:00 AM EST',
    pay: 350.00,
    payType: 'fixed',
    source: 'Imported',
  },
  {
    id: 'asmt-1779646128334',
    title: 'Fiber Patching',
    description: 'Patch fiber uplinks for floor 12 switch stack.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Fiber Optics'],
    priority: 'high',
    status: 'completed',
    techId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Repair',
    scheduleDate: '2026-04-22',
    scheduleTime: '09:00 AM EST',
    pay: 180.00,
    payType: 'fixed',
    source: 'Imported',
  },
  {
    id: 'asmt-1779663113690',
    title: 'Site Wireless Audit',
    description: 'Comprehensive heat map and coverage audit.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Wireless', 'Survey'],
    priority: 'low',
    status: 'completed',
    techId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Survey',
    scheduleDate: '2026-04-23',
    scheduleTime: '01:00 PM EST',
    pay: 300.00,
    payType: 'fixed',
    source: 'Imported',
  }
];

export const projects: Project[] = [];

export const projectDocuments: ProjectDocument[] = [];
export const timesheetLogs: TimesheetLog[] = [];
export const serviceRequests: ServiceRequest[] = [];
export const assignmentTimeLogs: AssignmentTimeLog[] = [];

export const weeklyLogs: WeeklyLog[] = [
  {
    id: 'wl-corey-current',
    technicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    weekOf: '04-20-2026',
    status: 'Draft',
    items: [
      { id: 'wli-1', workOrderId: 'asmt-1779643575487', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, jobPay: 250, confirmationStatus: 'confirmed' },
      { id: 'wli-2', workOrderId: 'asmt-1779646123386', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, jobPay: 350, confirmationStatus: 'confirmed' },
      { id: 'wli-3', workOrderId: 'asmt-1779646128334', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, jobPay: 180, confirmationStatus: 'confirmed' },
      { id: 'wli-4', workOrderId: 'asmt-1779663113690', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, jobPay: 300, confirmationStatus: 'confirmed' }
    ],
    reimbursements: [],
    totalPayout: 1080.00,
  }
];

export const timeOffRequests: TimeOffRequest[] = [];
export const siteRequests: SiteRequest[] = [];
export const penaltyEvents: ReliabilityEvent[] = [];
export const projectDailyLogs: ProjectDailyLog[] = [];
export const expenses: Expense[] = [];
export const reports: Report[] = [];
export const invoices: Invoice[] = [];
export const adminMessages: AdminMessage[] = [
  {
    id: 'msg-001',
    senderId: 'iktec1F0B8TSYhD8F4zh8dQr3mx1',
    senderName: 'System Admin',
    subject: 'System Maintenance Window',
    body: 'The Command Center will undergo scheduled maintenance tonight at 23:00 EST.',
    timestamp: new Date().toISOString(),
    type: 'warning',
    targetPortal: 'all'
  }
];
