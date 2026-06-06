export type AppRole = 
  | 'super_admin' 
  | 'dispatch_admin' 
  | 'payroll_admin' 
  | 'project_manager' 
  | 'project_lead' 
  | 'field_technician' 
  | 'client';

export type AdminMessage = {
  id: string;
  senderId: string;
  senderName: string;
  subject: string;
  body: string;
  timestamp: string;
  expiresAt?: string;
  isLocked?: boolean;
  type: 'critical' | 'warning' | 'info' | 'success';
  targetPortal: 'admin' | 'tech' | 'client' | 'all';
};

export type ReliabilityTier = 'Elite' | 'Reliable' | 'Monitored' | 'Restricted' | 'Suspended Review';

export type ReliabilityEventCategory = 'critical_failure' | 'operational_friction' | 'positive_recovery';

export type ReliabilityEvent = {
  id: string;
  technicianId: string;
  eventType: string;
  scoreChange: number;
  reason: string;
  relatedAssignmentId?: string;
  relatedWeeklyLogId?: string;
  relatedTicketId?: string;
  createdAt: string;
  createdBy: string;
  eventSource: 'automatic' | 'manual';
  eventKey?: string;
  category: ReliabilityEventCategory;
};

export type WorkOrder = {
  id: string;
  workOrderId?: string;
  shortId?: string;
  techId?: string;
  title: string;
  description: string;
  location: string;
  requiredSkills: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unassigned' | 'assigned' | 'confirmed' | 'on-my-way' | 'in-progress' | 'checked-out' | 'completed';
  assignedTechnicianId?: string;
  assignedTechIds?: string[];
  additionalTechnicianIds?: string[];
  clientName: string;
  projectType: 'Installation' | 'Troubleshooting' | 'Maintenance' | 'Survey' | 'Repair' | 'Decommission' | string;
  scheduleDate: string;
  scheduleTime: string;
  pay: number;
  payType: 'fixed' | 'hourly' | 'blended';
  blendedFixedPay?: number;
  blendedIncludedHours?: number;
  blendedHourlyRate?: number;
  isAcknowledged?: boolean;
  routeId?: string;
  isImported?: boolean;
  source?: 'Imported' | 'Manual' | 'Client';
  history?: { type: 'tech_swap' | 'tech_add' | 'tech_remove' | 'status_change' | 'note' | 'revisit'; date: string; details: string; user: string }[];
  notes?: string[];
  reimbursements?: FinancialRecord[];
  finalPay?: number;
  payChangeRequest?: {
    pay: number;
    payType: 'fixed' | 'hourly' | 'blended';
    requestedBy: string;
    requestedAt: string;
  };
  auditReimbursement?: number;
  auditOverhead?: number;
  isAudited?: boolean;
  auditedAt?: string;
  auditedBy?: string;
};

export type Route = {
  id: string;
  name: string;
  technicianName?: string;
  workOrderIds: string[];
};

export type Technician = {
  id: string;
  name: string;
  role: string;
  roles?: AppRole[];
  email: string;
  phone: string;
  address?: string;
  hourlyRate?: number;
  emergencyContact?: {
    name: string;
    relation: string;
    phone: string;
  };
  currentLocation: string;
  reliabilityScore: number;
  reliabilityTier?: ReliabilityTier;
  currentWorkload: number;
  skills: string[];
  avatarUrl: string;
  availability: Record<string, { start: string; end: string } | null>;
  clientCompany?: string; 
  businessType?: string;
  planId?: string;
  subscriptionStatus?: 'active' | 'pending' | 'none';
  managedSites?: { id: string; name: string; location: string }[];
  workPreferences: {
    preferredRadius: number;
    maxTravelDistance: number;
    preferredJobTypes: string[];
    availabilityOverride: boolean;
  };
  payoutPreferences?: {
    method: 'ACH' | 'Check' | 'Zelle' | 'Venmo' | string;
    notes?: string;
  };
  billingDetails?: {
    contactName: string;
    email: string;
    terms: 'Net 15' | 'Net 30' | 'Net 60' | 'Due on Receipt' | string;
    deliveryMethod: 'Email' | 'Portal' | 'Both' | string;
  };
};

export type Recommendation = {
  recommendedTechnicianId: string;
  reasoning: string;
  alternativeTechnicianIds?: string[];
};

export type ProjectTeamMember = {
  technicianId: string;
  role: string;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  location: string;
  lat?: number;
  lng?: number;
  status: 'active' | 'on-hold' | 'completed';
  startDate: string;
  startTime?: string;
  estimatedDuration: string;
  assignedTechnicianIds: string[]; 
  team: ProjectTeamMember[];
  phases: Phase[];
  scope: string;
  onsiteContactName?: string;
  onsiteContactPhone?: string;
  siteAccessInstructions?: string;
  siteHazardNotes: { id: string, text: string, type: 'info' | 'danger' }[];
  projectBudget?: number;
  estimatedHours?: number;
  actualBudget?: number;
  actualHours?: number;
};

