export type AppRole =
  | 'super_admin'
  | 'dispatch_admin'
  | 'payroll_admin'
  | 'project_manager'
  | 'project_lead'
  | 'field_technician'
  | 'client'
  | 'sales'
  | 'safety_officer'
  | 'training_coordinator';

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
  techId: string;
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

export type NotificationPreferences = {
  email: boolean;
  sms: boolean;
  push: boolean;
};

export type Notification = {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'push';
  title: string;
  body: string;
  timestamp: string;
  status: 'sent' | 'failed' | 'pending';
  relatedEntityId?: string;
  relatedEntityType?: 'assignment' | 'project' | 'request';
};

export type SlaStatus = 'on-track' | 'at-risk' | 'breached' | 'met';

export type WorkOrder = {
  id: string;
  workOrderId?: string;
  shortId?: string;
  techId?: string;
  title: string;
  description: string;
  location: string;
  locationText?: string;
  requiredSkills: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unassigned' | 'assigned' | 'confirmed' | 'on-my-way' | 'in-progress' | 'checked-out' | 'completed';
  assignedTechnicianId?: string | null;
  assignedTechIds?: string[];
  additionalTechnicianIds?: string[];
  clientName: string;
  projectType: 'Installation' | 'Troubleshooting' | 'Maintenance' | 'Survey' | 'Repair' | 'Decommission' | string;
  jobType?: string;
  scheduleDate: string;
  scheduleTime: string;
  pay: number;
  payType: 'fixed' | 'hourly' | 'blended';
  blendedFixedPay?: number;
  blendedIncludedHours?: number;
  blendedHourlyRate?: number;
  isAcknowledged?: boolean;
  routeId?: string | null;
  isImported?: boolean;
  source?: 'Imported' | 'Manual' | 'Client';
  history?: { type: 'tech_swap' | 'tech_add' | 'tech_remove' | 'status_change' | 'note' | 'revisit'; date: string; details: string; user: string }[];
  notes?: string;
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
  auditedAt?: string | null;
  auditedBy?: string | null;
  gpsRequired?: boolean;
  revisitCount?: number;
  leadTechId?: string;
  externalWorkOrderId?: string;
  lat?: number;
  lng?: number;
  // SLA tracking
  slaResponseTarget?: number;   // minutes until first response required
  slaResolutionTarget?: number; // hours until resolution required
  firstResponseAt?: string;     // ISO timestamp of first tech acknowledgment
  slaStatus?: SlaStatus;
  slaBreachNotifiedAt?: string; // ISO timestamp when breach notification was sent
};

export type Assignment = {
  id: string;
  status: string;
  currentScheduledDate?: string;
  revisitCount?: number;
  techName?: string;
  assignedAt?: string;
  assignedBy?: string;
  acknowledgedAt?: string;
  acknowledgmentMissed?: boolean;
  confirmedStartAt?: string;
  latestOutcomeCode?: string;
  updatedAt?: string;
  removedAfterAcknowledgment?: boolean;
  removalReasonCode?: string;
  removedAt?: string;
  needsAdminReview?: boolean;
  acknowledgmentRequiredAt?: string;
  techId?: string;
};

