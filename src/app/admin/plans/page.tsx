'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
    Zap, 
    Plus, 
    ChevronRight, 
    Check, 
    Target, 
    Clock, 
    ShieldCheck, 
    Building2,
    Search,
    DollarSign,
    PenTool,
    Trash2,
    Sparkles,
    Eye,
    AlertTriangle,
    Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { technicians } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isSuperAdmin } from '@/lib/permissions';
import type { Technician } from '@/lib/types';

type PlanTier = {
    id: string;
    name: string;
    price: number;
    billingPeriod: 'monthly' | 'annual';
    features: string[];
    siteLimit: number;
    responseTime: string;
    type: 'standard' | 'custom';
    clientName?: string;
};

const INITIAL_PLANS: PlanTier[] = [
    {
        id: 'std-1',
        name: 'Standard',
        price: 1500,
        billingPeriod: 'monthly',
        features: ['Up to 5 managed sites', 'Standard dispatch protocol', 'Email support'],
        siteLimit: 5,
        responseTime: '24h',
        type: 'standard'
    },
    {
        id: 'std-2',
        name: 'Professional',
        price: 3000,
        billingPeriod: 'monthly',
        features: ['Up to 20 managed sites', 'Priority routing', 'Live portal tracking'],
        siteLimit: 20,
        responseTime: '8h',
        type: 'standard'
    },
    {
        id: 'std-3',
        name: 'Enterprise',
        price: 5000,
        billingPeriod: 'monthly',
        features: ['Unlimited managed sites', 'Dedicated account lead', 'Critical response tier'],
        siteLimit: 100,
        responseTime: '4h',
        type: 'standard'
    },
    {
        id: 'cust-1',
        name: 'Strategic Fiber Initiative',
        clientName: 'Global Corp',
        price: 8500,
        billingPeriod: 'monthly',
        features: ['High-density fiber oversight', 'On-site audit support', 'Bypass dispatch queue'],
        siteLimit: 50,
        responseTime: '2h',
        type: 'custom'
    }
];

