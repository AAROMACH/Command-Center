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
    Lock,
    ShieldAlert,
    X,
    Users,
    History,
    ExternalLink,
    TrendingUp,
    Activity,
    Wrench,
    UserCheck
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
import { Checkbox } from '@/components/ui/checkbox';
import { technicians } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isSuperAdmin, isClient } from '@/lib/permissions';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { PlanTier, Technician } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

const PLAN_CAPABILITIES = [
    "48-hr priority scheduling",
    "24-hr priority scheduling",
    "Same-day scheduling",
    "10% off all labor",
    "15% off all labor",
    "20% off all labor",
    "Phone triage support",
    "Annual site walkthrough",
    "Quarterly site inspection",
    "Monthly site visits included",
    "Infrastructure documentation",
    "Full infrastructure documentation",
    "Emergency dispatch available",
    "After-hours emergency dispatch",
    "Dedicated tech assignment",
    "No contract — month to month",
];

const INITIAL_PLANS: PlanTier[] = [
    {
        id: 'std-1',
        name: 'On-Call',
        price: 199,
        billingPeriod: 'monthly',
        features: [
            '48-hr priority scheduling', 
            '10% off all labor', 
            'Phone triage support', 
            'Annual site walkthrough', 
            'No contract — month to month'
        ],
        siteLimit: 5,
        responseTime: '48h',
        type: 'standard'
    },
    {
        id: 'std-2',
        name: 'Site Partner',
        price: 499,
        billingPeriod: 'monthly',
        features: [
            '24-hr priority scheduling', 
            '15% off all labor', 
            'Quarterly site inspection', 
            'Infrastructure documentation', 
            'Emergency dispatch available'
        ],
        siteLimit: 20,
        responseTime: '24h',
        type: 'standard'
    },
    {
        id: 'std-3',
        name: 'Dedicated',
        price: 999,
        billingPeriod: 'monthly',
        features: [
            'Same-day scheduling', 
            '20% off all labor', 
            'Monthly site visits included', 
            'Dedicated tech assignment', 
            'After-hours emergency dispatch', 
            'Full infrastructure documentation'
        ],
        siteLimit: 100,
        responseTime: 'Same-Day',
        type: 'standard'
    },
    {
        id: 'cust-1',
        name: 'Strategic Fiber Initiative',
        clientName: 'Global Corp',
        price: 8500,
        billingPeriod: 'monthly',
        features: ['Full infrastructure documentation', 'Dedicated tech assignment', 'After-hours emergency dispatch'],
        siteLimit: 50,
        responseTime: '2h',
        type: 'custom'
    }
];

const SERVICE_RATES = [
    { service: 'Fiber', rate: '$150/hr', min: '2 hr min', icon: Zap },
    { service: 'Installation', rate: '$120/hr', min: '2 hr min', icon: Wrench },
    { service: 'Diagnostics', rate: '$100/hr', min: '1 hr min', icon: Activity },
    { service: 'Smart Hands', rate: '$85/hr', min: '2 hr min', icon: UserCheck },
    { service: 'After Hours', rate: '1.5× base', min: '2 hr min', icon: Clock },
];

