import type { Technician, WorkOrder, Project, ProjectDocument, TimesheetLog, ServiceRequest, AssignmentTimeLog, WeeklyLog, FinancialRecord, TimeOffRequest, SiteRequest, ReliabilityEvent, ProjectDailyLog, Expense, Report, Invoice, AdminMessage } from './types';
import { PlaceHolderImages } from './placeholder-images';

const getImageUrl = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const technicians: Technician[] = [
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
      name: ' Sarah Johnson',
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
    id: 'tech-002',
    name: 'Maria Garcia',
    role: 'Appliance Specialist',
    roles: ['field_technician'],
    email: 'maria.g@aaromach.com',
    phone: '555-222-3333',
    address: '456 W Lafayette Blvd, Detroit, MI 48226',
    hourlyRate: 55,
    emergencyContact: {
      name: 'Luis Garcia',
      relation: 'Brother',
      phone: '555-222-8888'
    },
    currentLocation: 'Detroit, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 2,
    skills: ['Electrical', 'Appliance Repair', 'Refrigeration'],
    avatarUrl: getImageUrl('technician-2'),
     availability: {
      'monday': { start: '09:00', end: '18:00' },
      'tuesday': { start: '09:00', end: '18:00' },
      'wednesday': { start: '09:00', end: '18:00' },
      'thursday': { start: '09:00', end: '18:00' },
      'friday': { start: '09:00', end: '14:00' },
      'saturday': null,
      'sunday': null,
    },
    workPreferences: {
      preferredRadius: 15,
      maxTravelDistance: 30,
      preferredJobTypes: ['Appliance Repair', 'Refrigeration'],
      availabilityOverride: true,
    }
  },
  {
    id: 'admin-001',
    name: 'System Admin',
    role: 'System Administrator',
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
    role: 'Operational Admin',
    roles: ['dispatch_admin', 'field_technician'],
    email: 'cwilliams@aaromach.com',
    phone: '555-666-7777',
    address: '303 E Milwaukee Ave, Detroit, MI 48202',
    hourlyRate: 60,
    emergencyContact: {
      name: 'Michael Williams',
      relation: 'Father',
      phone: '555-666-8888',
    },
    currentLocation: 'Detroit, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 2,
    skills: ['Strategic Planning', 'Procurement', 'Network Infrastructure'],
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
      preferredRadius: 50,
      maxTravelDistance: 100,
      preferredJobTypes: ['Cabling', 'Networking'],
      availabilityOverride: true,
    }
  },
  {
    id: 'tech-003',
    name: 'David Smith',
    role: 'Senior Technician',
    roles: ['field_technician'],
    email: 'david.s@aaromach.com',
    phone: '555-333-4444',
    address: '789 N Old Woodward Ave, Birmingham, MI 48009',
    hourlyRate: 75,
    emergencyContact: {
      name: 'Emily Smith',
      relation: 'Spouse',
      phone: '555-333-7777',
    },
    currentLocation: 'Birmingham, MI',
    reliabilityScore: 100,
    reliabilityTier: 'Elite',
    currentWorkload: 5,
    skills: ['Plumbing', 'Carpentry', 'Welding'],
    avatarUrl: getImageUrl('technician-3'),
     availability: {
      'monday': { start: '07:00', end: '16:00' },
      'tuesday': { start: '07:00', end: '16:00' },
      'wednesday': { start: '07:00', end: '16:00' },
      'thursday': { start: '07:00', end: '16:00' },
      'friday': { start: '07:00', end: '16:00' },
      'saturday': { start: '09:00', end: '13:00' },
      'sunday': null,
    },
    workPreferences: {
      preferredRadius: 30,
      maxTravelDistance: 60,
      preferredJobTypes: ['Plumbing', 'Construction'],
      availabilityOverride: false,
    }
  },
  {
    id: 'client-001',
    name: 'Jane Smith',
    role: 'Procurement Manager',
    roles: ['client'],
    email: 'jane.smith@globalcorp.com',
    phone: '555-999-8888',
    clientCompany: 'Global Corp',
    businessType: 'Enterprise Technology',
    currentLocation: 'Southfield, MI',
    reliabilityScore: 100,
    currentWorkload: 0,
    skills: [],
    avatarUrl: getImageUrl('technician-5'),
    availability: {},
    planId: 'std-3', // Enterprise
    subscriptionStatus: 'active',
    workPreferences: {
      preferredRadius: 0,
      maxTravelDistance: 0,
      preferredJobTypes: [],
      availabilityOverride: true,
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
  },
  {
    id: 'client-003',
    name: 'Robert Miller',
    role: 'Facility Director',
    roles: ['client'],
    email: 'rmiller@metrolabs.io',
    phone: '555-777-6666',
    clientCompany: 'Metro Labs',
    businessType: 'Research & Dev',
    currentLocation: 'Ann Arbor, MI',
    reliabilityScore: 100,
    currentWorkload: 0,
    skills: [],
    avatarUrl: getImageUrl('technician-2'),
    availability: {},
    subscriptionStatus: 'pending',
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
    scheduleDate: '07-29-2024', 
    scheduleTime: '10:00 AM EST',
    pay: 120.00,
    payType: 'fixed',
    source: 'Manual',
  },
   {
    id: 'wo-105',
    title: 'Electrical Registry Audit',
    description: 'Full electrical wiring inspection across all server racks.',
    location: '555 Market St, Detroit, MI 48226',
    requiredSkills: ['Electrical'],
    priority: 'high',
    status: 'unassigned',
    clientName: 'Corporate Tower Mgmt',
    projectType: 'Inspection',
    scheduleDate: '08-01-2024',
    scheduleTime: '09:00 AM EST',
    pay: 600.00,
    payType: 'fixed',
    source: 'Manual',
  }
];

