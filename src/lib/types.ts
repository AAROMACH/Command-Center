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
}
