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
    currentWorkload: 2,
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
    currentWorkload: 3,
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
    id: 'wo-103',
    title: 'Smart Thermostat Deployment',
    description: 'Install new smart thermostat and verify network connectivity.',
    location: '789 Pine Ave, Dearborn, MI 48124',
    requiredSkills: ['Electrical', 'Smart Home'],
    priority: 'low',
    status: 'unassigned',
    clientName: 'Smart Home Solutions',
    projectType: 'Installation',
    scheduleDate: '2026-04-25', 
    scheduleTime: '10:00 AM EST',
    pay: 120.00,
    payType: 'fixed',
    source: 'Manual',
  }
];

export const assignments: WorkOrder[] = [
  {
    id: 'asmt-001',
    workOrderId: 'wo-101',
    title: 'Fiber Splicing - Rack 4',
    description: 'Emergency Fiber Splicing - Rack 4. Restoration of critical uplinks.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Fiber Optics', 'Networking'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Repair',
    scheduleDate: '2026-04-20',
    scheduleTime: '09:00 AM EST',
    pay: 450.00,
    payType: 'fixed',
    isAcknowledged: false,
    source: 'Manual',
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
      { id: 'wli-corey-1', workOrderId: 'asmt-001', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false }
    ],
    reimbursements: [],
    totalPayout: 450.00,
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