export type Phase = {
  id: string;
  phaseNumber: number;
  name: string;
  tasks: Task[];
  notes?: string;
};

export type Task = {
  id: string;
  name: string;
  isCompleted: boolean;
  requiresPhoto: boolean;
  requiresText?: boolean;
  requiresNumeric?: boolean;
  requiresDropdown?: boolean;
  dropdownOptions?: string[];
  requiresSignature?: boolean;
  requiresFileUpload?: boolean;
  requiresOther?: boolean;
  otherRequirementLabel?: string;
  estimatedHours?: number;
};

export type ProjectDailyLog = {
  id: string;
  projectId: string;
  technicianId: string;
  date: string;
  hoursWorked: number;
  totalHours: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  workSummary: string;
  taskIdsProgressed: string[];
  taskIdsCompleted: string[];
  phaseIdsWorked: string[];
  materialsUsed: { item: string; quantity: number }[];
  photoUrls: string[];
};

export type ProjectDocument = {
  id: string;
  projectId: string;
  name: string;
  originalName?: string;
  type: 'pdf' | 'img' | 'doc' | 'csv' | 'other';
  label: string;
  uploader: string;
  uploadDate: string;
  size: string;
  phaseId?: string;
  taskId?: string;
  url?: string;
};

export type TimesheetLog = {
  assignmentId: string;
  projectId: string;
  technicianId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  totalHours: string;
  totalMinutes: number;
  logSummary: string;
  completedTasks: string[];
  inProgressTasks: string[];
  photos: string[];
};

export type ServiceRequest = {
  id: string;
  title?: string;
  clientName: string;
  location: string;
  requestType: 'Installation' | 'Troubleshooting' | 'Maintenance' | 'Survey' | 'Repair' | 'Decommission';
  description: string;
  status: 'new' | 'reviewed' | 'approved' | 'rejected' | 'closed';
  submittedDate: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  imageUrls?: string[];
  documentUrls?: string[];
  rejectionReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  closedAt?: string;
  convertedId?: string;
  conversionType?: 'assignment' | 'project';
};

export type AssignmentTimeLog = {
  id: string;
  workOrderId: string;
  technicianId: string;
  checkInTime: string;
  checkOutTime?: string;
  minutesWorked?: number;
  location: string; 
};

export type WeeklyLogItem = {
  id: string;
  workOrderId: string;
  confirmationStatus?: 'confirmed' | 'disputed';
  disputeReason?: string;
  disputeNotes?: string;
  outcomeCode: 'worked_completed' | 'worked_revisit' | 'other';
  isComplete: boolean;
  isAdminReviewed: boolean;
  jobPay: number;
};

export type MissingAssignmentReport = {
  id: string;
  assignmentId?: string;
  clientName?: string;
  date: string;
  time?: string;
  location: string;
  summary: string;
};

export type FinancialRecord = {
  id: string;
  technicianId: string;
  date: string;
  type: 'reimbursement' | 'payout' | 'penalty';
  amount: number;
  description: string;
};

export type WeeklyLog = {
  id: string;
  technicianId: string;
  weekOf: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  items: WeeklyLogItem[];
  reimbursements: FinancialRecord[];
  missingAssignmentReports?: MissingAssignmentReport[];
  totalPayout?: number;
  submittedAt?: string;
};

export type TimeOffRequest = {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  type: 'Vacation' | 'Sick' | 'Personal' | 'Other';
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
};

export type SiteRequest = {
  id: string;
  clientId: string;
  clientName: string;
  siteName: string;
  location: string;
  managerName?: string;
  managerPhone?: string;
  status: 'pending' | 'approved' | 'denied';
  submittedDate: string;
};

export type PenaltyEvent = ReliabilityEvent;

export type Expense = {
  id: string;
  date: string;
  submittedBy: string;
  category: 'Travel' | 'Materials' | 'Meals' | 'Tools' | 'Other';
  description: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  projectId?: string;
};

export type Report = {
  id: string;
  name: string;
  type: 'Financial' | 'Operational' | 'Compliance';
  generationDate: string;
  generatedBy: string;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  projectId?: string;
  workOrderId?: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  lineItems: InvoiceLineItem[];
  notes?: string;
  subtotal: number;
  tax: number;
  total: number;
};

export type PlanTier = {
  id: string;
  name: string;
  clientName?: string;
  price: number;
  billingPeriod: 'monthly' | 'quarterly' | 'annual';
  features: string[];
  siteLimit: number;
  responseTime: string;
  type: 'standard' | 'custom';
};
