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
      name: 'Sarah Johnson',
      relation: 'Spouse',
      phone: '555-111-9999'
    },
    currentLocation: 'Detroit, MI',
    reliabilityScore: 92,
    reliabilityTier: 'Reliable',
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
    reliabilityScore: 98,
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
    id: 'staff-002',
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
    reliabilityScore: 91,
    reliabilityTier: 'Reliable',
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
    reliabilityScore: 68,
    reliabilityTier: 'Restricted',
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
    reliabilityScore: 94,
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
    id: 'client-002',
    name: 'Test Stakeholder',
    role: 'Client Lead',
    roles: ['client'],
    email: 'testclient@org.com',
    phone: '555-123-9999',
    clientCompany: 'Test Organization',
    businessType: 'Consulting',
    currentLocation: 'Troy, MI',
    reliabilityScore: 100,
    currentWorkload: 0,
    skills: [],
    avatarUrl: getImageUrl('technician-4'),
    availability: {},
    managedSites: [
      { id: 'site-det-01', name: 'Detroit Renaissance Data Center', location: '100 Renaissance Center, Detroit, MI 48243' }
    ],
    planId: 'std-2', // Professional
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
    id: 'wo-101',
    description: 'Fix leaking faucet in main bathroom',
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
    description: 'Repair central AC unit not cooling',
    location: '456 Oak St, Ferndale, MI 48220',
    requiredSkills: ['HVAC', 'Electrical'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: 'tech-001',
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
    id: 'wo-103',
    description: 'Install new smart thermostat',
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
    id: 'wo-104',
    description: 'Broken refrigerator compressor',
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
    id: 'wo-18965948',
    description: 'Tech for Hospitality Site Inspection Survey',
    location: 'Monroe, MI 48162',
    requiredSkills: ['Inspection', 'Hospitality'],
    priority: 'medium',
    status: 'completed',
    assignedTechnicianId: 'tech-001',
    clientName: 'NCR Voyix - Restaurants',
    projectType: 'Survey',
    scheduleDate: '05-18-2026',
    scheduleTime: '09:00 AM EDT',
    pay: 110.00,
    payType: 'hourly',
    isAcknowledged: true,
    source: 'Imported',
  },
   {
    id: 'wo-105',
    description: 'Full electrical wiring inspection',
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
  },
   {
    id: 'wo-106',
    description: 'Water heater replacement',
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
    description: 'Terminal Rack Audit & Labeling',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Networking', 'Cabling'],
    priority: 'medium',
    status: 'completed',
    assignedTechnicianId: 'tech-001',
    clientName: 'Test Organization',
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
    id: 'wo-108',
    description: 'Emergency Switch Calibration',
    location: '100 Renaissance Center, Detroit, MI 48243',
    requiredSkills: ['Networking'],
    priority: 'critical',
    status: 'in-progress',
    assignedTechnicianId: 'tech-001',
    clientName: 'Test Organization',
    projectType: 'Troubleshooting',
    scheduleDate: '07-28-2024',
    scheduleTime: '09:00 AM EST',
    pay: 250.00,
    payType: 'fixed',
    isAcknowledged: true,
    source: 'Manual',
    history: [
      { type: 'note', date: '07-28-2024', details: 'Technician arrived on-site. Beginning diagnostics on core switch.', user: 'Alex Johnson' }
    ]
  },
  {
    id: 'wo-mock-88',
    description: 'Audit Server Rack Terminations',
    location: '999 Tech Plaza, Detroit, MI 48201',
    requiredSkills: ['Networking', 'Cabling'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: 'tech-001',
    clientName: 'Cloud Solutions Inc.',
    projectType: 'Audit',
    scheduleDate: '07-28-2024',
    scheduleTime: '10:00 AM EST',
    pay: 220.00,
    payType: 'fixed',
    isAcknowledged: false,
    source: 'Manual',
  },
  {
    id: 'wo-corey-1',
    description: 'Emergency Fiber Splicing - Rack 4',
    location: 'Detroit Data Center, Detroit, MI 48201',
    requiredSkills: ['Fiber Optics', 'Networking'],
    priority: 'high',
    status: 'assigned',
    assignedTechnicianId: 'staff-002',
    clientName: 'DataConnect LLC',
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
  },
  {
    id: 'proj-003',
    name: 'Enterprise Data Center Migration',
    client: 'Target Solutions',
    location: 'Detroit, MI',
    status: 'completed',
    startDate: '2024-06-01',
    startTime: '08:00 AM EDT',
    estimatedDuration: '4 weeks',
    assignedTechnicianIds: ['tech-001'],
    team: [{ technicianId: 'tech-001', role: 'Project Lead' }],
    scope: 'Complete migration of 500+ physical servers and corresponding infrastructure to new Tier 4 facility.',
    onsiteContactName: 'Robert House',
    onsiteContactPhone: '555-702-0001',
    siteAccessInstructions: 'Biometric scanning required for floor entry. All equipment must be logged via manifest barcode.',
    siteHazardNotes: [
      { id: 'h-final-1', text: 'High Voltage Environment', type: 'danger'},
    ],
    projectBudget: 150000,
    estimatedHours: 450,
    actualBudget: 148500,
    actualHours: 442,
    phases: [
      {
        id: 'phase-final-1',
        phaseNumber: 1,
        name: 'Pre-Audit & Mapping',
        notes: 'Finalized mapping schema for all racks.',
        tasks: [
          { id: 't-final-1', name: 'Log all existing asset tags', isCompleted: true, requiresPhoto: false, estimatedHours: 40 },
          { id: 't-final-2', name: 'Verify fiber connectivity paths', isCompleted: true, requiresPhoto: true, estimatedHours: 80 },
        ],
      }
    ],
  },
  {
    id: 'proj-004',
    name: 'Metropolis Hub Security Upgrade',
    client: 'Global Corp',
    location: 'Warren, MI',
    status: 'on-hold',
    startDate: '2024-06-15',
    estimatedDuration: '2 months',
    assignedTechnicianIds: ['tech-001'],
    team: [{ technicianId: 'tech-001', role: 'Security Lead' }],
    scope: 'Installation of 200+ IP cameras and integrated access control system.',
    siteHazardNotes: [],
    projectBudget: 50000,
    estimatedHours: 200,
    phases: [],
  },
  {
    id: 'proj-999',
    name: 'Regional Fiber Backbone',
    client: 'Metro Comm',
    location: 'Detroit, MI',
    status: 'active',
    startDate: '2024-07-10',
    startTime: '7:30 AM EST',
    estimatedDuration: '8 weeks',
    assignedTechnicianIds: ['tech-001'],
    team: [{ technicianId: 'tech-001', role: 'Infrastructure Lead' }],
    scope: 'High-density fiber rollout for metro sector. Requires strict adherence to splicing standards and GPS documentation of all vaults.',
    onsiteContactName: 'Bill Miller',
    onsiteContactPhone: '555-900-1111',
    siteHazardNotes: [],
    projectBudget: 125000,
    estimatedHours: 600,
    actualBudget: 22000,
    actualHours: 85,
    phases: [],
  },
  {
    id: 'proj-corey-hospital',
    name: 'Metro Hospital Wi-Fi Expansion',
    client: 'City Health Systems',
    location: 'Royal Oak, MI',
    status: 'active',
    startDate: '2024-07-15',
    startTime: '08:00 AM EST',
    estimatedDuration: '4 weeks',
    assignedTechnicianIds: ['staff-002', 'tech-002'],
    team: [{ technicianId: 'staff-002', role: 'Project Lead' }, { technicianId: 'tech-002', role: 'Network Specialist'}],
    scope: 'Installation of 50 additional access points across the pediatric and surgery wings. Includes ceiling mounts and ethernet termination.',
    onsiteContactName: 'Dr. Aris',
    onsiteContactPhone: '555-444-3333',
    siteAccessInstructions: 'Enter through Service Entrance G. Badge required. PPE mandatory in surgery wing.',
    siteHazardNotes: [
      { id: 'h-corey-1', text: 'Sterile Environment', type: 'info'},
    ],
    projectBudget: 45000,
    estimatedHours: 160,
    phases: [],
  }
];