export type Route = {
  id: string;
  name: string;
  technicianName?: string;
  workOrderIds: string[];
  status?: 'draft' | 'ready' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled';
  routeDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Technician = {
  id: string;
  userId?: string;
  name: string;
  role: string;
  roles?: AppRole[];
  accountStatus?: 'lead' | 'active' | 'inactive' | 'past_client' | 'on_hold' | 'do_not_service' | 'collections' | 'prospect' | 'vip';
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
  notificationPreferences?: NotificationPreferences;
  permissionOverrides?: Record<string, boolean>;
  portalAccess?: { admin?: boolean; tech?: boolean; client?: boolean };
  primaryPortal?: 'admin' | 'tech' | 'client';
  googleCalendarSyncEnabled?: boolean;
  googleCalendarToken?: string;
  approvalStatus?: 'pending' | 'approved' | 'denied';
  requestedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  deniedAt?: string;
  deniedBy?: string;
  denialReason?: string;
  photoURL?: string;
  createdVia?: string;
  // Extended profile fields
  preferredName?: string;
  jobTitle?: string;
  department?: string;
  certifications?: string[];
  adminNotes?: string;
  serviceArea?: string;
};

export type Recommendation = {
  recommendedTechnicianId: string;
  reasoning: string;
  alternativeTechnicianIds?: string[];
};

export type ProjectTeamMember = {
  techId: string;
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
  techId: string;
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
  techId: string;
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

// New service request form (public-facing, saves to `serviceRequests` collection)
export type NewServiceRequest = {
  id: string;
  serviceRequestId: string;
  source: 'public_service_request' | 'app_service_request' | 'client_portal';
  status: 'pending_review' | 'contacted' | 'needs_more_info' | 'approved' | 'rejected' | 'converted_to_work_order' | 'converted_to_project' | 'closed';
  customerType: 'first_time' | 'returning_customer';
  clientId?: string | null;
  submittedByUserId?: string | null;
  fullName: string;
  email: string;
  phoneNumber: string;
  companyName?: string;
  preferredContactMethod?: 'email' | 'phone_call' | 'sms' | null;
  serviceTypes: string[];
  otherServiceDetails?: string | null;
  priorityLevel: 'low' | 'medium' | 'high' | 'critical';
  serviceLocation?: string;
  serviceMode?: 'onsite' | 'remote' | 'either';
  detailedDescription: string;
  hasSupportingDocuments: boolean;
  supportingFiles?: Array<{
    fileName: string;
    storagePath: string;
    downloadUrl: string | null;
    contentType: string | null;
    sizeBytes: number | null;
  }>;
  desiredStartDate?: string | null;
  desiredDeadlineTime?: string | null;
  bestAvailability?: string | null;
  formEaseRating?: number | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  internalNotes?: string | null;
  rejectionReason?: string | null;
  convertedWorkOrderId?: string | null;
  convertedProjectId?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Client intake form (public-facing, saves to `clientRequests` collection)
export type ClientIntakeRequest = {
  id: string;
  clientRequestId: string;
  requestCode?: string;
  requestType?: 'client_partnership_request';
  source: 'app_client_intake' | 'public_client_intake' | 'client_intake_form';
  status: 'pending_review' | 'contacted' | 'needs_more_info' | 'approved' | 'rejected' | 'denied' | 'converted_to_client' | 'archived';
  // Section 1: Company Info
  email: string;
  companyName: string;
  primaryContactName: string;
  jobTitle: string;
  phoneNumber: string;
  companyWebsiteUrl?: string | null;
  // Section 2: Business Profile
  industryType: string;
  numberOfLocations: '1' | '2-5' | '6-15' | '16-50' | '50+';
  totalEmployeeCount?: '1-10' | '11-50' | '51-200' | '201-500' | '500+' | null;
  primaryOperatingRegion: string;
  existingItProviderOrInternalTeam?: string | null;
  currentPainPoints: string;
  // Section 3: Service Interests
  serviceInterests: string[];
  otherServiceInterest?: string | null;
  subscriptionTier: 'essential' | 'professional' | 'enterprise' | 'not_sure';
  typicalServiceNeeds?: string | null;
  // Section 4: Additional Details
  estimatedMonthlyServiceVolume?: 'under_500' | '500_2500' | '2501_7500' | '7501_15000' | '15000_plus' | null;
  emergencyResponseMandatory?: boolean | null;
  emergencyResponseRequired?: boolean | null;
  preferredCommunicationMethod?: 'email' | 'phone_call' | null;
  additionalNotes?: string | null;
  additionalNotesOrQuestions?: string | null;
  // Consent
  consentConfirmed?: boolean;
  informationAccuracyConfirmed?: boolean;
  contactAuthorizationConfirmed?: boolean;
  termsConsent?: boolean;
  // Admin fields
  contactedAt?: string | null;
  contactedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedClientId?: string | null;
  convertedClientId?: string | null;
  rejectionReason?: string | null;
  internalNotes?: string | null;
  adminNotes?: string | null;
  assignedAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentTimeLog = {
  id: string;
  workOrderId: string;
  techId: string;
  checkInTime: string;
  checkOutTime?: string;
  minutesWorked?: number;
  location: string; 
};

export type WeeklyLogItem = {
  id: string;
  workOrderId: string;
  confirmationStatus?: 'confirmed' | 'disputed' | null;
  disputeReason?: string;
  disputeNotes?: string;
  outcomeCode?: 'worked_completed' | 'worked_revisit' | 'other' | null;
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
  techId: string;
  date: string;
  type: 'reimbursement' | 'payout' | 'penalty';
  amount: number;
  description: string;
};

export type WeeklyLog = {
  id: string;
  techId: string;
  weekOf: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  items: WeeklyLogItem[];
  reimbursements: FinancialRecord[];
  missingAssignmentReports?: MissingAssignmentReport[];
  totalPayout?: number;
  submittedAt?: string;
  unsubmitRequested?: boolean;
  unsubmitReason?: string;
  unsubmitRequestedAt?: string;
};

export type TimeOffRequest = {
  id: string;
  techId: string;
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

export type SiteNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

export type Site = {
  id: string;
  name: string;
  clientId?: string;
  clientName: string;
  location: string;
  lat?: number;
  lng?: number;
  managerName?: string;
  managerPhone?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  accessInstructions?: string;
  gateCode?: string;
  lockboxCode?: string;
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

export type Reimbursement = {
  id: string;
  techId: string;
  techName: string;
  type: 'receipt' | 'mileage';
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  amount: number;
  notes?: string;
  relatedJobId?: string;
  relatedJobTitle?: string;
  relatedProjectId?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedByName?: string;
  paidAt?: string;
  paidByName?: string;
  createdAt: string;
  updatedAt?: string;
  // Receipt fields
  vendorName?: string;
  purchaseDate?: string;
  description?: string;
  receiptPhotoUrls?: string[];
  // Mileage fields
  fromLocation?: string;
  toLocation?: string;
  distanceMiles?: number;
  mileageRate?: number;
  dateDriven?: string;
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
  category: 'labor' | 'material';
  isEmergencyProtocol?: boolean;
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
  // Extended fields
  planType?: 'standard-tier' | 'subscription-tier' | 'custom-client-tier' | 'one-time-rate' | 'emergency-rate' | 'project-rate';
  description?: string;
  standardHourlyRate?: number;
  afterHoursHourlyRate?: number;
  emergencyHourlyRate?: number;
  travelFee?: number;
  minimumServiceCharge?: number;
  contractLength?: string;
  status?: 'active' | 'inactive';
  notes?: string;
};

export type TripLog = {
  id: string;
  technicianId: string;
  technicianName?: string;
  workOrderId?: string;
  projectId?: string;
  date: string;
  startLocation: string;
  endLocation: string;
  miles: number;
  purpose: string;
  reimbursable: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

export type Lead = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: 'referral' | 'website' | 'cold_call' | 'field_nation' | 'other';
  stage: 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiating' | 'won' | 'lost';
  estimatedValue: number;
  assignedTo: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  lostReason?: string;
  followUpDate?: string;
};

export type LeadActivity = {
  id: string;
  leadId: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'proposal' | 'follow_up';
  description: string;
  createdBy: string;
  createdAt: string;
  scheduledAt?: string;
};

export type ProjectPayout = {
  id: string;
  projectId: string;
  technicianId: string;
  technicianName?: string;
  role: 'lead' | 'crew';
  payType: 'fixed' | 'hourly' | 'percentage';
  payoutSource?: 'timesheet' | 'manual';
  amount: number;
  hoursWorked?: number;
  hourlyRate?: number;
  timesheetLogIds?: string[];
  totalPayout?: number;
  status: 'pending' | 'approved' | 'paid';
  weeklyLogId?: string;
  notes: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  paidAt?: string;
  paidBy?: string;
};

export type QuoteLineItem = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable: boolean;
  category: 'labor' | 'materials' | 'travel' | 'equipment' | 'service' | 'other';
  required: boolean;
};

export type QuoteOptionItem = {
  id: string;
  label: string;
  priceAdjustment: number;
  selected: boolean;
};

export type QuoteOptionalGroup = {
  id: string;
  title: string;
  description: string;
  options: QuoteOptionItem[];
  requiredSelection: boolean;
};

export type QuoteStatus =
  | 'draft' | 'sent' | 'viewed' | 'changes_requested'
  | 'approved' | 'rejected' | 'expired' | 'superseded'
  | 'converted_to_work_order' | 'converted_to_project'
  | 'converted_to_invoice' | 'archived';

export type Quote = {
  id: string;
  quoteNumber: string;
  customerType: 'in_app_client' | 'external_customer';
  clientId: string | null;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string;
  customerPhone: string | null;
  title: string;
  description: string;
  scopeSummary: string;
  lineItems: QuoteLineItem[];
  optionalChoices: QuoteOptionalGroup[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  terms: string;
  expirationDate: string | null;
  publicToken: string | null;
  status: QuoteStatus;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedByName: string | null;
  approvedByEmail: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  originalQuoteId: string | null;
  revisionNumber: number;
  supersededByQuoteId: string | null;
  convertedToWorkOrderId: string | null;
  convertedToProjectId: string | null;
  convertedToInvoiceId: string | null;
};

export type AssetCategory = 'vehicle' | 'tool' | 'electronic' | 'inventory' | 'safety';

export type Asset = {
  id: string;
  name: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  subCategory?: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'out-of-service';
  status: 'available' | 'assigned' | 'checked_out' | 'needs_repair' | 'lost' | 'retired';
  assignedUserId?: string;
  assignedUserName?: string;
  currentLocation?: string;
  serialNumber?: string;
  vin?: string;
  licensePlate?: string;
  mileage?: number;
  purchaseDate?: string;
  purchasePrice?: number;
  vendor?: string;
  warrantyExpiry?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  checkedOutAt?: string;
  expectedReturnAt?: string;
  lastReturnedAt?: string;
  notes?: string;
  photoUrls?: string[];
  documents?: string[];
  createdAt: string;
  updatedAt?: string;
};

export type Material = {
  id: string;
  name: string;
  category: string;
  description?: string;
  unitType: 'each' | 'box' | 'pack' | 'foot' | 'roll' | 'hour' | 'set' | 'bag' | 'bundle';
  standardCost: number;
  billablePrice: number;
  markupPercentage?: number;
  vendor?: string;
  sku?: string;
  taxable: boolean;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type AssetAssignment = {
  id: string;
  assetId: string;
  assetName: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedByName: string;
  checkedOutAt: string;
  expectedReturnAt?: string;
  returnedAt?: string;
  checkoutCondition: string;
  returnCondition?: string;
  status: 'active' | 'returned';
  notes?: string;
  relatedJobId?: string;
  relatedProjectId?: string;
  createdAt: string;
};

export type PersonnelDocument = {
  id: string;
  type: 'w9' | 'insurance' | 'license' | 'certification' | 'agreement' | 'id' | 'training' | 'other';
  name: string;
  url: string;
  uploadedAt: string;
  expiryDate?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
};

export type ClientDocument = {
  id: string;
  name: string;
  documentType: 'contract' | 'blueprint' | 'compliance' | 'w9' | 'insurance' | 'agreement' | 'permit' | 'other';
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  expirationDate?: string;
  notes?: string;
  siteId?: string;
  tags?: string[];
};

export type ClientContact = {
  id: string;
  clientId: string;
  siteId?: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  contactType: 'main' | 'billing' | 'site' | 'emergency' | 'decision_maker' | 'accounts_payable' | 'store_manager' | 'regional_manager';
  isPrimary?: boolean;
  preferredContactMethod?: 'phone' | 'email' | 'text';
  notes?: string;
  createdAt: string;
};

export type SiteAccessInfo = {
  id: string;
  clientId: string;
  siteId?: string;
  checkInProcess?: string;
  securityDesk?: string;
  gateCode?: string;
  lockboxCode?: string;
  alarmInstructions?: string;
  parkingInstructions?: string;
  badgeRequired?: boolean;
  escortRequired?: boolean;
  afterHoursAccess?: string;
  emergencyContact?: string;
  specialSafetyRequirements?: string;
  updatedAt?: string;
};

export type ClientNote = {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  noteType: 'client' | 'site';
  relatedSiteId?: string;
  isPinned?: boolean;
  visibility?: 'internal' | 'shared';
};

export type MileageEntry = {
  id: string;
  techId: string;
  date: string;
  startLocation: string;
  endLocation: string;
  miles: number;
  assignmentId?: string;
  projectId?: string;
  note?: string;
  status: 'auto' | 'pending' | 'approved';
  createdAt: string;
};