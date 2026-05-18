'use client';

import { useState, useMemo } from 'react';
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
    MoreHorizontal,
    PenTool,
    Trash2,
    Sparkles,
    LayoutDashboard
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { technicians } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
    const [isArchitectOpen, setIsArchitectOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [newPlan, setNewPlan] = useState<Partial<PlanTier>>({
        type: 'custom',
        billingPeriod: 'monthly',
        features: [],
        siteLimit: 5,
        responseTime: '4h'
    });
    
    const { toast } = useToast();

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

    const handleCreateCustomPlan = () => {
        if (!newPlan.name || !newPlan.clientName || !newPlan.price) {
            toast({ variant: 'destructive', title: 'Registry Error', description: 'Please populate all critical plan parameters.' });
            return;
        }

        const plan: PlanTier = {
            ...newPlan as PlanTier,
            id: `cust-${Date.now()}`,
            type: 'custom'
        };

        setPlans(prev => [...prev, plan]);
        setIsArchitectOpen(false);
        setNewPlan({
            type: 'custom',
            billingPeriod: 'monthly',
            features: [],
            siteLimit: 5,
            responseTime: '4h'
        });
        
        toast({
            title: "Custom Agreement Authorized",
            description: `${plan.name} for ${plan.clientName} has been committed to the registry.`,
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
                    <Button onClick={() => setIsArchitectOpen(true)} className="h-10 px-6 font-bold uppercase tracking-widest">
                        <Plus size={16} className="mr-2" />
                        Architect Custom Plan
                    </Button>
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
                            <PlanCard key={plan.id} plan={plan} />
                        ))}
                    </div>
                </TabsContent>
                
                <TabsContent value="standard" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.filter(p => p.type === 'standard').map(plan => (
                            <PlanCard key={plan.id} plan={plan} />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="custom" className="m-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPlans.filter(p => p.type === 'custom').map(plan => (
                            <PlanCard key={plan.id} plan={plan} />
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

            {/* PLAN ARCHITECT DIALOG */}
            <Dialog open={isArchitectOpen} onOpenChange={setIsArchitectOpen}>
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-3">
                            <PenTool className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Custom Plan Architect</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Construct a high-fidelity service agreement for strategic stakeholders.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Target Client</Label>
                                <Select onValueChange={(val) => setNewPlan({...newPlan, clientName: val})}>
                                    <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue placeholder="Select registry..." /></SelectTrigger>
                                    <SelectContent>
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
                                    placeholder="e.g. Q3 Strategic Fiber" 
                                    className="h-11 bg-bg-primary text-xs font-bold uppercase"
                                    onChange={e => setNewPlan({...newPlan, name: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Monthly Rate ($)</Label>
                                <div className="relative">
                                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-green" />
                                    <Input 
                                        type="number" 
                                        placeholder="0.00" 
                                        className="h-11 bg-bg-primary pl-10 text-sm font-mono font-bold"
                                        onChange={e => setNewPlan({...newPlan, price: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Settlement Cycle</Label>
                                <Select defaultValue="monthly">
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
                                    type="number" 
                                    defaultValue={5} 
                                    className="h-11 bg-bg-primary text-sm font-mono font-bold"
                                    onChange={e => setNewPlan({...newPlan, siteLimit: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Response Tier SLA</Label>
                                <Select defaultValue="4h" onValueChange={(val) => setNewPlan({...newPlan, responseTime: val})}>
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

                        <div className="p-4 rounded-xl bg-accent-gold-dim/5 border border-accent-gold/20 flex items-start gap-4">
                            <Sparkles className="text-accent-gold h-5 w-5 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-accent-gold uppercase tracking-widest">Protocol Note</p>
                                <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium">
                                    Custom agreements bypass standard portal constraints. Ensure specific SOW parameters are attached to the client folder in the registry.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default grid grid-cols-2 gap-3">
                        <Button variant="outline" onClick={() => setIsArchitectOpen(false)} className="h-11 uppercase font-bold text-[10px] tracking-widest">Discard Shell</Button>
                        <Button onClick={handleCreateCustomPlan} className="h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                            Authorize Agreement
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

function PlanCard({ plan }: { plan: PlanTier }) {
    const isCustom = plan.type === 'custom';
    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main flex flex-col group transition-all hover:border-text-muted",
            isCustom ? "border-brand-red/30 shadow-[0_0_15px_rgba(204,34,0,0.05)]" : ""
        )}>
            <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-4">
                <div className="flex justify-between items-start mb-2">
                    <Badge variant={isCustom ? "high" : "outline"} className={cn("text-[9px] uppercase tracking-widest h-5", !isCustom && "bg-bg-primary text-text-muted")}>
                        {plan.type} Agreement
                    </Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-primary"><PenTool size={14}/></Button>
                        {!isCustom && <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red"><Trash2 size={14}/></Button>}
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
                <div className="mb-6 flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-bold text-text-primary">${plan.price.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-text-muted uppercase">/ {plan.billingPeriod}</span>
                </div>

                <div className="space-y-4 flex-1">
                    <div className="space-y-2">
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
                <Button variant="outline" className="w-full h-9 text-[10px] font-bold uppercase tracking-widest bg-bg-primary hover:bg-bg-tertiary">
                    View Registry Details
                    <ChevronRight size={14} className="ml-2" />
                </Button>
            </CardFooter>
        </Card>
    );
}
