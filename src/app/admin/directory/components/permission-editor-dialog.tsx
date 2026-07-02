'use client';

import { useState, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Technician, AppRole } from '@/lib/types';
import type { Permission } from '@/lib/permissions';
import {
  ALL_PERMISSIONS,
  hasPermission,
  getPortalAccess,
  getAvailablePortals,
} from '@/lib/permissions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ShieldCheck, Wrench, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_ROLES: AppRole[] = [
  'super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager',
  'project_lead', 'field_technician', 'client', 'sales', 'safety_officer', 'training_coordinator',
];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  dispatch_admin: 'Dispatch Admin',
  payroll_admin: 'Payroll Admin',
  project_manager: 'Project Manager',
  project_lead: 'Project Lead',
  field_technician: 'Field Technician',
  client: 'Client',
  sales: 'Sales',
  safety_officer: 'Safety Officer',
  training_coordinator: 'Training Coordinator',
};

const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Core Access',
    permissions: [
      'view_dashboard', 'view_requests', 'manage_requests', 'view_assignments', 'manage_assignments',
      'view_projects', 'manage_projects', 'view_directory', 'manage_personnel', 'view_financials',
      'manage_payroll', 'view_settings', 'manage_settings', 'field_checkin', 'field_logs', 'client_portal',
      'view_assigned_projects_only', 'view_assigned_work_only', 'approve_pay_changes',
      'view_reports', 'view_leads', 'manage_leads', 'view_crm', 'manage_safety_events', 'manage_certifications',
    ],
  },
  {
    label: 'Dispatch',
    permissions: [
      'assign_technician', 'swap_technician', 'remove_technician', 'add_technician', 'assign_helper',
      'create_route', 'edit_route', 'delete_route', 'optimize_routes', 'dispatch_route',
      'reschedule_job', 'cancel_assignment', 'override_scheduling_conflicts',
    ],
  },
  {
    label: 'Projects',
    permissions: [
      'create_project', 'edit_project', 'archive_project', 'create_phase', 'create_task',
      'assign_task', 'complete_task', 'reopen_task', 'close_project',
    ],
  },
  {
    label: 'CRM',
    permissions: [
      'create_lead', 'create_opportunity', 'create_quote', 'edit_quote', 'send_quote',
      'approve_quote', 'convert_quote', 'mark_won', 'mark_lost',
    ],
  },
  {
    label: 'Financials',
    permissions: [
      'view_profit', 'create_invoice', 'edit_invoice', 'void_invoice',
      'approve_reimbursements', 'process_payroll', 'export_financial_data',
    ],
  },
  {
    label: 'Directory',
    permissions: [
      'assign_roles', 'edit_permissions', 'upload_documents', 'approve_documents', 'reset_password', 'disable_user',
    ],
  },
  {
    label: 'Messages',
    permissions: ['broadcast_messages', 'group_chat', 'delete_messages', 'pin_messages', 'upload_files'],
  },
  {
    label: 'Reports',
    permissions: ['generate_reports', 'export_reports', 'schedule_reports'],
  },
  {
    label: 'Administration',
    permissions: ['company_settings', 'integrations', 'api_keys', 'audit_logs', 'automation_rules'],
  },
  {
    label: 'Overrides',
    permissions: [
      'edit_completed_assignments', 'edit_closed_projects', 'override_payroll_locks',
      'override_scheduling_locks', 'delete_historical_records', 'force_complete_assignment',
      'force_close_project', 'bypass_approval_workflow',
    ],
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  person: Technician;
};

