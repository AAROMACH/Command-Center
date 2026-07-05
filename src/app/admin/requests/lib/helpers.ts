import { format, parseISO } from 'date-fns';
import type {
  NewServiceRequest, ClientIntakeRequest, TimeOffRequest, Technician, AppRole,
} from '@/lib/types';

export const ALL_ROLES: AppRole[] = [
  'super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager',
  'project_lead', 'field_technician', 'client', 'sales',
  'safety_officer', 'training_coordinator',
];

export function priorityCls(p: string) {
  const l = p?.toLowerCase();
  if (l === 'critical' || l === 'urgent') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (l === 'high') return 'bg-orange-400/10 text-orange-400 border-orange-400/30';
  if (l === 'medium') return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
  return 'bg-bg-tertiary text-text-muted border-border-sub';
}

export function statusCls(s: string) {
  const l = s?.toLowerCase();
  if (l === 'approved' || l === 'converted_to_client' || l === 'converted_to_work_order' || l === 'converted_to_project') return 'bg-text-green/10 text-text-green border-text-green/30';
  if (l === 'denied' || l === 'rejected') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (l === 'archived' || l === 'closed') return 'bg-bg-tertiary text-text-muted border-border-sub';
  if (l === 'reviewed' || l === 'contacted' || l === 'needs_more_info') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
}

export const KIND_CFG = {
  service: { label: 'Service', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  client: { label: 'Client', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  personnel: { label: 'Personnel', cls: 'bg-amber-400/10 text-amber-400 border-amber-400/30' },
  access: { label: 'Account Access', cls: 'bg-text-green/10 text-text-green border-text-green/30' },
  subscription: { label: 'Subscription', cls: 'bg-bg-tertiary text-text-muted border-border-sub' },
} as const;

export type Kind = keyof typeof KIND_CFG;

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
  } catch { return iso; }
}

export function mapSource(raw?: string): 'App' | 'Form' | 'Manual' {
  if (!raw) return 'App';
  const l = raw.toLowerCase();
  if (l.includes('public') || l.includes('form')) return 'Form';
  if (l.includes('manual') || l.includes('admin')) return 'Manual';
  return 'App';
}

export function priorityLabel(p: string) {
  const l = p?.toLowerCase();
  if (l === 'critical') return 'Critical';
  if (l === 'high' || l === 'urgent') return 'Urgent';
  if (l === 'medium') return 'Normal';
  if (l === 'low') return 'Low';
  return 'Normal';
}

// ── Normalized item (unified "All" tab) ───────────────────────────────────────
export type NormalizedItem = {
  id: string;
  kind: Kind;
  title: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  source: 'App' | 'Form' | 'Manual';
  date: string;
  description: string;
  status: string;
  priority: string;
  rawServiceReq?: NewServiceRequest;
  rawClientReq?: ClientIntakeRequest;
  rawTimeOff?: TimeOffRequest;
  rawUser?: Technician;
};