export default function PlansPage() {
    const [plans, setPlans] = useState<PlanTier[]>(INITIAL_PLANS);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalMode, setTerminalOpen] = useState<'create' | 'edit' | 'view'>('view');
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<Partial<PlanTier>>({});
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(technicians.find(t => t.id === userId) || null);
        }
    }, []);

    const userIsSuperAdmin = isSuperAdmin(currentUser);

    const clientsList = useMemo(() => 
        technicians.filter(t => t.roles?.includes('client') || t.role.toLowerCase().includes('client'))
    , []);

    const filteredPlans = useMemo(() => {
        if (!searchQuery) return plans;
        const q = searchQuery.toLowerCase();
        return plans.filter(p => 
            p.name.toLowerCase().includes(q) || 
            (p.clientName || '').toLowerCase().includes(q)
        );
    }, [plans, searchQuery]);

    const handleOpenTerminal = (mode: 'create' | 'edit' | 'view', plan?: PlanTier) => {
        setTerminalOpen(mode);
        setSelectedPlan(plan ? { ...plan } : {
            type: 'custom',
            billingPeriod: 'monthly',
            features: [],
            siteLimit: 5,
            responseTime: '4h'
        });
        setIsTerminalOpen(true);
    };

    const handleSavePlan = () => {
        if (!selectedPlan.name || !selectedPlan.price) {
            toast({ variant: 'destructive', title: 'Registry Error', description: 'Please populate all critical plan parameters.' });
            return;
        }

        if (terminalMode === 'create') {
            const plan: PlanTier = {
                ...selectedPlan as PlanTier,
                id: `cust-${Date.now()}`,
            };
            setPlans(prev => [...prev, plan]);
            toast({ title: "Custom Agreement Authorized", description: `${plan.name} has been committed to the registry.` });
        } else {
            setPlans(prev => prev.map(p => p.id === selectedPlan.id ? selectedPlan as PlanTier : p));
            toast({ title: "Agreement Updated", description: `${selectedPlan.name} parameters have been synchronized.` });
        }
        
        setIsTerminalOpen(false);
    };

    const handleDeletePlan = (id: string) => {
        const activeUsage = technicians.filter(t => t.planId === id);
        if (activeUsage.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Deletion Blocked',
                description: `This plan is linked to ${activeUsage.length} active client registry folder(s). Unlink all accounts before removal.`,
            });
            return;
        }

        setPlans(prev => prev.filter(p => p.id !== id));
        toast({ title: "Plan Purged", description: "Agreement has been removed from the operational registry." });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Zap size={12} />
                        Financial Architecture
                    </p>
                    <h1 className="page-title">Plan Registry</h1>
                    <p className="page-subtitle text-xs font-bold text-text-muted uppercase tracking-widest mt-1">Manage standard service tiers and architect custom client agreements.</p>
                </div>
                <div className="page-header-right">
                    <div className="search-wrap">
                        <Search className="h-4 w-4" />
                        <input 
                            className="search-input !bg-bg-secondary h-10 w-[250px]" 
                            placeholder="Find agreement..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {userIsSuperAdmin && (
                        <Button onClick={() => handleOpenTerminal('create')} className="h-10 px-6 font-bold uppercase tracking-widest">
                            <Plus size={16} className="mr-2" />
                            Architect Custom Plan
                        </Button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Total Subscription ARR</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-mono font-bold text-text-green">$216.4K</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Active Agreements</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-text-primary">{plans.length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Avg. Site Yield</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-mono font-bold text-text-primary">$284.50</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Pending Quotes</p>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-accent-gold">2</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="all" className="w-full">
                <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-6">
                    <TabsTrigger value="all" className="tab-trigger-plans">All Agreements</TabsTrigger>
                    <TabsTrigger value="standard" className="tab-trigger-plans">Standard Tiers</TabsTrigger>
                    <TabsTrigger value="custom" className="tab-trigger-plans">Custom Plans</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.map(plan => (
                            <PlanCard 
                                key={plan.id} 
                                plan={plan} 
                                onEdit={(p) => handleOpenTerminal('edit', p)}
                                onView={(p) => handleOpenTerminal('view', p)}
                                onDelete={(id) => handleDeletePlan(id)}
                                canEdit={userIsSuperAdmin}
                            />
                        ))}
                    </div>
                </TabsContent>
                
                <TabsContent value="standard" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.filter(p => p.type === 'standard').map(plan => (
                            <PlanCard 
                                key={plan.id} 
                                plan={plan} 
                                onEdit={(p) => handleOpenTerminal('edit', p)}
                                onView={(p) => handleOpenTerminal('view', p)}
                                onDelete={(id) => handleDeletePlan(id)}
                                canEdit={userIsSuperAdmin}
                            />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="custom" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.filter(p => p.type === 'custom').map(plan => (
                            <PlanCard 
                                key={plan.id} 
                                plan={plan} 
                                onEdit={(p) => handleOpenTerminal('edit', p)}
                                onView={(p) => handleOpenTerminal('view', p)}
                                onDelete={(id) => handleDeletePlan(id)}
                                canEdit={userIsSuperAdmin}
                            />
                        ))}
                        {filteredPlans.filter(p => p.type === 'custom').length === 0 && (
                            <div className="col-span-full py-24 text-center border-2 border-dashed border-border-main rounded-2xl opacity-40 bg-bg-secondary/30">
                                <Building2 size={48} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No custom client agreements in registry</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* PLAN ARCHITECT / AUDIT TERMINAL */}
            <Dialog open={isTerminalOpen} onOpenChange={setIsTerminalOpen}>
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-3">
                            {terminalMode === 'view' ? <Eye className="text-accent-gold h-5 w-5" /> : <PenTool className="text-brand-red h-5 w-5" />}
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">
                                {terminalMode === 'create' ? 'Custom Plan Architect' : 
                                 terminalMode === 'edit' ? 'Modify Agreement Registry' : 
                                 'Agreement Audit Shell'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">
                            {terminalMode === 'view' ? 'High-fidelity technical specifications for this agreement tier.' : 'Construct or adjust strategic service agreement parameters.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Target Client</Label>
                                <Select 
                                    disabled={terminalMode === 'view'}
                                    value={selectedPlan.clientName || ""}
                                    onValueChange={(val) => setSelectedPlan({...selectedPlan, clientName: val})}
                                >
                                    <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue placeholder="Standard Tier" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Standard Tier">Standard Tier (Global)</SelectItem>
                                        {clientsList.map(c => (
                                            <SelectItem key={c.id} value={c.clientCompany || c.name} className="text-xs uppercase font-bold">
                                                {c.clientCompany || c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Agreement Identifier</Label>
                                <Input 
                                    readOnly={terminalMode === 'view'}
                                    placeholder="e.g. Q3 Strategic Fiber" 
                                    className="h-11 bg-bg-primary text-xs font-bold uppercase"
                                    value={selectedPlan.name || ''}
                                    onChange={e => setSelectedPlan({...selectedPlan, name: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Monthly Rate ($)</Label>
                                <div className="relative">
                                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-green" />
                                    <Input 
                                        readOnly={terminalMode === 'view'}
                                        type="number" 
                                        placeholder="0.00" 
                                        className="h-11 bg-bg-primary pl-10 text-sm font-mono font-bold"
                                        value={selectedPlan.price || 0}
                                        onChange={e => setSelectedPlan({...selectedPlan, price: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Settlement Cycle</Label>
                                <Select 
                                    disabled={terminalMode === 'view'}
                                    value={selectedPlan.billingPeriod} 
                                    onValueChange={(val: any) => setSelectedPlan({...selectedPlan, billingPeriod: val})}
                                >
                                    <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">Monthly Recurring</SelectItem>
                                        <SelectItem value="quarterly">Quarterly Bulk</SelectItem>
                                        <SelectItem value="annual">Annual Commitment</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Verified Site Quota</Label>
                                <Input 
                                    readOnly={terminalMode === 'view'}
                                    type="number" 
                                    className="h-11 bg-bg-primary text-sm font-mono font-bold"
                                    value={selectedPlan.siteLimit || 0}
                                    onChange={e => setSelectedPlan({...selectedPlan, siteLimit: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Response Tier SLA</Label>
                                <Select 
                                    disabled={terminalMode === 'view'}
                                    value={selectedPlan.responseTime} 
                                    onValueChange={(val) => setSelectedPlan({...selectedPlan, responseTime: val})}
                                >
                                    <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2h">2-Hour Emergency</SelectItem>
                                        <SelectItem value="4h">4-Hour Critical</SelectItem>
                                        <SelectItem value="8h">8-Hour Priority</SelectItem>
                                        <SelectItem value="24h">24-Hour Standard</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {terminalMode !== 'view' && (
                            <div className="p-4 rounded-xl bg-accent-gold-dim/5 border border-accent-gold/20 flex items-start gap-4">
                                <Sparkles className="text-accent-gold h-5 w-5 shrink-0 mt-0.5" />
                                <div className="space-y-1 text-left">
                                    <p className="text-[10px] font-black text-accent-gold uppercase tracking-widest">Protocol Note</p>
                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium">
                                        Custom agreements bypass standard portal constraints. Ensure specific SOW parameters are attached to the client folder in the registry.
                                    </p>
                                </div>
                            </div>
                        )}
                        
                        {terminalMode === 'view' && (
                            <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub space-y-4 text-left">
                                <h4 className="text-[9px] font-black text-text-muted uppercase tracking-widest border-b border-border-sub pb-2">Active Technical Features</h4>
                                <div className="space-y-2">
                                    {selectedPlan.features?.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <ShieldCheck size={12} className="text-text-green" />
                                            <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight">{f}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default">
                        {terminalMode === 'view' ? (
                            <Button variant="outline" onClick={() => setIsTerminalOpen(false)} className="w-full h-11 uppercase font-bold text-[10px] tracking-widest">Exit Audit</Button>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <Button variant="outline" onClick={() => setIsTerminalOpen(false)} className="h-11 uppercase font-bold text-[10px] tracking-widest">Discard Changes</Button>
                                <Button onClick={handleSavePlan} className="h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                                    Authorize Agreement
                                </Button>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .tab-trigger-plans {
                    @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}

function PlanCard({ 
    plan, 
    onEdit, 
    onView, 
    onDelete, 
    canEdit 
}: { 
    plan: PlanTier; 
    onEdit: (p: PlanTier) => void; 
    onView: (p: PlanTier) => void; 
    onDelete: (id: string) => void;
    canEdit: boolean;
}) {
    const isCustom = plan.type === 'custom';
    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main flex flex-col group transition-all hover:border-text-muted",
            isCustom ? "border-brand-red/30 shadow-[0_0_15px_rgba(204,34,0,0.05)]" : ""
        )}>
            <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-4 text-left">
                <div className="flex justify-between items-start mb-2">
                    <Badge variant={isCustom ? "high" : "outline"} className={cn("text-[9px] uppercase tracking-widest h-5", !isCustom && "bg-bg-primary text-text-muted")}>
                        {plan.type} Agreement
                    </Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-primary" onClick={() => onEdit(plan)}><PenTool size={14}/></Button>}
                        {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red" onClick={() => onDelete(plan.id)}><Trash2 size={14}/></Button>}
                    </div>
                </div>
                <div className="space-y-1">
                    <CardTitle className="text-base font-bold uppercase tracking-wide">{plan.name}</CardTitle>
                    {isCustom && (
                        <p className="text-[10px] font-bold text-brand-red uppercase tracking-widest flex items-center gap-1.5">
                            <Building2 size={10}/> {plan.clientName}
                        </p>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col">
                <div className="mb-6 flex items-baseline gap-1.5 justify-start">
                    <span className="text-3xl font-mono font-bold text-text-primary">${plan.price.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-text-muted uppercase">/ {plan.billingPeriod}</span>
                </div>

                <div className="space-y-4 flex-1">
                    <div className="space-y-2 text-left">
                        {plan.features.map((feature, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-text-green" />
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-tight">{feature}</span>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-border-sub mt-auto space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted uppercase">
                                <Target size={12}/> Site Quota
                            </div>
                            <span className="text-[10px] font-mono font-bold text-text-primary">{plan.siteLimit === 100 ? 'UNLIMITED' : plan.siteLimit}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted uppercase">
                                <Clock size={12}/> Target SLA
                            </div>
                            <span className="text-[10px] font-mono font-bold text-text-primary">{plan.responseTime} Response</span>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="pt-0 p-5">
                <Button variant="outline" className="w-full h-9 text-[10px] font-bold uppercase tracking-widest bg-bg-primary hover:bg-bg-tertiary" onClick={() => onView(plan)}>
                    View Registry Details
                    <ChevronRight size={14} className="ml-2" />
                </Button>
            </CardFooter>
        </Card>
    );
}