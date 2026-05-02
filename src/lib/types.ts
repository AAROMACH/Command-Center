export type WorkOrder = {
  id: string;
  description: string;
  location: string;
  requiredSkills: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unassigned' | 'assigned' | 'in-progress' | 'completed';
  assignedTechnicianId?: string;
  clientName: string;
  projectType: string;
  scheduleDate: string;
  scheduleTime: string;
  pay: number;
  isAcknowledged?: boolean;
};

export type Technician = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  address?: string;
  emergencyContact?: {
    name: string;
    relation: string;
    phone: string;
  };
  currentLocation: string;
  reliabilityScore: number;
  currentWorkload: number;
  skills: string[];
  avatarUrl: string;
  availability: Record<string, { start: string; end: string } | null>;
  clientCompany?: string; 
  managedSites?: { id: string; name: string; location: string }[];
  workPreferences: {
    preferredRadius: number;
    maxTravelDistance: number;
    preferredJobTypes: string[];
    availabilityOverride: boolean;
  };
};

export type Recommendation = {
  recommendedTechnicianId: string;
  reasoning: string;
  alternativeTechnicianIds?: string[];
};

export type ProjectTeamMember = {
  technicianId: string;
  role:string;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  location: string;
  status: 'active' | 'on-hold' | 'completed';
  startDate: string;
  startTime?: string;
  estimatedDuration: string;
  assignedTechnicianIds: string[]; 
  team: ProjectTeamMember[];
  phases: Phase[];
  scope: string;
  onsiteContact?: string;
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
};

export type ProjectDocument = {
  id: string;
  name: string;
  type: 'pdf' | 'img' | 'doc';
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
  clientName: string;
  location: string;
  requestType: 'New Install' | 'Repair' | 'Inspection' | 'Quote';
  description: string;
  status: 'new' | 'reviewed' | 'approved' | 'rejected' | 'closed';
  submittedDate: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
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
  outcomeCode: 'worked_completed' | 'worked_revisit' | 'other';
  isComplete: boolean;
  isAdminReviewed: boolean;
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
  totalPayout?: number;
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

export type PenaltyEvent = {
  id: string;
  technicianId: string;
  date: string;
  reason: string;
  points: number;
};

export type ProjectDailyLog = {
  id: string;
  projectId: string;
  technicianId: string;
  date: string;
  hoursWorked: number;
  workSummary: string;
  taskIdsProgressed: string[];
  taskIdsCompleted: string[];
  phaseIdsWorked: string[];
  materialsUsed: { item: string; quantity: number }[];
  photoUrls: string[];
};

export type Expense = {
  id: string;
  date: string;
  submittedBy: string;
  category: 'Travel' | 'Materials' | 'Meals' | 'Tools' | 'Other';
  description: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
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
