'use client';

import { useState, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Technician, AppRole } from '@/lib/types';
import type { Permission } from '@/lib/permissions';
import {
  ALL_PERMISSIONS,
  PERMISSION_TREE,
  hasPermission,
  permissionLabel,
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ShieldCheck, Wrench, Building2, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
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

const PORTAL_META = {
  admin: { icon: ShieldCheck, label: 'Admin Portal', color: 'text-brand-red', border: 'border-brand-red/30', bg: 'bg-brand-red/5' },
  tech:  { icon: Wrench,      label: 'Tech Portal',  color: 'text-[#3b82f6]', border: 'border-[#3b82f6]/30', bg: 'bg-[#3b82f6]/5' },
  client:{ icon: Building2,   label: 'Client Portal',color: 'text-[#10b981]', border: 'border-[#10b981]/30', bg: 'bg-[#10b981]/5' },
};

type Props = {
  open: boolean;
  onClose: () => void;
  person: Technician;
};

export function PermissionEditorDialog({ open, onClose, person }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [activePortal, setActivePortal] = useState<'admin' | 'tech' | 'client'>('admin');

  const [roles, setRoles] = useState<AppRole[]>(person.roles ?? []);
  const [primaryPortal, setPrimaryPortal] = useState<'admin' | 'tech' | 'client' | null>(person.primaryPortal ?? null);
  const [portalOverrides, setPortalOverrides] = useState<{ admin?: boolean; tech?: boolean; client?: boolean }>(
    person.portalAccess ?? {}
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>(person.permissionOverrides ?? {});

  const previewUser: Technician = useMemo(() => ({
    ...person,
    roles,
    primaryPortal: primaryPortal ?? undefined,
    portalAccess: portalOverrides,
    permissionOverrides: overrides,
  }), [person, roles, primaryPortal, portalOverrides, overrides]);

  const effectivePortalAccess = getPortalAccess(previewUser);
  const effectivePermissions = useMemo(
    () => new Set(ALL_PERMISSIONS.filter(p => hasPermission(previewUser, p))),
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

  const setPermOverride = (perm: string, value: boolean | undefined) => {
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
      await updateDoc(doc(db, 'users', person.id), {
        roles,
        primaryPortal: primaryPortal ?? null,
        portalAccess: portalOverrides,
        permissionOverrides: overrides,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid ?? '',
      });
      toast({ title: 'Permissions updated', description: `${person.name}'s permissions have been saved.` });
      onClose();
    } catch {
      toast({ variant: 'destructive', title: 'Save failed', description: 'Could not update permissions.' });
    } finally {
      setSaving(false);
    }
  };

  const portalPages = PERMISSION_TREE[activePortal] ?? {};
  const portals = Object.keys(PERMISSION_TREE) as ('admin' | 'tech' | 'client')[];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col bg-bg-secondary border-border-sub p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border-sub">
          <DialogTitle className="text-sm font-black uppercase tracking-widest text-text-primary">
            Permission Editor — {person.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="roles" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 bg-bg-primary border-b border-border-sub h-9 px-5 gap-0 rounded-none justify-start">
            {(['roles', 'portals', 'permissions', 'preview'] as const).map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-[9px] font-black uppercase tracking-widest h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-brand-red data-[state=active]:text-brand-red data-[state=active]:bg-transparent bg-transparent"
              >
                {tab === 'roles' ? 'Roles' : tab === 'portals' ? 'Portal Access' : tab === 'permissions' ? 'Permission Overrides' : 'Preview'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Roles ──────────────────────────────────────────────── */}
          <TabsContent value="roles" className="flex-1 overflow-auto p-5 mt-0">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] mb-3 font-bold">
              Assign one or more roles — role determines default portal access and permissions
            </p>
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

          {/* ── Portal Access ──────────────────────────────────────── */}
          <TabsContent value="portals" className="flex-1 overflow-auto p-5 mt-0 space-y-5">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] font-bold">
              Override portal access — leave unset to inherit from role defaults
            </p>
            <div className="space-y-2">
              {portals.map(portal => {
                const meta = PORTAL_META[portal];
                const Icon = meta.icon;
                const roleDefault = effectivePortalAccess[portal];
                const explicit = portalOverrides[portal];
                return (
                  <div key={portal} className={cn('flex items-center justify-between rounded-lg border p-3', meta.border, meta.bg)}>
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('h-4 w-4', meta.color)} />
                      <div>
                        <p className={cn('text-xs font-bold', meta.color)}>{meta.label}</p>
                        <p className="text-[9px] text-text-muted">
                          Role default: {roleDefault ? 'enabled' : 'disabled'}
                          {explicit !== undefined && ` · Override: ${explicit ? 'enabled' : 'disabled'}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPortalOverride(portal, true)}
                        className={cn('h-6 px-2.5 rounded text-[9px] font-bold border transition-colors', explicit === true ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981]' : 'border-border-sub text-text-muted hover:border-border-main')}
                      >Allow</button>
                      <button
                        onClick={() => setPortalOverride(portal, false)}
                        className={cn('h-6 px-2.5 rounded text-[9px] font-bold border transition-colors', explicit === false ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]' : 'border-border-sub text-text-muted hover:border-border-main')}
                      >Deny</button>
                      {explicit !== undefined && (
                        <button onClick={() => setPortalOverride(portal, undefined)} className="h-6 px-2 rounded text-[9px] font-bold border border-border-sub text-text-muted hover:border-border-main">Reset</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] font-bold">Primary Portal (default landing on login)</p>
              <div className="flex gap-2">
                {([...portals, null] as const).map(p => (
                  <button
                    key={String(p)}
                    onClick={() => setPrimaryPortal(p)}
                    className={cn('px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors',
                      primaryPortal === p ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub bg-bg-primary text-text-muted hover:border-border-main'
                    )}
                  >{p ?? 'None'}</button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Permission Overrides — Portal › Page › Action ──────── */}
          <TabsContent value="permissions" className="flex-1 overflow-hidden mt-0 flex">
            {/* Portal selector sidebar */}
            <div className="w-32 shrink-0 border-r border-border-sub flex flex-col gap-1 p-2">
              {portals.map(portal => {
                const meta = PORTAL_META[portal];
                const Icon = meta.icon;
                return (
                  <button
                    key={portal}
                    onClick={() => setActivePortal(portal)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-left transition-colors',
                      activePortal === portal ? cn('text-white', meta.color.replace('text-', 'bg-').replace('[', '[').replace(']', ']'), meta.bg) : 'text-text-muted hover:bg-bg-primary'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', activePortal === portal ? meta.color : '')} />
                    {portal}
                  </button>
                );
              })}
            </div>

            {/* Page > Actions */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5">
                {Object.entries(portalPages).map(([page, perms]) => (
                  <div key={page}>
                    {/* Page header */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <ChevronRight className="h-3 w-3 text-text-muted" />
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{page}</p>
                    </div>
                    <div className="space-y-1 ml-4">
                      {(perms as Permission[]).map(perm => {
                        const override = overrides[perm];
                        const fromRole = hasPermission({ ...previewUser, permissionOverrides: {} }, perm);
                        const effective = override !== undefined ? override : fromRole;
                        return (
                          <div key={perm} className={cn('flex items-center justify-between py-1.5 px-2.5 rounded-md border transition-colors',
                            effective ? 'border-[#10b981]/20 bg-[#10b981]/5' : 'border-border-sub bg-bg-primary'
                          )}>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-text-primary">{permissionLabel(perm)}</p>
                              {override !== undefined && (
                                <p className="text-[9px] text-text-muted font-mono">{perm}</p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0 ml-3">
                              <button
                                onClick={() => setPermOverride(perm, true)}
                                className={cn('h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                  override === true ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981]' : 'border-border-sub text-text-muted hover:border-border-main'
                                )}
                              >Allow</button>
                              <button
                                onClick={() => setPermOverride(perm, false)}
                                className={cn('h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                  override === false ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]' : 'border-border-sub text-text-muted hover:border-border-main'
                                )}
                              >Deny</button>
                              {override !== undefined && (
                                <button
                                  onClick={() => setPermOverride(perm, undefined)}
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

          {/* ── Preview ────────────────────────────────────────────── */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-0 p-5 flex flex-col gap-4">
            {/* Portal access summary */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              {portals.map(portal => {
                const meta = PORTAL_META[portal];
                const Icon = meta.icon;
                const enabled = effectivePortalAccess[portal];
                return (
                  <div key={portal} className={cn('rounded-lg border p-3 flex items-center gap-2', enabled ? cn(meta.border, meta.bg) : 'border-border-sub bg-bg-primary opacity-40')}>
                    <Icon className={cn('h-4 w-4', enabled ? meta.color : 'text-text-muted')} />
                    <div>
                      <p className="text-[10px] font-bold text-text-primary">{meta.label}</p>
                      <p className={cn('text-[9px] font-bold', enabled ? meta.color : 'text-text-muted')}>
                        {enabled ? 'Accessible' : 'No Access'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Effective permissions by portal › page */}
            <ScrollArea className="flex-1">
              <div className="space-y-5">
                {portals.map(portal => {
                  const pages = PERMISSION_TREE[portal] ?? {};
                  return (
                    <div key={portal}>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">
                        {PORTAL_META[portal].label}
                      </p>
                      <div className="space-y-2 ml-2">
                        {Object.entries(pages).map(([page, perms]) => {
                          const granted = (perms as Permission[]).filter(p => effectivePermissions.has(p));
                          if (granted.length === 0) return null;
                          return (
                            <div key={page}>
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">{page}</p>
                              <div className="flex flex-wrap gap-1 ml-2">
                                {(perms as Permission[]).map(p => {
                                  const allowed = effectivePermissions.has(p);
                                  return (
                                    <span key={p} className={cn(
                                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border',
                                      allowed ? 'border-[#10b981]/30 bg-[#10b981]/5 text-[#10b981]' : 'border-border-sub bg-bg-primary text-text-muted opacity-30'
                                    )}>
                                      {allowed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                                      {permissionLabel(p)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border-sub px-5 py-3 flex items-center justify-between">
          <p className="text-[9px] text-text-muted">
            {effectivePermissions.size} / {ALL_PERMISSIONS.length} permissions effective
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="h-8 text-[10px] font-bold uppercase tracking-widest border-border-sub">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="h-8 text-[10px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover text-white">
              {saving ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Saving...</> : 'Save Permissions'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
