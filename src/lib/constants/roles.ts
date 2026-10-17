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

// Groups match SUBROLE_DEFINITIONS (permissions.ts): Admin = the 3 office
// operations roles isAdmin() covers (and firestore.rules/storage.rules);
// External = limited accounts outside operations (Sales; a bookkeeper later)
// that only open their own portal; Technician includes Project Manager.
export const ROLE_DATA: Record<'admin' | 'external' | 'tech' | 'client', RoleOption[]> = {
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
    ],
    tech: [
        { 
            id: 'project_manager', 
            label: 'Project Manager', 
            desc: 'Runs every project from the Tech Portal.', 
            icon: Shield,
            permissions: ['All Projects', 'Create & Staff Projects', 'Phases & Tasks', 'Timesheets & Closeout']
        },
        { 
            id: 'project_lead', 
            label: 'Project Lead', 
            desc: 'Crew boss on projects where they are the named lead.', 
            icon: Hammer,
            permissions: ['Crew Boss on Own Projects', 'Phases & Tasks', 'Assign Crew Tasks', 'Field Documentation']
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
    external: [
        {
            id: 'sales',
            label: 'Sales',
            desc: 'CRM, leads, and quoting specialist.',
            icon: Handshake,
            permissions: ['Manage Leads & Opportunities', 'Create & Send Quotes', 'View Reports']
        },
    ]
};
