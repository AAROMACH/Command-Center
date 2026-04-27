import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const financialMetrics = [
    { title: "TOTAL REVENUE (MTD)", value: "$42,850.00", trend: "+12.4% VS LAST MONTH", trendType: "positive" as const, TrendIcon: ArrowUpRight },
    { title: "PENDING PAYOUTS", value: "$12,450.00", trend: "ACROSS 8 TECHNICIANS", trendType: "negative" as const, TrendIcon: ArrowDownRight },
    { title: "OUTSTANDING A/R", value: "$8,920.00", trend: "NOMINAL STATUS", trendType: "warning" as const, TrendIcon: Minus },
    { title: "SERVICE MARGIN", value: "32.8%", trend: "NOMINAL THRESHOLD: 25%", trendType: "positive" as const, TrendIcon: ArrowUpRight },
];

export default function FinancialsPage() {
    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        FINANCIAL OPERATIONS HUB
                    </p>
                    <h1 className="page-title">ACCOUNTING</h1>
                    <p className="page-subtitle">Consolidated management of client revenue, technician payroll, and project overhead.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="outline">⇩ EXPORT GENERAL LEDGER</Button>
                    <Button variant="secondary">CLOSE FISCAL PERIOD</Button>
                </div>
            </header>

            <Tabs defaultValue="summary" className="w-full">
                <TabsList className="tabs !p-0 !bg-bg-tertiary">
                    <TabsTrigger value="summary" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">SUMMARY</TabsTrigger>
                    <TabsTrigger value="payroll" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">PAYROLL AUDIT</TabsTrigger>
                    <TabsTrigger value="invoices" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">INVOICES</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {financialMetrics.map((metric, index) => (
                            <Card key={index} className="bg-bg-tertiary border-border-subtle">
                                <CardHeader className="pb-4">
                                    <div className="flex justify-between items-start">
                                        <span className="text-xs font-bold uppercase tracking-wider text-text-muted">{metric.title}</span>
                                        <metric.TrendIcon size={16} className={
                                            metric.trendType === 'positive' ? 'text-text-green' :
                                            metric.trendType === 'negative' ? 'text-text-red' :
                                            'text-accent-gold'
                                        } />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className={`text-4xl font-bold 
                                        ${metric.trendType === 'negative' ? 'text-text-red' :
                                          metric.trendType === 'warning' ? 'text-accent-gold' :
                                          'text-text-primary'}`
                                    }>
                                        {metric.value}
                                    </p>
                                    <p className={`text-xs font-semibold tracking-wider uppercase mt-2 
                                        ${metric.trendType === 'positive' ? 'text-text-green' :
                                          'text-text-muted'}`
                                    }>
                                        {metric.trend}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                     <div className="mt-6 empty-state">Further financial summary components can be added here.</div>
                </TabsContent>
                <TabsContent value="payroll"><div className="empty-state">Payroll audit page coming soon.</div></TabsContent>
                <TabsContent value="invoices"><div className="empty-state">Invoices page coming soon.</div></TabsContent>
            </Tabs>

        </div>
    );
}