export const projectDocuments: ProjectDocument[] = [
  { id: 'doc-1', name: 'Site_Floor_Plan_Detroit.pdf', type: 'pdf', uploader: 'System Admin', uploadDate: '04-18-2026', size: '2.4 MB', label: 'Technical Layout' },
  { id: 'doc-2', name: 'Existing_Setup_Reference.jpg', type: 'img', uploader: 'Corey Williams', uploadDate: '04-18-2026', size: '1.1 MB', url: getImageUrl('site-photo-1'), label: 'Site Photo' },
  { id: 'doc-3', name: 'Client_Hardware_Spec.docx', type: 'doc', uploader: 'System Admin', uploadDate: '04-17-2026', size: '340 KB', label: 'Hardware Registry' },
  { 
    id: 'doc-4', 
    name: 'Deinstallation_Signoff.pdf', 
    type: 'pdf', 
    uploader: 'David Smith', 
    uploadDate: '04-19-2026', 
    size: '800 KB',
    phaseId: 'phase-1',
    label: 'Mission Signoff'
  },
  {
    id: 'doc-5',
    name: 'cabling_removed.jpg',
    type: 'img',
    uploader: 'David Smith',
    uploadDate: '04-19-2026',
    size: '1.8 MB',
    phaseId: 'phase-1',
    taskId: 't1-1',
    url: getImageUrl('site-photo-2'),
    label: 'Completion Evidence'
  }
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
    logSummary: 'Deinstalled existing network switches in server room. Began boxing units for return shipment. Floor plan confirmed — forklift was active in loading dock area as noted.',
    completedTasks: ['Box items'],
    inProgressTasks: ['Remove existing cabling'],
    photos: [getImageUrl('site-photo-1'), getImageUrl('site-photo-2')],
  },
   {
    assignmentId: 'ts-2',
    projectId: 'proj-001',
    technicianId: 'tech-001', 
    date: '04-18-2026',
    checkInTime: '8:01 AM',
    checkOutTime: '5:05 PM',
    totalHours: '9h 04m',
    totalMinutes: 544,
    logSummary: 'Assisted with deinstallation and started running new CAT6A cabling for the refresh. All old patch panels have been removed. Coordinated with David on server room access.',
    completedTasks: ['Remove existing cabling'],
    inProgressTasks: ['Run new cabling'],
    photos: [],
  },
  {
    assignmentId: 'ts-3',
    projectId: 'proj-001',
    technicianId: 'tech-003', 
    date: '04-19-2026',
    checkInTime: '8:30 AM',
    checkOutTime: '4:45 PM',
    totalHours: '8h 15m',
    totalMinutes: 495,
    logSummary: 'Finished boxing all old equipment and added return labels. All pallets are staged for pickup. Completed photo documentation of packed items.',
    completedTasks: ['Add return labels', 'Take pictures of packed items'],
    inProgressTasks: [],
    photos: [getImageUrl('site-photo-1')],
  }
];