export const assignments: WorkOrder[] = [
  {
    id: 'wo-101',
    title: 'Faucet Leak Repair',
    description: 'Fix leaking faucet in main bathroom. Standard plumbing mission.',
    location: '123 Main St, Royal Oak, MI 48067',
    requiredSkills: ['Plumbing'],
    priority: 'medium',
    status: 'assigned',
    assignedTechnicianId: 'tech-003',
    clientName: 'Residential Client',
    projectType: 'Maintenance',
    scheduleDate: '07-20-2024',
    scheduleTime: '11:00 AM EST',
    pay: 150.00,
    payType: 'fixed',
    isAcknowledged: true,
    source: 'Manual',
    history: [
      { type: 'tech_swap', date: '07-19-2024', details: 'Technician swapped from tech-001 to tech-003 due to scheduling conflict.', user: 'Corey Williams' }
    ]
  },
  {
    id: 'wo-102',
    title: 'AC Unit Restoration',
    description: 'Repair central AC unit not cooling. Commercial grade property.',
    location: '456 Oak St, Ferndale, MI 48220',
    requiredSkills: ['HVAC', 'Electrical'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Commercial Property',
    projectType: 'Repair',
    scheduleDate: '07-28-2024',
    scheduleTime: '02:00 PM EST',
    pay: 350.00,
    payType: 'fixed',
    isAcknowledged: false,
    source: 'Client',
    history: [
        { type: 'note', date: '07-27-2024', details: 'Site access confirmed with building manager. Parking permit staged.', user: 'System Admin' }
    ]
  },
  {
    id: 'wo-104',
    title: 'Refrigerator Compressor Fix',
    description: 'Broken refrigerator compressor. Immediate response required.',
    location: '321 Elm St, Pontiac, MI 48341',
    requiredSkills: ['Appliance Repair'],
    priority: 'critical',
    status: 'completed',
    assignedTechnicianId: 'tech-002',
    clientName: 'Restaurant Supply Co.',
    projectType: 'Repair',
    scheduleDate: '07-25-2024',
    scheduleTime: '4:00 PM EST',
    pay: 475.00,
    payType: 'fixed',
    isAcknowledged: true,
    finalPay: 500.50,
    source: 'Manual',
    reimbursements: [
        { id: 'fr-1', technicianId: 'tech-002', date: '07-25-2024', type: 'reimbursement', amount: 25.50, description: 'Emergency parts courier' }
    ],
    history: [
        { type: 'status_change', date: '07-25-2024', details: 'Mission finalized. Site verified clean.', user: 'Maria Garcia' }
    ]
  },
   {
    id: 'wo-106',
    title: 'Water Heater Upgrade',
    description: 'Water heater replacement. Deinstall old unit, calibrate new system.',
    location: '888 Woodward Ave, Detroit, MI 48226',
    requiredSkills: ['Plumbing', 'HVAC'],
    priority: 'medium',
    status: 'in-progress',
    assignedTechnicianId: 'tech-001',
    clientName: 'Apartment Complex',
    projectType: 'Replacement',
    scheduleDate: '07-28-2024',
    scheduleTime: '01:00 PM EST',
    pay: 750.00,
    payType: 'fixed',
    isAcknowledged: true,
    source: 'Manual',
    history: [
        { type: 'note', date: '07-28-2024', details: 'Technician on-site. Began draining existing unit.', user: 'Alex Johnson' }
    ]
  },
  {
    id: 'wo-107',
    title: 'Terminal Rack Audit',
    description: 'Terminal Rack Audit & Labeling. High-fidelity labeling protocol required.',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Networking', 'Cabling'],
    priority: 'medium',
    status: 'completed',
    assignedTechnicianId: 'tech-001',
    clientName: 'Premium Brands',
    projectType: 'Audit',
    scheduleDate: '07-15-2024',
    scheduleTime: '09:00 AM EST',
    pay: 320.00,
    payType: 'fixed',
    isAcknowledged: true,
    finalPay: 320.00,
    source: 'Manual',
    history: [
      { type: 'status_change', date: '07-15-2024', details: 'Finalized audit manifest uploaded. All racks verified.', user: 'Alex Johnson' }
    ]
  },
  {
    id: 'wo-corey-1',
    title: 'Fiber Splicing - Rack 4',
    description: 'Emergency Fiber Splicing - Rack 4. Restoration of critical uplinks.',
    location: 'Detroit Data Center, Detroit, MI 48201',
    requiredSkills: ['Fiber Optics', 'Networking'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: '1SWDGFnDF6Z4ylbf2AQgRhLua6w2',
    clientName: 'Premium Brands',
    projectType: 'Repair',
    scheduleDate: '07-28-2024',
    scheduleTime: '09:00 AM EST',
    pay: 450.00,
    payType: 'fixed',
    isAcknowledged: false,
    source: 'Manual',
  }
];

export const projects: Project[] = [
  {
    id: 'proj-001',
    name: 'Ki9 Refresh',
    client: 'Ki9',
    location: 'Detroit, MI',
    status: 'active',
    startDate: '04-18-2026',
    startTime: '9:00 AM EDT',
    estimatedDuration: '2 weeks',
    assignedTechnicianIds: ['tech-003', 'tech-001'],
    team: [{ technicianId: 'tech-003', role: 'Project Lead' }, { technicianId: 'tech-001', role: 'Cabling Tech'}],
    scope: 'All PCs — full hardware refresh across site. Scope includes deinstallation of old equipment, packing for shipment, and installation of new desktops, monitors, and peripherals at all workstations.',
    onsiteContactName: 'John Doe',
    onsiteContactPhone: '555-123-4567',
    siteAccessInstructions: 'Check in at front desk, badge required. Parking in Lot B. All personnel must wear safety vests while on the warehouse floor. Entry code for server room is 4821.',
    siteHazardNotes: [
      { id: 'h1', text: 'Forklift On-Site', type: 'danger'},
      { id: 'h2', text: 'Active Warehouse', type: 'info'},
    ],
    projectBudget: 15000,
    estimatedHours: 80,
    actualBudget: 7500,
    actualHours: 42,
    phases: [
      {
        id: 'phase-1',
        phaseNumber: 1,
        name: 'Deinstallation',
        notes: 'All de-installed equipment must be audited against the asset list before moving to packing.',
        tasks: [
          { id: 't1-1', name: 'Remove existing cabling', isCompleted: true, requiresPhoto: true, estimatedHours: 4 },
          { id: 't1-2', name: 'Disconnect all peripherals', isCompleted: true, requiresPhoto: false, estimatedHours: 8 },
          { id: 't1-3', name: 'Remove desktops from workstations', isCompleted: true, requiresPhoto: true, estimatedHours: 12 },
        ],
      },
      {
        id: 'phase-2',
        phaseNumber: 2,
        name: 'Packing of Old Equipment',
        notes: 'Use provided packaging materials only. All boxes must be labeled with the Ki9 standard return label format.',
        tasks: [
          { id: 't2-1', name: 'Box items', isCompleted: true, requiresPhoto: false, estimatedHours: 16 },
          { id: 't2-2', name: 'Add return labels', isCompleted: false, requiresPhoto: false, estimatedHours: 4 },
          { id: 't2-3', name: 'Take pictures of packed items', isCompleted: false, requiresPhoto: true, estimatedHours: 2 },
        ],
      },
    ],
  },
  {
    id: 'proj-002',
    name: 'Global Corp HQ AV Fit-out',
    client: 'Global Corp',
    location: 'Detroit, MI',
    status: 'active',
    startDate: '05-01-2026',
    startTime: '8:00 AM EDT',
    estimatedDuration: '3 weeks',
    assignedTechnicianIds: ['tech-001', 'tech-004'],
    team: [{ technicianId: 'tech-001', role: 'Project Lead' }, { technicianId: 'tech-004', role: 'AV Specialist'}],
    scope: 'Full AV system installation for new headquarters. Includes 5 conference rooms, 2 event spaces, and digital signage throughout the building.',
    onsiteContactName: 'Jane Smith',
    onsiteContactPhone: '555-987-6543',
    siteAccessInstructions: 'Report to security on the ground floor. Hard hats required at all times. All tools must be inspected and tagged.',
    siteHazardNotes: [
      { id: 'h3', text: 'Active construction zone', type: 'danger'},
    ],
    projectBudget: 75000,
    estimatedHours: 240,
    actualBudget: 12000,
    actualHours: 35,
    phases: [
      {
        id: 'phase-3',
        phaseNumber: 1,
        name: 'Cabling & Infrastructure',
        notes: 'Run all necessary HDMI, Cat6, and speaker wire to designated locations as per the blueprint.',
        tasks: [
          { id: 't3-1', name: 'Run conduit in main conference room', isCompleted: true, requiresPhoto: false, estimatedHours: 24 },
          { id: 't3-2', name: 'Pull all AV cabling for Room 101', isCompleted: false, requiresPhoto: true, estimatedHours: 40 },
          { id: 't3-3', name: 'Terminate all Cat6 runs', isCompleted: false, requiresPhoto: false, estimatedHours: 16 },
        ],
      },
       {
        id: 'phase-4',
        phaseNumber: 2,
        name: 'Hardware Installation',
        notes: '',
        tasks: [
          { id: 't4-1', name: 'Mount displays in all conference rooms', isCompleted: false, requiresPhoto: true, estimatedHours: 32 },
          { id: 't4-2', name: 'Install ceiling speakers', isCompleted: false, requiresPhoto: true, estimatedHours: 16 },
        ],
      },
    ],
  }
];

export const projectDocuments: ProjectDocument[] = [
  { id: 'doc-1', name: 'Site_Floor_Plan_Detroit.pdf', type: 'pdf', uploader: 'System Admin', uploadDate: '04-18-2026', size: '2.4 MB', label: 'Technical Layout', projectId: 'proj-001' },
  { id: 'doc-2', name: 'Existing_Setup_Reference.jpg', type: 'img', uploader: 'Corey Williams', uploadDate: '04-18-2026', size: '1.1 MB', url: getImageUrl('site-photo-1'), label: 'Site Photo', projectId: 'proj-001' },
  { id: 'doc-3', name: 'Client_Hardware_Spec.docx', type: 'doc', uploader: 'System Admin', uploadDate: '04-17-2026', size: '340 KB', label: 'Hardware Registry', projectId: 'proj-001' }
];

export const timesheetLogs: TimesheetLog[] = [
  {
    assignmentId: 'ts-1',
    projectId: 'proj-001',
    technicianId: 'tech-003', 
    date: '04-18-2026',
    checkInTime: '8:04 AM',
    checkOutTime: '12:31 PM',
    totalHours: '4h 27m',
    totalMinutes: 267,
    logSummary: 'Deinstalled existing network switches in server room. Began boxing units for return shipment.',
    completedTasks: ['Box items'],
    inProgressTasks: ['Remove existing cabling'],
    photos: [getImageUrl('site-photo-1'), getImageUrl('site-photo-2')],
  }
];

export const serviceRequests: ServiceRequest[] = [
    { id: 'req-001', clientName: 'Global Corp', location: '42 Woodward Ave, Detroit, MI 48201', requestType: 'Installation', description: 'Office-wide network cabling installation for new engineering wing.', status: 'new', submittedDate: '07-22-2024', priority: 'high' },
    { id: 'req-002', clientName: 'Premium Brands', location: 'Detroit Data Center', requestType: 'Repair', description: 'MDF Cooling failure reported in Rack 4A.', status: 'new', submittedDate: '07-28-2024', priority: 'critical' }
];

export const assignmentTimeLogs: AssignmentTimeLog[] = [
  { id: 'atl-1', workOrderId: 'wo-106', technicianId: 'tech-001', checkInTime: '2024-07-28T13:00:00Z', location: '42.3314° N, 83.0458° W'}
];

export const weeklyLogs: WeeklyLog[] = [
  {
    id: 'wl-1',
    technicianId: 'tech-001',
    weekOf: '07-22-2024',
    status: 'Submitted',
    items: [
      { id: 'wli-1', workOrderId: 'wo-104', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, confirmationStatus: 'confirmed' }
    ],
    reimbursements: [],
    totalPayout: 2150.50,
  }
];

export const timeOffRequests: TimeOffRequest[] = [
  { id: 'tor-1', technicianId: 'tech-001', startDate: '08-15-2024', endDate: '08-16-2024', type: 'Vacation', reason: 'Family trip', status: 'approved' }
];

export const siteRequests: SiteRequest[] = [
  { id: 'sr-1', clientId: 'client-001', clientName: 'Global Corp', siteName: 'Detroit Data Center', location: '42 Woodward Ave, Detroit, MI 48201', managerName: 'Bruce Wayne', status: 'pending', submittedDate: '07-28-2024' }
];

export const penaltyEvents: ReliabilityEvent[] = [
  { id: 're-auto-1', technicianId: 'tech-001', eventType: 'missed_acknowledgment', scoreChange: -2, reason: 'System detected missed acknowledgment deadline for WO-102', createdAt: '2024-07-27T10:00:00Z', createdBy: 'system', category: 'operational_friction', eventSource: 'automatic', eventKey: 'tech-001:missed_acknowledgment:wo-102:2024-07-27' },
];

export const projectDailyLogs: ProjectDailyLog[] = [
  {
    id: 'pdl-1',
    projectId: 'proj-001',
    technicianId: 'tech-001',
    date: '04-18-2026',
    hoursWorked: 9,
    totalHours: '9h 0m',
    workSummary: 'Assisted with deinstallation and started running new CAT6A cabling.',
    taskIdsProgressed: [],
    taskIdsCompleted: ['t1-1'],
    phaseIdsWorked: ['phase-1'],
    materialsUsed: [],
    photoUrls: []
  }
];

export const expenses: Expense[] = [
    { id: 'exp-001', date: '07-25-2024', submittedBy: 'Alex Johnson', category: 'Materials', description: 'Emergency purchase of cabling', amount: 75.50, status: 'Approved', projectId: 'proj-001' }
];

export const reports: Report[] = [
    { id: 'rep-001', name: 'Q2 2024 Financial Summary', type: 'Financial', generationDate: '07-01-2024', generatedBy: 'System Administrator' }
];

export const invoices: Invoice[] = [
  {
    id: 'inv-001',
    invoiceNumber: '2024-001',
    clientId: 'client-001',
    clientName: 'Global Corp',
    projectId: 'proj-002',
    issueDate: '07-15-2024',
    dueDate: '08-14-2024',
    status: 'paid',
    lineItems: [
      { id: 'li-1', description: 'AV Cabling & Infrastructure', quantity: 80, unitPrice: 150 }
    ],
    subtotal: 12000,
    tax: 960,
    total: 12960,
    notes: 'Payment received.',
  }
];

export const adminMessages: AdminMessage[] = [
  {
    id: 'msg-001',
    senderId: 'admin-001',
    senderName: 'System Admin',
    subject: 'System Maintenance Window',
    body: 'The Command Center will undergo scheduled maintenance tonight at 23:00 EST.',
    timestamp: '2024-07-28T10:00:00Z',
    type: 'warning',
    targetPortal: 'all'
  }
];
