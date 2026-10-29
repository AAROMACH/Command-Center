"use client";
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { DollarSign, Info, TrendingUp, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import type { Project } from '@/lib/types';
import type { ProjectEconomics, CostItem } from '@/lib/project-economics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/**
 * A cost row that opens a small panel showing where the number comes from:
 * on hover (mouse) or tap (phone).
 */
function BreakdownRow({ label, value, valueClass, title, children }: {
    label: string; value: string; valueClass?: string; title: string; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
                    className="w-full flex justify-between items-center px-1 py-0.5 rounded hover:bg-bg-tertiary text-left">
                    <span className="text-[10px] font-bold text-text-secondary underline decoration-dotted underline-offset-2">{label}</span>
                    <span className={cn('text-[10px] font-mono font-bold', valueClass || 'text-text-primary')}>{value}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3 bg-bg-elevated border-border-main text-left"
                onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onOpenAutoFocus={e => e.preventDefault()}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">{title}</p>
                {children}
            </PopoverContent>
        </Popover>
    );
}

function ItemList({ items, empty }: { items: CostItem[]; empty: string }) {
    if (!items.length) return <p className="text-[12px] text-text-muted">{empty}</p>;
    return (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3 text-[12px]">
                    <div className="min-w-0">
                        <p className="text-text-primary break-words">{i.label}</p>
                        {(i.detail || i.date) && <p className="text-[11px] text-text-muted">{[i.detail, i.date].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <span className="font-mono font-semibold text-text-primary shrink-0">{formatCurrency(i.amount)}</span>
                </div>
            ))}
            <div className="flex justify-between border-t border-border-sub pt-1.5 text-[12px] font-semibold">
                <span>Total</span><span className="font-mono">{formatCurrency(items.reduce((s, i) => s + i.amount, 0))}</span>
            </div>
        </div>
    );
}