export const serviceRequests: ServiceRequest[] = [
    { id: 'req-001', clientName: 'Global Corp', location: '42 Woodward Ave, Detroit, MI 48201', requestType: 'Installation', description: 'Office-wide network cabling installation for new engineering wing.', status: 'new', submittedDate: '07-22-2024', priority: 'high' },
    { id: 'req-002', clientName: 'Global Corp', location: 'Detroit Data Center', requestType: 'Repair', description: 'MDF Cooling failure reported in Rack 4A. Environmental sensors offline.', status: 'new', submittedDate: '07-28-2024', priority: 'critical' },
    { id: 'req-003', clientName: 'Global Corp', location: 'Metropolis Hub', requestType: 'Maintenance', description: 'Quarterly IDF cabling audit and labeling synchronization.', status: 'approved', submittedDate: '07-20-2024', priority: 'medium' },
    { id: 'req-004', clientName: 'Test Organization', location: '100 Renaissance Center', requestType: 'Installation', description: 'Deployment of 12 additional WAPs for the 4th floor executive suite.', status: 'new', submittedDate: '07-29-2024', priority: 'high' },
    { id: 'req-005', clientName: 'Test Organization', location: '100 Renaissance Center', requestType: 'Repair', description: 'Fiber patch lead damaged in server room. Secondary uplink unstable.', status: 'reviewed', submittedDate: '07-27-2024', priority: 'critical' },
    { id: 'req-006', clientName: 'Global Corp', location: 'Southfield, MI', requestType: 'Survey', description: 'Site survey for proposed VoIP migration. Port audit required.', status: 'reviewed', submittedDate: '07-26-2024', priority: 'medium' },
    { id: 'req-007', clientName: 'Test Organization', location: '100 Renaissance Center', requestType: 'Maintenance', description: 'UPS battery health check and load testing for MDF power system.', status: 'approved', submittedDate: '07-25-2024', priority: 'medium' },
    { id: 'req-008', clientName: 'Global Corp', location: 'Metropolis Hub', requestType: 'Repair', description: 'CCTV Camera 12 (Loading Dock) intermittent feed issues.', status: 'closed', submittedDate: '07-15-2024', priority: 'medium' },
    { id: 'req-009', clientName: 'Test Organization', location: '100 Renaissance Center', requestType: 'Installation', description: 'Conference Room 402 - AV Rack Fit-out and cable management.', status: 'closed', submittedDate: '07-10-2024', priority: 'low' },
    { id: 'req-010', clientName: 'Global Corp', location: 'Detroit Data Center', requestType: 'Decommission', description: 'Decommissioning of legacy IBM Mainframe networking gear.', status: 'new', submittedDate: '07-29-2024', priority: 'low' },
];

