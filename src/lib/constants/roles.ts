import {
  Shield,
  ShieldAlert,
  User,
  Briefcase,
  Banknote,
  Hammer,
  Building2,
  Handshake,
} from 'lucide-react';
import type { AppRole } from '@/lib/types';

export type RoleOption = {
    id: AppRole;
    label: string;
    desc: string;
    icon: any;
    permissions: string[];
};

// Note: the 'office' subrole (sales) is NOT blanket-admin — isAdmin() only
// covers the 4 subroles in the 'admin' bucket below, matching
// firestore.rules/storage.rules. Sales unlocks the admin portal but gets only
// the specific permissions SUBROLE_DEFINITIONS (permissions.ts) grants it.
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
    ]
};
