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
};

export type Technician = {
  id: string;
  name: string;
  currentLocation: string;
  reliabilityScore: number;
  currentWorkload: number;
  skills: string[];
  avatarUrl: string;
};

export type Recommendation = {
  recommendedTechnicianId: string;
  reasoning: string;
  alternativeTechnicianIds?: string[];
};

// New Types for Projects Feature
export type ProjectTeamMember = {
  technicianId: string;
  role: string;
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
  assignedTechnicianIds: string[]; // Keep for compatibility, use team instead
  team: ProjectTeamMember[];
  phases: Phase[];
  // Fields for Overview Tab
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