/** Budget, burn rate and profit for a project — admin Overview, and the project's assigned PM. */
export function ProjectEconomicsCard({ project, projectEconomics }: { project: Project; projectEconomics: ProjectEconomics }) {
    const [isEconomicDetailsOpen, setIsEconomicDetailsOpen] = useState(false);
    return (
                     <div className="field-group !pb-2">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="field-group-title !mb-0 font-bold"><DollarSign className="text-brand-red h-4 w-4"/> Project Economics</h3>
                            <Badge 
                                variant={
                                    projectEconomics.budgetStatus === 'Over Budget' ? 'missed' : 
                                    projectEconomics.budgetStatus === 'Near Limit' ? 'onhold' : 'active'
                                }
                                className="text-[10px] uppercase tracking-wider px-3 h-5"
                            >
                                {projectEconomics.budgetStatus}
                            </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border-sub border border-border-sub rounded-lg overflow-hidden mb-4">
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Master Budget</p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {project.projectBudget ? formatCurrency(project.projectBudget) : 'TBD'}
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Est. Hours</p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {projectEconomics.estimatedHours ? `${projectEconomics.estimatedHours}h` : 'TBD'}
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Logged Hours</p>
                                <p className={cn("text-xs font-mono font-bold", projectEconomics.loggedHours > 0 ? "text-accent-gold" : "text-text-muted")}>
                                    {projectEconomics.loggedHours.toFixed(1)}h
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Remaining</p>
                                <p className={cn("text-xs font-mono font-bold", projectEconomics.remainingBudget < 0 ? "text-text-red" : "text-text-green")}>
                                    {project.projectBudget ? formatCurrency(projectEconomics.remainingBudget) : 'TBD'}
                                </p>
                            </div>
                            <div className="col-span-2 sm:col-span-1 bg-bg-primary p-3 space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                    {projectEconomics.isActualProfit ? 'Actual Profit' : 'Est. Profit'}
                                </p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {project.projectBudget ? formatCurrency(projectEconomics.profit) : 'TBD'}
                                </p>
                            </div>
                        </div>

                        {/* Burn rate bars */}
                        {(projectEconomics.estimatedHours > 0 || project.projectBudget) && (
                            <div className="space-y-3 mb-4 px-0.5">
                                {projectEconomics.estimatedHours > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            <span>Hours Burn Rate</span>
                                            <span className={cn(
                                                projectEconomics.loggedHours > projectEconomics.estimatedHours ? 'text-text-red' :
                                                projectEconomics.loggedHours / projectEconomics.estimatedHours > 0.8 ? 'text-accent-gold' : 'text-text-green'
                                            )}>
                                                {projectEconomics.loggedHours.toFixed(1)} / {projectEconomics.estimatedHours}h
                                                {' '}({Math.min(Math.round((projectEconomics.loggedHours / projectEconomics.estimatedHours) * 100), 999)}%)
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all',
                                                    projectEconomics.loggedHours > projectEconomics.estimatedHours ? 'bg-text-red' :
                                                    projectEconomics.loggedHours / projectEconomics.estimatedHours > 0.8 ? 'bg-accent-gold' : 'bg-text-green'
                                                )}
                                                style={{ width: `${Math.min((projectEconomics.loggedHours / projectEconomics.estimatedHours) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {project.projectBudget && projectEconomics.actualCost > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            <span>Budget Consumed</span>
                                            <span className={cn(
                                                projectEconomics.actualCost > project.projectBudget ? 'text-text-red' :
                                                projectEconomics.actualCost / project.projectBudget > 0.8 ? 'text-accent-gold' : 'text-text-green'
                                            )}>
                                                {formatCurrency(projectEconomics.actualCost)} / {formatCurrency(project.projectBudget)}
                                                {' '}({Math.min(Math.round((projectEconomics.actualCost / project.projectBudget) * 100), 999)}%)
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all',
                                                    projectEconomics.actualCost > project.projectBudget ? 'bg-text-red' :
                                                    projectEconomics.actualCost / project.projectBudget > 0.8 ? 'bg-accent-gold' : 'bg-text-green'
                                                )}
                                                style={{ width: `${Math.min((projectEconomics.actualCost / project.projectBudget) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <Collapsible open={isEconomicDetailsOpen} onOpenChange={setIsEconomicDetailsOpen}>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="w-full h-8 flex items-center justify-center gap-2 hover:bg-bg-tertiary transition-colors group">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider group-hover:text-text-primary">View Economic details</p>
                                    {isEconomicDetailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2 pb-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border-sub/50 pb-1.5 px-1">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Cost Breakdown</p>
                                            <Activity size={12} className="text-brand-red opacity-50" />
                                        </div>
                                        <div className="space-y-2">
                                            <BreakdownRow label="Field Labor" title="Field labor — hours × hourly rate"
                                                value={projectEconomics.rateMissing && !projectEconomics.laborCost && !projectEconomics.ratesHidden ? 'Rate Missing' : formatCurrency(projectEconomics.laborCost)}
                                                valueClass={projectEconomics.rateMissing ? 'text-text-red' : undefined}>
                                                {projectEconomics.laborByTech.length ? (
                                                    <div className="space-y-1.5">
                                                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                                            <span>Tech</span><span className="text-right">Hours</span><span className="text-right">Rate</span><span className="text-right">Cost</span>
                                                        </div>
                                                        {projectEconomics.laborByTech.map(l => (
                                                            <div key={l.techId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[12px] font-mono">
                                                                <span className="font-sans text-text-primary truncate">{l.name}</span>
                                                                <span className="text-right">{l.hours.toFixed(2)}h</span>
                                                                <span className={cn('text-right', l.rate == null && 'text-text-muted')}>{l.rate != null ? `$${l.rate}/h` : projectEconomics.ratesHidden ? '—' : 'not set'}</span>
                                                                <span className="text-right">{l.cost != null ? formatCurrency(l.cost) : '—'}</span>
                                                            </div>
                                                        ))}
                                                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-t border-border-sub pt-1.5 text-[12px] font-mono font-semibold">
                                                            <span className="font-sans">Total</span>
                                                            <span className="text-right">{projectEconomics.laborByTech.reduce((s, l) => s + l.hours, 0).toFixed(2)}h</span>
                                                            <span />
                                                            <span className="text-right">{formatCurrency(projectEconomics.laborCost)}</span>
                                                        </div>
                                                        {projectEconomics.estimate && (
                                                            <p className="text-[11px] text-text-muted pt-1">Quoted: {projectEconomics.estimate.laborHours}h · {formatCurrency(projectEconomics.estimate.laborAmount)} billed</p>
                                                        )}
                                                        {!projectEconomics.ratesHidden && projectEconomics.rateMissing && (
                                                            <p className="text-[11px] text-text-red">Techs without a rate aren't counted — set it in the Directory.</p>
                                                        )}
                                                    </div>
                                                ) : <p className="text-[12px] text-text-muted">No hours logged on this project yet.</p>}
                                            </BreakdownRow>
                                            <BreakdownRow label="Materials & Parts" title="Materials & parts — our cost" value={formatCurrency(projectEconomics.materialCost)}>
                                                <ItemList items={projectEconomics.materialItems} empty="No materials or parts yet." />
                                                {projectEconomics.estimate && projectEconomics.estimate.materials.length > 0 && (
                                                    <div className="mt-3 border-t border-border-sub pt-2">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">On quote #{projectEconomics.estimate.quoteNumber} (billed)</p>
                                                        <ItemList empty="" items={projectEconomics.estimate.materials.map(m => ({ label: m.name, amount: m.total, detail: `${m.quantity} × $${m.unitPrice.toFixed(2)}` }))} />
                                                    </div>
                                                )}
                                            </BreakdownRow>
                                            <BreakdownRow label="Incidentals" title="Incidentals — travel, meals, tools, other" value={formatCurrency(projectEconomics.otherExpenses)}>
                                                <ItemList items={projectEconomics.incidentalItems} empty="No incidentals recorded." />
                                            </BreakdownRow>
                                            <div className="pt-1 border-t border-border-sub mt-1 flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Actual Cost</span>
                                                <span className="text-xs font-mono font-bold text-text-red">{formatCurrency(projectEconomics.actualCost)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border-sub/50 pb-1.5 px-1">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Profit Analysis</p>
                                            <TrendingUp size={12} className="text-text-green opacity-50" />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary">Projected Revenue</span>
                                                <span className="text-[10px] font-mono font-bold text-text-primary">{formatCurrency(projectEconomics.revenue)}</span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary">Profit Margin</span>
                                                <span className={cn("text-[10px] font-mono font-bold", projectEconomics.margin > 20 ? "text-text-green" : "text-accent-gold")}>
                                                    {project.projectBudget ? `${projectEconomics.margin.toFixed(1)}%` : 'TBD'}
                                                </span>
                                            </div>
                                            <div className="p-3 mt-2 rounded bg-bg-primary border border-border-sub flex items-start gap-2">
                                                <Info size={12} className="text-text-muted shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-text-muted leading-relaxed text-left">
                                                    Economics are aggregated from project-linked work orders, time logs, and finalized invoices.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
    );
}

/**
 * Economics computed server-side (/api/projects/[id]/economics) for the
 * project's assigned Project Manager, who can't read invoices, expenses or
 * pay rates directly. Null until loaded or when not allowed.
 */
export function useServerProjectEconomics(project: Project | null | undefined, enabled: boolean, refreshKey?: unknown): ProjectEconomics | null {
    const [economics, setEconomics] = useState<ProjectEconomics | null>(null);
    const id = project?.id;
    useEffect(() => {
        if (!id || !enabled) { setEconomics(null); return; }
        let live = true;
        (async () => {
            try {
                const token = await auth.currentUser?.getIdToken();
                const res = await fetch(`/api/projects/${encodeURIComponent(id)}/economics`, { headers: { Authorization: `Bearer ${token}` } });
                if (live) setEconomics(res.ok ? (await res.json()).economics : null);
            } catch { if (live) setEconomics(null); }
        })();
        return () => { live = false; };
        // Refresh when hours, budget or logs change.
    }, [id, enabled, project?.actualHours, project?.projectBudget, refreshKey]);
    return economics;
}
