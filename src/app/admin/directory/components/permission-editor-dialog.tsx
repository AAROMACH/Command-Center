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
  SUBROLE_DEFINITIONS,
  SUBROLES_BY_PORTAL,
  type SubrolePortal,
  hasPermission,
  permissionLabel,
  permissionSources,
  getPortalAccess,
} from '@/lib/permissions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ShieldCheck, Wrench, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PORTAL_META: Record<SubrolePortal, { icon: typeof ShieldCheck; label: string; group: string; color: string; border: string; bg: string }> = {
  admin:  { icon: ShieldCheck, label: 'Admin Portal',  group: 'Admin Subroles',  color: 'text-brand-red',   border: 'border-brand-red/30',   bg: 'bg-brand-red/5' },
  tech:   { icon: Wrench,      label: 'Tech Portal',   group: 'Tech Subroles',   color: 'text-brand-blue',    border: 'border-brand-blue/30',    bg: 'bg-brand-blue/5' },
  client: { icon: Building2,   label: 'Client Portal', group: 'Client Subroles', color: 'text-brand-emerald', border: 'border-brand-emerald/30', bg: 'bg-brand-emerald/5' },
};

const PORTALS: SubrolePortal[] = ['admin', 'tech', 'client'];

type Props = {
  open: boolean;
  onClose: () => void;
  person: Technician;
};