export const profitabilityData = [
    { id: 'proj-001', type: 'Project', name: 'Ki9 Refresh', client: 'Ki9', revenue: 15000, laborCost: 5500, materialCost: 2000, totalCost: 7500, net: 7500, margin: 50.0 },
    { id: 'wo-106', type: 'Job', name: 'Water heater replacement', client: 'Apartment Complex', revenue: 750, laborCost: 400, materialCost: 250, totalCost: 650, net: 100, margin: 13.3 },
    { id: 'wo-102', type: 'Job', name: 'Repair central AC unit', client: 'Commercial Property', revenue: 350, laborCost: 200, materialCost: 50, totalCost: 250, net: 100, margin: 28.6 },
    { id: 'wo-104', type: 'Job', name: 'Broken refrigerator', client: 'Restaurant Supply Co.', revenue: 475, laborCost: 250, materialCost: 100, totalCost: 350, net: 125, margin: 26.3 },
];

export const assignmentTimeLogs: AssignmentTimeLog[] = [
  { id: 'atl-1', workOrderId: 'wo-102', technicianId: 'tech-001', checkInTime: '2024-07-28T14:05:00Z', location: '42.3314° N, 83.0458° W'},
  { id: 'atl-2', workOrderId: 'wo-106', technicianId: 'tech-001', checkInTime: '2024-07-28T13:00:00Z', location: '42.3314° N, 83.0458° W'},
  { id: 'atl-3', workOrderId: 'wo-108', technicianId: 'tech-001', checkInTime: '2024-07-28T10:00:00Z', location: '100 Renaissance Center, Detroit, MI 48243'},
];

export const weeklyLogs: WeeklyLog[] = [
  {
    id: 'wl-1',
    technicianId: 'tech-001',
    weekOf: '07-22-2024',
    status: 'Submitted',
    items: [
      { id: 'wli-1', workOrderId: 'wo-104', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, confirmationStatus: 'confirmed' },
      { id: 'wli-2', workOrderId: 'wo-102', outcomeCode: 'worked_revisit', isComplete: false, isAdminReviewed: false, confirmationStatus: 'disputed', disputeReason: 'Revisit needed, not complete', disputeNotes: 'Building manager was not present to sign off on final testing.' },
      { id: 'wli-3', workOrderId: 'wo-18965948', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false, confirmationStatus: 'confirmed' },
    ],
    reimbursements: [
      { id: 'fr-1', technicianId: 'tech-001', date: '07-24-2024', type: 'reimbursement', amount: 25.50, description: 'Parking for wo-104' }
    ],
    missingAssignmentReports: [
      { id: 'mar-1', date: '2024-07-23', location: '100 Renaissance Center, Detroit, MI 48243', summary: 'Emergency network repair after storm. 4 hours on site.' }
    ],
    totalPayout: 2150.50,
  },
  {
    id: 'wl-alex-prev',
    technicianId: 'tech-001',
    weekOf: '07-15-2024',
    status: 'Draft',
    items: [
        { id: 'wli-a-p1', workOrderId: 'wo-101', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false }
    ],
    reimbursements: [],
    totalPayout: 450.00
  },
  {
    id: 'wl-alex-hist',
    technicianId: 'tech-001',
    weekOf: '07-08-2024',
    status: 'Approved',
    items: [],
    reimbursements: [],
    totalPayout: 1850.00
  },
  {
    id: 'wl-2',
    technicianId: 'tech-002',
    weekOf: '07-22-2024',
    status: 'Submitted',
    items: [],
    reimbursements: [],
     totalPayout: 1980.00,
  },
  {
    id: 'wl-3',
    technicianId: 'tech-003',
    weekOf: '07-15-2024',
    status: 'Approved',
    items: [],
    reimbursements: [],
    totalPayout: 1850.75,
  },
  {
    id: 'wl-mock-88',
    technicianId: 'tech-001',
    weekOf: '07-29-2024',
    status: 'Draft',
    items: [
      { id: 'wli-mock-1', workOrderId: 'wo-mock-88', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false }
    ],
    reimbursements: [],
    totalPayout: 450.00
  },
  {
    id: 'wl-corey-log',
    technicianId: 'staff-002',
    weekOf: '07-29-2024',
    status: 'Draft',
    items: [
      { id: 'wli-c-1', workOrderId: 'wo-corey-1', outcomeCode: 'worked_completed', isComplete: true, isAdminReviewed: false }
    ],
    reimbursements: [],
    totalPayout: 0,
  }
];

