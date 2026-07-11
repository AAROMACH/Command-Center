import {
  Shield,
  ShieldAlert,
  User,
  Briefcase,
  Banknote,
  Hammer,
  Building2,
  Handshake,
  HardHat,
  GraduationCap,
} from 'lucide-react';
import type { AppRole } from '@/lib/types';

export type RoleOption = {
    id: AppRole;
    label: string;
    desc: string;
    icon: any;
    permissions: string[];
};

// Note: 'office' roles (sales/safety_officer/training_coordinator) are NOT
// blanket-admin — isAdmin() only covers the 4 roles in the 'admin' bucket
// below, matching firestore.rules/storage.rules. Office roles get whatever
// specific permissions ROLE_PERMISSIONS (permissions.ts) grants them.
export const ROLE_DATA: Record<'admin' | 'tech' | 'client' | 'office', RoleOption[]> = {
    admin: [
        { 
            id: 'super_admin', 
            label: 'Super Admin', 
            desc: 'Full system authorization.', 
            icon: ShieldAlert,
            permissions: ['Full System Access', 'User Management', 'Financial Override', 'Global Operations']
        },
        { 
            id: 'dispatch_admin', 
            label: 'Dispatch Admin', 
            desc: 'Logistics and scheduling lead.', 
            icon: Briefcase,
            permissions: ['Manage Assignments', 'Technician Dispatch', 'View All Projects', 'Schedule Control']
        },
        { 
            id: 'payroll_admin', 
            label: 'Payroll Admin', 
            desc: 'Financial audit specialist.', 
            icon: Banknote,
            permissions: ['Approve Weekly Logs', 'Manage Reimbursements', 'Payout Authorization']
        },
        { 
            id: 'project_manager', 
            label: 'Project Manager', 
            desc: 'Strategic deployment oversight.', 
            icon: Shield,
            permissions: ['Create Projects', 'Phase Management', 'Task Definition', 'Resource Planning']
        },
    ],
    tech: [
        { 
            id: 'project_lead', 
            label: 'Project Lead', 
            desc: 'On-site lead technician.', 
            icon: Hammer,
            permissions: ['Update Project Progress', 'Field Documentation', 'Task Management', 'Site Reporting']
        },
        { 
            id: 'field_technician', 
            label: 'Field Tech', 
            desc: 'Low voltage installation specialist.', 
            icon: User,
            permissions: ['Check In / Check Out', 'Submit Logs', 'Upload Receipts', 'Acknowledge Work']
        },
    ],
    client: [
        {
            id: 'client',
            label: 'Client Contact',
            desc: 'External project lead.',
            icon: Building2,
            permissions: ['View Project Status', 'Submit Service Requests', 'View Work History']
        },
    ],
    office: [
        {
            id: 'sales',
            label: 'Sales',
            desc: 'CRM, leads, and quoting specialist.',
            icon: Handshake,
            permissions: ['Manage Leads & Opportunities', 'Create & Send Quotes', 'View Reports']
        },
        {
            id: 'safety_officer',
            label: 'Safety Officer',
            desc: 'Field safety compliance lead.',
            icon: HardHat,
            permissions: ['Manage Safety Events', 'Upload Personnel Documents', 'View Reports']
        },
        {
            id: 'training_coordinator',
            label: 'Training Coordinator',
            desc: 'Certifications and onboarding lead.',
            icon: GraduationCap,
            permissions: ['Manage Certifications', 'Approve Personnel Documents', 'View Reports']
        },
    ]
};