export function PermissionEditorDialog({ open, onClose, person }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<AppRole[]>(person.roles ?? []);
  const [primaryPortal, setPrimaryPortal] = useState<SubrolePortal | null>(person.primaryPortal ?? null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>(person.permissionOverrides ?? {});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const previewUser: Technician = useMemo(() => ({
    ...person,
    roles,
    primaryPortal: primaryPortal ?? undefined,
    permissionOverrides: overrides,
  }), [person, roles, primaryPortal, overrides]);

  const effectivePortalAccess = getPortalAccess(previewUser);
  const effectivePermissions = useMemo(
    () => new Set(ALL_PERMISSIONS.filter(p => hasPermission(previewUser, p))),
    [previewUser]
  );

  // Portals the selected subroles unlock — the only ones whose permissions show.
  const unlockedPortals = useMemo(
    () => PORTALS.filter(portal => roles.some(r => SUBROLE_DEFINITIONS[r]?.portal === portal)),
    [roles]
  );

  const toggleRole = (role: AppRole) => {
    setRoles(prev => {
      const next = prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role];
      const portals = PORTALS.filter(p => next.some(r => SUBROLE_DEFINITIONS[r]?.portal === p));
      // Keep primary portal valid.
      setPrimaryPortal(cur => (cur && portals.includes(cur)) ? cur : (portals[0] ?? null));
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

  const bulkPortal = (portal: SubrolePortal, value: boolean | undefined) => {
    const perms = Object.values(PERMISSION_TREE[portal]).flat() as string[];
    setOverrides(prev => {
      const next = { ...prev };
      for (const p of perms) {
        if (value === undefined) delete next[p];
        else next[p] = value;
      }
      return next;
    });
  };

  // Select-all / deselect-all for a single section (page) of permissions.
  const bulkPerms = (perms: string[], value: boolean | undefined) => {
    setOverrides(prev => {
      const next = { ...prev };
      for (const p of perms) {
        if (value === undefined) delete next[p];
        else next[p] = value;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', person.id), {
        roles,
        primaryPortal: primaryPortal ?? null,
        permissionOverrides: overrides,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid ?? '',
      });
      toast({ title: 'Saved', description: `${person.name}'s subroles and permissions have been saved.` });
      onClose();
    } catch {
      toast({ variant: 'destructive', title: 'Save failed', description: 'Could not update permissions.' });
    } finally {
      setSaving(false);
    }
  };

  // The display state of a single permission for the current selection.
  const permState = (perm: Permission): 'restricted' | 'added' | 'preset' | 'off' => {
    const override = overrides[perm];
    if (override === false) return 'restricted';
    const fromPreset = permissionSources(roles, perm).length > 0;
    if (override === true) return fromPreset ? 'preset' : 'added';
    return fromPreset ? 'preset' : 'off';
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col bg-bg-secondary border-border-sub p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border-sub">
          <DialogTitle className="text-sm font-black uppercase tracking-widest text-text-primary">
            Subroles &amp; Permissions — {person.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="subroles" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 bg-bg-primary border-b border-border-sub h-9 px-5 gap-0 rounded-none justify-start">
            {(['subroles', 'permissions', 'preview'] as const).map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-[9px] font-black uppercase tracking-widest h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-brand-red data-[state=active]:text-brand-red data-[state=active]:bg-transparent bg-transparent"
              >
                {tab === 'subroles' ? 'Subroles' : tab === 'permissions' ? 'Permissions' : 'Preview'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Subroles ───────────────────────────────────────────── */}
          <TabsContent value="subroles" className="flex-1 overflow-auto p-5 mt-0 space-y-5">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] font-bold">
              Selecting a subrole unlocks its portal and applies its preset permissions
            </p>

            {PORTALS.map(portal => {
              const meta = PORTAL_META[portal];
              const Icon = meta.icon;
              return (
                <div key={portal} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{meta.group}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBROLES_BY_PORTAL[portal].map(role => {
                      const def = SUBROLE_DEFINITIONS[role];
                      const selected = roles.includes(role);
                      return (
                        <label key={role} className={cn(
                          'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                          selected ? cn(meta.border, meta.bg) : 'border-border-sub bg-bg-primary hover:border-border-main'
                        )}>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleRole(role)}
                            className="mt-0.5 data-[state=checked]:bg-brand-red data-[state=checked]:border-brand-red"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-text-primary">{def.label}</p>
                            <p className="text-[10px] text-text-muted leading-snug mt-0.5">{def.description}</p>
                            <p className={cn('text-[9px] font-bold uppercase tracking-widest mt-1', meta.color)}>
                              {meta.label} · {def.permissions.length} permissions
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Derived portal access + primary portal */}
            <div className="border-t border-border-sub pt-4 space-y-3">
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] font-bold mb-2">Portal Access (derived from subroles)</p>
                <div className="flex flex-wrap gap-2">
                  {PORTALS.map(portal => {
                    const meta = PORTAL_META[portal];
                    const on = effectivePortalAccess[portal];
                    return (
                      <span key={portal} className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border',
                        on ? cn(meta.border, meta.bg, meta.color) : 'border-border-sub text-text-muted/40'
                      )}>
                        <meta.icon className="h-3 w-3" /> {portal}{on ? '' : ' · locked'}
                      </span>
                    );
                  })}
                </div>
                {unlockedPortals.length === 0 && (
                  <p className="text-[10px] text-brand-red/80 mt-2">No portal access. Select a subrole to assign portal access and preset permissions.</p>
                )}
              </div>

              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] font-bold mb-2">Primary Portal (default landing on login)</p>
                <div className="flex flex-wrap gap-2">
                  {unlockedPortals.length === 0 ? (
                    <span className="text-[10px] text-text-muted">Unlock a portal first.</span>
                  ) : unlockedPortals.map(portal => (
                    <button
                      key={portal}
                      onClick={() => setPrimaryPortal(portal)}
                      className={cn('px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors capitalize',
                        primaryPortal === portal ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub bg-bg-primary text-text-muted hover:border-border-main'
                      )}
                    >{portal}</button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Permissions (only unlocked portals) ────────────────── */}
          <TabsContent value="permissions" className="flex-1 overflow-hidden mt-0 flex flex-col">
            {unlockedPortals.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-[11px] text-text-muted max-w-xs leading-relaxed">
                  No portal access. Select a subrole in the Subroles tab to assign portal access and preset permissions.
                </p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {unlockedPortals.map(portal => {
                    const meta = PORTAL_META[portal];
                    const Icon = meta.icon;
                    const isCollapsed = collapsed[portal];
                    const pages = PERMISSION_TREE[portal] ?? {};
                    return (
                      <div key={portal} className={cn('rounded-lg border', meta.border)}>
                        <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-lg', meta.bg)}>
                          <button onClick={() => setCollapsed(prev => ({ ...prev, [portal]: !prev[portal] }))} className="flex items-center gap-2 min-w-0">
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-text-muted" />}
                            <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                            <span className={cn('text-[10px] font-black uppercase tracking-widest', meta.color)}>{meta.label}</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => bulkPortal(portal, true)} className="h-6 px-2 rounded text-[9px] font-bold border border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/10 transition-colors">Select All</button>
                            <button onClick={() => bulkPortal(portal, false)} className="h-6 px-2 rounded text-[9px] font-bold border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors">Deselect All</button>
                            <button onClick={() => bulkPortal(portal, undefined)} className="h-6 px-2 rounded text-[9px] font-bold border border-border-sub text-text-muted hover:border-border-main transition-colors">Reset</button>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="p-3 space-y-4">
                            {Object.entries(pages).map(([page, perms]) => {
                              const sectionPerms = perms as Permission[];
                              const allOn = sectionPerms.length > 0 && sectionPerms.every(p => effectivePermissions.has(p));
                              const someOn = sectionPerms.some(p => effectivePermissions.has(p));
                              return (
                              <div key={page}>
                                <label className="flex items-center gap-2 mb-2 cursor-pointer w-fit">
                                  <Checkbox
                                    checked={allOn ? true : (someOn ? 'indeterminate' : false)}
                                    onCheckedChange={() => bulkPerms(sectionPerms, allOn ? false : true)}
                                    className="h-3.5 w-3.5 data-[state=checked]:bg-brand-red data-[state=checked]:border-brand-red data-[state=indeterminate]:bg-brand-red/40 data-[state=indeterminate]:border-brand-red"
                                  />
                                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{page}</span>
                                </label>
                                <div className="space-y-1">
                                  {sectionPerms.map(perm => {
                                    const state = permState(perm);
                                    const sources = permissionSources(roles, perm);
                                    const override = overrides[perm];
                                    const badge = {
                                      restricted: { t: 'Restricted', c: 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/5' },
                                      added:      { t: 'Added',      c: 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/5' },
                                      preset:     { t: 'Preset',     c: 'text-text-muted border-border-sub bg-bg-secondary' },
                                      off:        { t: 'Off',        c: 'text-text-muted/50 border-border-sub' },
                                    }[state];
                                    return (
                                      <div key={perm} className={cn('flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-md border transition-colors',
                                        state === 'restricted' ? 'border-[#ef4444]/20 bg-[#ef4444]/5'
                                          : state === 'off' ? 'border-border-sub bg-bg-primary'
                                          : 'border-[#10b981]/15 bg-[#10b981]/5'
                                      )}>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-text-primary truncate">{permissionLabel(perm)}</p>
                                            <span className={cn('text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded border shrink-0', badge.c)}>{badge.t}</span>
                                          </div>
                                          {sources.length > 0 && (
                                            <p className="text-[9px] text-text-muted mt-0.5 truncate">
                                              Included by: {sources.map(r => SUBROLE_DEFINITIONS[r].label).join(', ')}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <button
                                            onClick={() => setPermOverride(perm, true)}
                                            className={cn('h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                              override === true ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981]' : 'border-border-sub text-text-muted hover:border-border-main')}
                                          >Add</button>
                                          <button
                                            onClick={() => setPermOverride(perm, false)}
                                            className={cn('h-6 px-2 rounded text-[9px] font-bold border transition-colors',
                                              override === false ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]' : 'border-border-sub text-text-muted hover:border-border-main')}
                                          >Restrict</button>
                                          {override !== undefined && (
                                            <button onClick={() => setPermOverride(perm, undefined)} className="h-6 px-2 rounded text-[9px] font-bold border border-border-sub text-text-muted hover:border-border-main">Reset</button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-text-muted leading-relaxed pt-1">
                    Precedence: individual restriction → individual addition → subrole preset → deny by default. Individual additions grant the action only — they never grant portal access.
                  </p>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ── Preview ────────────────────────────────────────────── */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-0 p-5 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 shrink-0">
              {PORTALS.map(portal => {
                const meta = PORTAL_META[portal];
                const Icon = meta.icon;
                const enabled = effectivePortalAccess[portal];
                return (
                  <div key={portal} className={cn('rounded-lg border p-3 flex items-center gap-2', enabled ? cn(meta.border, meta.bg) : 'border-border-sub bg-bg-primary opacity-40')}>
                    <Icon className={cn('h-4 w-4', enabled ? meta.color : 'text-text-muted')} />
                    <div>
                      <p className="text-[10px] font-bold text-text-primary">{meta.label}</p>
                      <p className={cn('text-[9px] font-bold', enabled ? meta.color : 'text-text-muted')}>{enabled ? 'Accessible' : 'No Access'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-5">
                {unlockedPortals.length === 0 && (
                  <p className="text-[11px] text-text-muted">No portal access. Select a subrole to assign portal access and preset permissions.</p>
                )}
                {unlockedPortals.map(portal => {
                  const pages = PERMISSION_TREE[portal] ?? {};
                  return (
                    <div key={portal}>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">{PORTAL_META[portal].label}</p>
                      <div className="space-y-2 ml-2">
                        {Object.entries(pages).map(([page, perms]) => {
                          const granted = (perms as Permission[]).filter(p => effectivePermissions.has(p));
                          if (granted.length === 0) return null;
                          return (
                            <div key={page}>
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">{page}</p>
                              <div className="flex flex-wrap gap-1 ml-2">
                                {granted.map(p => (
                                  <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border border-[#10b981]/30 bg-[#10b981]/5 text-[#10b981]">
                                    {permissionLabel(p)}
                                  </span>
                                ))}
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
              {saving ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Saving...</> : 'Save Subroles & Permissions'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