export const timeOffRequests: TimeOffRequest[] = [
  { id: 'tor-1', technicianId: 'tech-001', startDate: '08-15-2024', endDate: '08-16-2024', type: 'Vacation', reason: 'Family trip', status: 'approved' },
  { id: 'tor-2', technicianId: 'tech-001', startDate: '09-02-2024', endDate: '09-02-2024', type: 'Personal', reason: 'Appointment', status: 'pending' },
  { id: 'tor-3', technicianId: 'tech-003', startDate: '08-05-2024', endDate: '08-09-2024', type: 'Vacation', reason: 'Annual Leave', status: 'pending' },
  { id: 'tor-4', technicianId: 'tech-002', startDate: '07-30-2024', endDate: '07-30-2024', type: 'Sick', reason: 'Feeling unwell', status: 'approved' },
  { id: 'tor-5', technicianId: 'tech-004', startDate: '08-12-2024', endDate: '08-12-2024', type: 'Other', reason: 'Jury Duty', status: 'denied' },
];

export const siteRequests: SiteRequest[] = [
  { id: 'sr-1', clientId: 'client-001', clientName: 'Global Corp', siteName: 'Detroit Data Center', location: '42 Woodward Ave, Detroit, MI 48201', managerName: 'Bruce Wayne', status: 'pending', submittedDate: '07-28-2024' },
  { id: 'sr-2', clientId: 'client-001', clientName: 'Global Corp', siteName: 'Metropolis Hub', location: '100 W Fort St, Detroit, MI 48226', managerName: 'Clark Kent', status: 'pending', submittedDate: '07-29-2024' },
];

export const penaltyEvents: ReliabilityEvent[] = [
  { id: 're-1', technicianId: 'tech-001', eventType: 'late_check_in', scoreChange: -8, reason: 'Late check-in to critical job', createdAt: '2024-06-15T12:00:00Z', createdBy: 'System Admin', category: 'operational_friction', eventSource: 'manual' },
  { id: 're-2', technicianId: 'tech-003', eventType: 'no_show', scoreChange: -25, reason: 'Unnotified absence at Monroe site', createdAt: '2024-07-10T09:00:00Z', createdBy: 'System Admin', category: 'critical_failure', eventSource: 'manual' },
  { id: 're-3', technicianId: 'tech-003', eventType: 'poor_communication', scoreChange: -7, reason: 'Failed to respond to dispatch alerts', createdAt: '2024-07-20T14:00:00Z', createdBy: 'Corey Williams', category: 'operational_friction', eventSource: 'manual' },
  { id: 're-auto-1', technicianId: 'tech-001', eventType: 'missed_acknowledgment', scoreChange: -2, reason: 'System detected missed acknowledgment deadline for WO-102', createdAt: '2024-07-27T10:00:00Z', createdBy: 'system', category: 'operational_friction', eventSource: 'automatic', eventKey: 'tech-001:missed_acknowledgment:wo-102:2024-07-27' },
];

export const projectDailyLogs: ProjectDailyLog[] = [
  {
    id: 'pdl-1',
    projectId: 'proj-001',
    technicianId: 'tech-001',
    date: '04-18-2026',
    hoursWorked: 9,
    workSummary: 'Assisted with deinstallation and started running new CAT6A cabling for the refresh. All old patch panels have been removed. Coordinated with David on server room access.',
    taskIdsProgressed: ['t2-2'],
    taskIdsCompleted: ['t1-1', 't1-2', 't1-3'],
    phaseIdsWorked: ['phase-1', 'phase-2'],
    materialsUsed: [{ item: 'CAT6A Cable', quantity: 500 }],
    photoUrls: [getImageUrl('site-photo-2')]
  }
];