export default function PlansPage() {
    const [plans, setPlans] = useState<PlanTier[]>(INITIAL_PLANS);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalMode, setTerminalMode] = useState<'create' | 'edit' | 'view'>('view');
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<Partial<PlanTier>>({});
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [localTechs, setLocalTechs] = useState<Technician[]>(technicians);
    
    // Delete Confirmation State
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [planToDelete, setPlanToDelete] = useState<PlanTier | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    const { toast } = useToast();

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(localTechs.find(t => t.id === userId) || null);
        }
    }, [localTechs]);

    const userIsSuperAdmin = isSuperAdmin(currentUser);

    const clientsList = useMemo(() => 
        localTechs.filter(t => isClient(t))
    , [localTechs]);

    const activeSubscriptions = useMemo(() => 
        clientsList.filter(c => c.planId && c.subscriptionStatus === 'active')
    , [clientsList]);

    const pendingSubscriptions = useMemo(() => 
        clientsList.filter(c => c.subscriptionStatus === 'pending')
    , [clientsList]);

    const filteredPlans = useMemo(() => {
        if (!searchQuery) return plans;
        const q = searchQuery.toLowerCase();
        return plans.filter(p => 
            p.name.toLowerCase().includes(q) || 
            (p.clientName || '').toLowerCase().includes(q)
        );
    }, [plans, searchQuery]);

    const handleOpenTerminal = (mode: 'create' | 'edit' | 'view', plan?: PlanTier) => {
        setTerminalMode(mode);
        setSelectedPlan(plan ? { ...plan } : {
            type: 'custom',
            billingPeriod: 'monthly',
            features: [],
            siteLimit: 5,
            responseTime: '24h'
        });
        setIsTerminalOpen(true);
    };

    const handleSavePlan = async () => {
        if (!selectedPlan.name || !selectedPlan.price) {
            toast({ variant: 'destructive', title: 'Registry Error', description: 'Please populate all critical plan parameters.' });
            return;
        }

        if (terminalMode === 'create') {
            const plan: PlanTier = {
                ...selectedPlan as PlanTier,
                id: await createDocId(ID_PREFIXES.PLAN_TIER),
            };
            setPlans(prev => [...prev, plan]);
            toast({ title: "Custom Agreement Authorized", description: `${plan.name} has been committed to the registry.` });
        } else {
            setPlans(prev => prev.map(p => p.id === selectedPlan.id ? selectedPlan as PlanTier : p));
            toast({ title: "Agreement Updated", description: `${selectedPlan.name} parameters have been synchronized.` });
        }
        
        setIsTerminalOpen(false);
    };

    const handleToggleFeature = (feature: string) => {
        if (terminalMode === 'view') return;
        const currentFeatures = selectedPlan.features || [];
        const nextFeatures = currentFeatures.includes(feature)
            ? currentFeatures.filter(f => f !== feature)
            : [...currentFeatures, feature];
        setSelectedPlan({ ...selectedPlan, features: nextFeatures });
    };

    const confirmDeleteRequest = (plan: PlanTier) => {
        if (plan.type === 'standard') {
            toast({ variant: 'destructive', title: 'Action Restricted', description: 'Standard Tiers are mission-critical and cannot be purged from the registry.' });
            return;
        }
        setPlanToDelete(plan);
        setDeleteConfirmText("");
        setIsDeleteOpen(true);
    };

    const executeDelete = () => {
        if (!planToDelete) return;
        if (deleteConfirmText !== planToDelete.name) {
            toast({ variant: 'destructive', title: 'Authorization Failed', description: 'Input does not match registry identifier.' });
            return;
        }

        const activeUsage = localTechs.filter(t => t.planId === planToDelete.id);
        if (activeUsage.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Deletion Blocked',
                description: `This plan is linked to ${activeUsage.length} active client registry folder(s). Unlink all accounts before removal.`,
            });
            return;
        }

        setPlans(prev => prev.filter(p => p.id !== planToDelete.id));
        toast({ title: "Plan Purged", description: "Agreement has been removed from the operational registry." });
        setIsDeleteOpen(false);
        setPlanToDelete(null);
    };

    const handleDiscardRequest = (clientId: string) => {
        setLocalTechs(prev => prev.map(t => t.id === clientId ? { ...t, subscriptionStatus: 'none' } : t));
        toast({
            variant: "destructive",
            title: "Request Discarded",
            description: "The pending service agreement request has been removed from the funnel.",
        });
    };

    const handleInitializeQuote = (clientId: string) => {
        setLocalTechs(prev => prev.map(t => t.id === clientId ? { ...t, subscriptionStatus: 'active', planId: 'std-1' } : t));
        toast({
            title: "Quote Initialized",
            description: "The client has been transitioned to active status. You can now adjust their assigned tier.",
        });
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
                        <p className="text-2xl font-bold text-text-primary">{activeSubscriptions.length}</p>
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
                        <p className="text-2xl font-bold text-accent-gold">{pendingSubscriptions.length}</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="all" className="w-full">
                <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-6">
                    <TabsTrigger value="all" className="tab-trigger-plans">All Agreements</TabsTrigger>
                    <TabsTrigger value="subscriptions" className="tab-trigger-plans flex items-center gap-2">
                        Active Subscriptions
                        <Badge variant="outline" className="h-4 px-1.5 text-[8px] bg-bg-tertiary border-border-sub">{activeSubscriptions.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="tab-trigger-plans flex items-center gap-2">
                        Pending Requests
                        {pendingSubscriptions.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[8px]">{pendingSubscriptions.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="standard" className="tab-trigger-plans">Standard Tiers</TabsTrigger>
                    <TabsTrigger value="custom" className="tab-trigger-plans">Custom Plans</TabsTrigger>
                    <TabsTrigger value="rates" className="tab-trigger-plans">Service Rates</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.map(plan => (
                            <PlanCard 
                                key={plan.id} 
                                plan={plan} 
                                onEdit={(p) => handleOpenTerminal('edit', p)}
                                onView={(p) => handleOpenTerminal('view', p)}
                                onDelete={(p) => confirmDeleteRequest(p)}
                                canEdit={userIsSuperAdmin}
                            />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="subscriptions" className="m-0">
                    <div className="grid grid-cols-1 gap-3 max-w-5xl">
                        {activeSubscriptions.map(client => {
                            const plan = plans.find(p => p.id === client.planId);
                            return (
                                <Card key={client.id} className="bg-bg-secondary border-border-main group hover:border-text-muted transition-all">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className="p-3 bg-bg-tertiary rounded-xl border border-border-sub group-hover:bg-brand-red-dim transition-colors">
                                                <Building2 size={24} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{client.clientCompany || client.name}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <Badge variant="active" className="text-[8px] h-4 uppercase tracking-widest">Active Partner</Badge>
                                                    <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{client.businessType || 'Strategic Entity'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-12">
                                            <div className="text-left min-w-[150px]">
                                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-0.5">Assigned Tier</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-text-primary uppercase">{plan?.name || 'Manual Settlement'}</p>
                                                    <Badge variant="outline" className="text-[8px] bg-bg-tertiary">{plan?.type === 'custom' ? 'CUSTOM' : 'STD'}</Badge>
                                                </div>
                                            </div>
                                            <div className="text-right min-w-[120px]">
                                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-0.5">Monthly Settlement</p>
                                                <p className="text-sm font-mono font-bold text-text-green">${(plan?.price || 0).toLocaleString()}</p>
                                            </div>
                                            <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                                <ChevronRight size={18} />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                        {activeSubscriptions.length === 0 && (
                            <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl opacity-40 bg-bg-secondary/30">
                                <ShieldCheck size={48} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No active client agreements in registry</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="pending" className="m-0">
                    <div className="mb-6 p-4 rounded-xl bg-bg-secondary border border-border-sub flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-red-dim rounded-lg border border-brand-red/20 text-brand-red">
                                <ExternalLink size={18} />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">External Intake Buffer</p>
                                <p className="text-[10px] text-text-muted font-medium uppercase leading-relaxed">
                                    Partner applications are synchronized from the global enrollment form.
                                </p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-9 px-6 text-[10px] uppercase font-bold tracking-widest border-border-sub" asChild>
                            <a href="https://forms.gle/t2oLLtwqtuuL5KJ78" target="_blank" rel="noopener noreferrer">
                                <ExternalLink size={14} className="mr-2" />
                                View Source Form
                            </a>
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-w-5xl">
                        {pendingSubscriptions.map(client => (
                            <Card key={client.id} className="bg-bg-secondary border-border-main border-dashed border-accent-gold/40">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="p-3 bg-accent-gold-dim/20 rounded-xl border border-accent-gold/20 text-accent-gold">
                                            <History size={24} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{client.clientCompany || client.name}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <Badge variant="onhold" className="text-[8px] h-4 uppercase tracking-widest">Awaiting Authorization</Badge>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">New Partner Registry</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="h-8 text-[9px] uppercase font-bold border-border-sub"
                                            onClick={() => handleDiscardRequest(client.id)}
                                        >
                                            Discard Request
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            className="h-8 text-[9px] uppercase font-bold bg-accent-gold hover:bg-accent-gold/90"
                                            onClick={() => handleInitializeQuote(client.id)}
                                        >
                                            Initialize Quote
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {pendingSubscriptions.length === 0 && (
                            <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl opacity-40 bg-bg-secondary/30">
                                <Zap size={48} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No pending service agreements</p>
                            </div>
                        )}
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
                                onDelete={(p) => confirmDeleteRequest(p)}
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
                                onDelete={(p) => confirmDeleteRequest(p)}
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

                <TabsContent value="rates" className="m-0">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {SERVICE_RATES.map((rate, i) => (
                            <Card key={i} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                                <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-bg-primary rounded-lg border border-border-sub group-hover:bg-brand-red-dim group-hover:border-brand-red/30 transition-all">
                                            <rate.icon size={16} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                        </div>
                                        <CardTitle className="text-[10px] font-bold uppercase tracking-wider truncate">{rate.service}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 text-center space-y-2">
                                    <p className="text-xl font-mono font-bold text-text-primary tracking-tighter">{rate.rate}</p>
                                    <div className="flex items-center justify-center gap-1.5">
                                        <div className="h-1 w-1 rounded-full bg-brand-red animate-pulse" />
                                        <p className="text-[8px] font-black text-brand-red uppercase tracking-widest">{rate.min}</p>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-bg-tertiary/20 border-t border-border-sub/50 p-2 justify-center">
                                    <p className="text-[7px] font-bold text-text-muted uppercase tracking-tighter">Standard Policy</p>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* PLAN ARCHITECT / AUDIT TERMINAL */}
            <Dialog open={isTerminalOpen} onOpenChange={setIsTerminalOpen}>
                <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
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

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Target Client</Label>
                                <Select 
                                    disabled={terminalMode === 'view' || selectedPlan.type === 'standard'}
                                    value={selectedPlan.clientName || "Standard Tier"}
                                    onValueChange={(val) => setSelectedPlan({...selectedPlan, clientName: val === "Standard Tier" ? undefined : val})}
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
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Agreement Identifier</Label>
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
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Monthly Rate ($)</Label>
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
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Settlement Cycle</Label>
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
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Verified Site Quota</Label>
                                <Input 
                                    readOnly={terminalMode === 'view'}
                                    type="number" 
                                    className="h-11 bg-bg-primary text-sm font-mono font-bold"
                                    value={selectedPlan.siteLimit || 0}
                                    onChange={e => setSelectedPlan({...selectedPlan, siteLimit: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted flex">Response Tier SLA</Label>
                                <Select 
                                    disabled={terminalMode === 'view'}
                                    value={selectedPlan.responseTime} 
                                    onValueChange={(val) => setSelectedPlan({...selectedPlan, responseTime: val})}
                                >
                                    <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Same-Day">Same-Day Priority</SelectItem>
                                        <SelectItem value="2h">2-Hour Emergency</SelectItem>
                                        <SelectItem value="4h">4-Hour Critical</SelectItem>
                                        <SelectItem value="8h">8-Hour Priority</SelectItem>
                                        <SelectItem value="24h">24-Hour Standard</SelectItem>
                                        <SelectItem value="48h">48-Hour Routine</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* SELECTABLE CAPABILITY GRID */}
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 block text-left">Capability Matrix</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
                                {PLAN_CAPABILITIES.map(feature => {
                                    const isSelected = selectedPlan.features?.includes(feature);
                                    return (
                                        <div 
                                            key={feature} 
                                            onClick={() => handleToggleFeature(feature)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-lg border transition-all",
                                                isSelected ? "bg-brand-red-dim/10 border-brand-red" : "bg-bg-primary border-border-sub",
                                                terminalMode !== 'view' ? "cursor-pointer hover:border-text-muted" : "opacity-80"
                                            )}
                                        >
                                            <span className={cn("text-[10px] font-bold uppercase tracking-tight", isSelected ? "text-text-primary" : "text-text-muted")}>{feature}</span>
                                            <Checkbox checked={isSelected} className={cn("h-4 w-4", terminalMode === 'view' && "pointer-events-none")} />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default">
                        {terminalMode === 'view' ? (
                            <Button variant="outline" onClick={() => setIsTerminalOpen(false)} className="w-full h-11 uppercase font-bold text-[10px] tracking-widest">Exit Audit</Button>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <Button variant="outline" onClick={() => setIsTerminalOpen(false)} className="h-11 uppercase font-bold text-[10px] tracking-widest">Discard Changes</Button>
                                <Button onClick={handleSavePlan} className="h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">
                                    Authorize Agreement
                                </Button>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DELETE CONFIRMATION TERMINAL */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Authorize Deletion</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">This will permanently purge the plan from the operational registry.</DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-4 text-left">
                        <div className="p-4 rounded-lg bg-brand-red-dim/5 border border-brand-red/30">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest mb-1">Safety Lock Required</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium">
                                To confirm deletion of <span className="text-text-primary font-bold">{planToDelete?.name}</span>, type the plan name exactly as shown below.
                            </p>
                        </div>

                        <div className="space-y-2 pt-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted flex">Type <span className="text-text-primary ml-1">{planToDelete?.name}</span> to confirm</Label>
                            <Input 
                                placeholder="Enter identifier..." 
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                className="h-11 bg-bg-primary border-border-sub text-center font-mono font-bold uppercase tracking-widest"
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                        <Button 
                            variant="destructive"
                            onClick={executeDelete} 
                            disabled={deleteConfirmText !== planToDelete?.name}
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white"
                        >
                            Authorize Purge
                        </Button>
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
    onDelete: (p: PlanTier) => void;
    canEdit: boolean;
}) {
    const isCustom = plan.type === 'custom';
    const isStandard = plan.type === 'standard';

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
                        {canEdit && !isStandard && <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red" onClick={() => onDelete(plan)}><Trash2 size={14}/></Button>}
                        {canEdit && isStandard && <div className="h-7 w-7 flex items-center justify-center text-text-muted/30" title="Standard Tier Locked"><Lock size={12}/></div>}
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
                        {plan.features.slice(0, 5).map((feature, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-text-green" />
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-tight truncate">{feature}</span>
                            </div>
                        ))}
                        {plan.features.length > 5 && (
                            <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest pl-3">+{plan.features.length - 5} More Capabilities</p>
                        )}
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
                            <span className="text-[10px] font-mono font-bold text-text-primary">{plan.responseTime}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                             <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted uppercase">
                                <TrendingUp size={12}/> Est. Margin
                            </div>
                            <span className="text-[10px] font-mono font-bold text-text-green">
                                ~${(plan.price * 0.75).toFixed(0)} / mo
                            </span>
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