export function PermissionEditorDialog({ open, onClose, person }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<AppRole[]>(person.roles ?? []);
  const [primaryPortal, setPrimaryPortal] = useState<'admin' | 'tech' | 'client' | null>(person.primaryPortal ?? null);
  const [portalOverrides, setPortalOverrides] = useState<{ admin?: boolean; tech?: boolean; client?: boolean }>(
    person.portalAccess ?? {}
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>(person.permissionOverrides ?? {});

  // Build a preview user for computing effective permissions
  const previewUser: Technician = useMemo(() => ({
    ...person,
    roles,
    primaryPortal: primaryPortal ?? undefined,
    portalAccess: portalOverrides,
    permissionOverrides: overrides,
  }), [person, roles, primaryPortal, portalOverrides, overrides]);

  const effectivePortals = getAvailablePortals(previewUser);
  const effectivePortalAccess = getPortalAccess(previewUser);

  const effectivePermissions = useMemo(
    () => ALL_PERMISSIONS.filter(p => hasPermission(previewUser, p)),
    [previewUser]
  );

  const toggleRole = (role: AppRole) => {
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const setPortalOverride = (portal: 'admin' | 'tech' | 'client', value: boolean | undefined) => {
    setPortalOverrides(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[portal];
      else next[portal] = value;
      return next;
    });
  };

  const setPermissionOverride = (perm: string, value: boolean | undefined) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[perm];
      else next[perm] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const adminId = auth.currentUser?.uid ?? '';
      await updateDoc(doc(db, 'users', person.id), {
        roles,
        primaryPortal: primaryPortal ?? null,
        portalAccess: portalOverrides,
        permissionOverrides: overrides,
        updatedAt: new Date().toISOString(),
        updatedBy: adminId,
      });
      toast({ title: 'Permissions updated', description: `${person.name}'s permissions have been saved.` });
      onClose();
    } catch {
      toast({ variant: 'destructive', title: 'Save failed', description: 'Could not update permissions.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-bg-secondary border-border-sub">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-widest text-text-primary">
            Permission Editor — {person.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="roles" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 bg-bg-primary border border-border-sub h-8 px-1 gap-1 w-full justify-start">
            {(['roles', 'portals', 'overrides', 'preview'] as const).map(tab => (
              <TabsTrigger key={tab} value={tab} className="text-[9px] font-black uppercase tracking-widest h-6 px-2">
                {tab === 'roles' ? 'Roles' : tab === 'portals' ? 'Portal Access' : tab === 'overrides' ? 'Permission Overrides' : 'Preview'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Roles tab */}
          <TabsContent value="roles" className="flex-1 overflow-auto mt-3">
            <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3 font-bold">Assign one or more roles</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map(role => (
                <label key={role} className={cn(
                  'flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                  roles.includes(role) ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-primary hover:border-border-main'
                )}>
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                    className="data-[state=checked]:bg-brand-red data-[state=checked]:border-brand-red"
                  />
                  <span className="text-xs font-bold text-text-primary">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
          </TabsContent>

          {/* Portal access tab */}
          <TabsContent value="portals" className="flex-1 overflow-auto mt-3 space-y-4">
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
              Override portal access (leave unset to use role defaults)
            </p>
            {(['admin', 'tech', 'client'] as const).map(portal => {
              const icons = { admin: ShieldCheck, tech: Wrench, client: Building2 };
              const Icon = icons[portal];
              const roleDefault = portal === 'admin'
                ? roles.some(r => ['super_admin','dispatch_admin','payroll_admin','project_manager','sales','safety_officer','training_coordinator'].includes(r))
                : portal === 'tech'
                ? roles.some(r => ['project_lead','field_technician'].includes(r))
                : roles.includes('client');
              const explicit = portalOverrides[portal];
              const effective = explicit !== undefined ? explicit : roleDefault;

              return (
                <div key={portal} className="flex items-center justify-between rounded-lg border border-border-sub bg-bg-primary p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-text-muted" />
                    <div>
                      <p className="text-xs font-bold text-text-primary capitalize">{portal} Portal</p>
                      <p className="text-[10px] text-text-muted">
                        Role default: {roleDefault ? 'enabled' : 'disabled'}
                        {explicit !== undefined && ` · Override: ${explicit ? 'enabled' : 'disabled'}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={effective ? 'default' : 'secondary'} className="text-[9px]">
                      {effective ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={explicit === true ? 'default' : 'outline'}
                        className="h-6 px-2 text-[9px] font-bold"
                        onClick={() => setPortalOverride(portal, true)}
                      >Allow</Button>
                      <Button
                        size="sm"
                        variant={explicit === false ? 'destructive' : 'outline'}
                        className="h-6 px-2 text-[9px] font-bold"
                        onClick={() => setPortalOverride(portal, false)}
                      >Deny</Button>
                      {explicit !== undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[9px] font-bold text-text-muted"
                          onClick={() => setPortalOverride(portal, undefined)}
                        >Reset</Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Primary Portal</p>
              <div className="flex gap-2">
                {(['admin', 'tech', 'client', null] as const).map(p => (
                  <button
                    key={String(p)}
                    onClick={() => setPrimaryPortal(p)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors',
                      primaryPortal === p
                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                        : 'border-border-sub bg-bg-primary text-text-muted hover:border-border-main'
                    )}
                  >
                    {p ?? 'None'}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Permission overrides tab */}
          <TabsContent value="overrides" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[420px] pr-2">
              <div className="space-y-6">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">{group.label}</p>
                    <div className="space-y-1">
                      {group.permissions.map(perm => {
                        const override = overrides[perm];
                        const fromRole = hasPermission({ ...previewUser, permissionOverrides: {} }, perm);
                        return (
                          <div key={perm} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-primary">
                            <div className="min-w-0">
                              <p className="text-xs font-mono text-text-primary truncate">{perm}</p>
                              <p className="text-[9px] text-text-muted">Role default: {fromRole ? 'allowed' : 'denied'}</p>
                            </div>
                            <div className="flex gap-1 shrink-0 ml-2">
                              <button
                                onClick={() => setPermissionOverride(perm, true)}
                                className={cn(
                                  'h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                  override === true
                                    ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981]'
                                    : 'border-border-sub text-text-muted hover:border-border-main'
                                )}
                              >Allow</button>
                              <button
                                onClick={() => setPermissionOverride(perm, false)}
                                className={cn(
                                  'h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                  override === false
                                    ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]'
                                    : 'border-border-sub text-text-muted hover:border-border-main'
                                )}
                              >Deny</button>
                              {override !== undefined && (
                                <button
                                  onClick={() => setPermissionOverride(perm, undefined)}
                                  className="h-6 px-2 rounded text-[9px] font-bold border border-border-sub text-text-muted hover:border-border-main"
                                >Reset</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Preview tab */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-3">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(['admin', 'tech', 'client'] as const).map(p => {
                const icons = { admin: ShieldCheck, tech: Wrench, client: Building2 };
                const Icon = icons[p];
                const enabled = effectivePortalAccess[p];
                return (
                  <div key={p} className={cn(
                    'rounded-lg border p-3 flex items-center gap-2',
                    enabled ? 'border-[#10b981]/30 bg-[#10b981]/5' : 'border-border-sub bg-bg-primary opacity-50'
                  )}>
                    <Icon className={cn('h-4 w-4', enabled ? 'text-[#10b981]' : 'text-text-muted')} />
                    <div>
                      <p className="text-[10px] font-bold text-text-primary capitalize">{p} Portal</p>
                      <p className={cn('text-[9px] font-bold', enabled ? 'text-[#10b981]' : 'text-text-muted')}>
                        {enabled ? 'Accessible' : 'No Access'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold mb-2">
              Effective Permissions ({effectivePermissions.length}/{ALL_PERMISSIONS.length})
            </p>
            <ScrollArea className="h-[320px]">
              <div className="flex flex-wrap gap-1">
                {ALL_PERMISSIONS.map(p => {
                  const allowed = effectivePermissions.includes(p);
                  return (
                    <span
                      key={p}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border',
                        allowed
                          ? 'border-[#10b981]/30 bg-[#10b981]/5 text-[#10b981]'
                          : 'border-border-sub bg-bg-primary text-text-muted opacity-40'
                      )}
                    >
                      {allowed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                      {p}
                    </span>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border-sub pt-3 mt-3">
          <Button variant="outline" onClick={onClose} className="h-8 text-[10px] font-bold uppercase tracking-widest border-border-sub">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="h-8 text-[10px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover text-white">
            {saving ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Saving...</> : 'Save Permissions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