export const expenses: Expense[] = [
    { id: 'exp-001', date: '07-25-2024', submittedBy: 'Alex Johnson', category: 'Materials', description: 'Emergency purchase of 1/2" copper piping', amount: 75.50, status: 'Approved', projectId: 'proj-001' },
    { id: 'exp-002', date: '07-26-2024', submittedBy: 'Maria Garcia', category: 'Travel', description: 'Mileage reimbursement for travel to Queens site', amount: 45.20, status: 'Approved' },
    { id: 'exp-003', date: '07-27-2024', submittedBy: 'David Smith', category: 'Meals', description: 'Team lunch during Ki9 Project', amount: 88.00, status: 'Pending', projectId: 'proj-001' },
    { id: 'exp-004', date: '07-28-2024', submittedBy: 'Alex Johnson', category: 'Other', description: 'Parking at downtown commercial property', amount: 35.00, status: 'Pending' },
    { id: 'exp-005', date: '07-28-2024', submittedBy: 'David Smith', category: 'Tools', description: 'Replacement drill bit set', amount: 49.99, status: 'Rejected' },
];

export const reports: Report[] = [
    { id: 'rep-001', name: 'Q2 2024 Financial Summary', type: 'Financial', generationDate: '07-01-2024', generatedBy: 'System Administrator' },
    { id: 'rep-002', name: 'July Technician Payroll', type: 'Financial', generationDate: '07-25-2024', generatedBy: 'System Administrator' },
    { id: 'rep-003', name: 'Q2 Project Profitability Analysis', type: 'Operational', generationDate: '07-05-2024', generatedBy: 'System Administrator' },
    { id: 'rep-004', name: 'June Safety Compliance Report', type: 'Compliance', generationDate: '07-02-2024', generatedBy: 'System Administrator' },
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
      { id: 'li-1', description: 'AV Cabling & Infrastructure', quantity: 80, unitPrice: 150 },
      { id: 'li-2', description: 'Hardware Installation Labor', quantity: 40, unitPrice: 120 },
    ],
    subtotal: 16800,
    tax: 1344,
    total: 18144,
    notes: 'Payment received. Thank you!',
  },
  {
    id: 'inv-002',
    invoiceNumber: '2024-002',
    clientId: 'client-002',
    clientName: 'Acme Inc.',
    workOrderId: 'wo-106',
    issueDate: '07-28-2024',
    dueDate: '08-27-2024',
    status: 'sent',
    lineItems: [
      { id: 'li-3', description: 'Water Heater Replacement Labor', quantity: 8, unitPrice: 93.75 },
      { id: 'li-4', description: 'Materials & Parts', quantity: 1, unitPrice: 450 },
    ],
    subtotal: 1200,
    tax: 96,
    total: 1296,
  },
    {
    id: 'inv-003',
    invoiceNumber: '2024-003',
    clientId: 'client-001',
    clientName: 'Global Corp',
    issueDate: '08-01-2024',
    dueDate: '08-31-2024',
    status: 'draft',
    lineItems: [
       { id: 'li-5', description: 'Quarterly Maintenance Contract', quantity: 1, unitPrice: 2500 },
    ],
    subtotal: 2500,
    tax: 200,
    total: 2700,
    notes: 'To be sent EOD.',
  },
];

export const adminMessages: AdminMessage[] = [
  {
    id: 'msg-001',
    senderId: 'admin-001',
    senderName: 'System Admin',
    subject: 'System Maintenance Window',
    body: 'The Command Center will undergo scheduled maintenance tonight at 23:00 EST. Please finalize all sessions before the window.',
    timestamp: '2024-07-28T10:00:00Z',
    type: 'warning',
    targetPortal: 'all'
  },
  {
    id: 'msg-002',
    senderId: 'admin-001',
    senderName: 'System Admin',
    subject: 'Incomplete Field Log Policy',
    body: 'Friendly reminder to all technicians: field logs must be submitted by Monday 09:00 EST to ensure timely payout processing.',
    timestamp: '2024-07-27T14:30:00Z',
    type: 'info',
    targetPortal: 'tech'
  },
  {
    id: 'msg-003',
    senderId: 'staff-002',
    senderName: 'Corey Williams',
    subject: 'CRITICAL: Site Access Detroit',
    body: 'Badge readers at the Detroit site are currently offline. Use the temporary access code 5592 at the security gate.',
    timestamp: '2024-07-28T08:15:00Z',
    type: 'critical',
    targetPortal: 'tech'
  }
];
