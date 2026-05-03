'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bell, 
  Shield, 
  Settings as SettingsIcon, 
  CreditCard,
  Building2,
  Mail,
  History,
  ShieldCheck,
  ChevronRight,
  Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { technicians } from '@/lib/data';

export default function ClientSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(technicians.find(t => t.id === userId));
        }
    }, []);

    const handleToggle = (setting: string) => {
        toast({
            title: "Configuration Synced",
            description: `${setting} has been updated for your account.`,
        });
    };

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Stakeholder Terminal
                    </p>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage communication protocols, organizational details, and account security.</p>
                </div>
            </header>

            <Tabs defaultValue="notifications" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8">
                    <TabsTrigger value="notifications" className="flex items-center gap-2 py-3">
                        <Bell size={14}/> Notifications
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2 py-3">
                        <Shield size={14}/> Security
                    </TabsTrigger>
                    <TabsTrigger value="organization" className="flex items-center gap-2 py-3">
                        <Building2 size={14}/> Organization
                    </TabsTrigger>
                    <TabsTrigger value="billing" className="flex items-center gap-2 py-3">
                        <CreditCard size={14}/> Billing
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    {/* NOTIFICATIONS */}
                    <TabsContent value="notifications" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Service Funnel Alerts</CardTitle>
                                <CardDescription>Configure which mission-critical events generate automated alerts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {[
                                    { id: 'cn-1', label: 'Ticket Status Updates', desc: 'Alert when a service ticket moves from review to approved.' },
                                    { id: 'cn-2', label: 'Project Milestones', desc: 'Alert when a project phase is marked as completed.' },
                                    { id: 'cn-3', label: 'Site Check-ins', desc: 'Alert when a technician verifies their presence on-site.' },
                                    { id: 'cn-4', label: 'Invoice Availability', desc: 'Alert when a new financial record is finalized.' },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                            <p className="text-[10px] text-text-muted">{item.desc}</p>
                                        </div>
                                        <Switch defaultChecked onCheckedChange={() => handleToggle(item.label)} />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* SECURITY */}
                    <TabsContent value="security" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Data Protection</CardTitle>
                                <CardDescription>Manage credentials and multi-factor security for your organization.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-brand-red rounded-md text-white">
                                            <ShieldCheck size={20}/>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold uppercase tracking-wider">Two-Factor Authentication</p>
                                            <p className="text-xs text-text-muted">Require extra verification for all portal logins.</p>
                                        </div>
                                    </div>
                                    <Switch onCheckedChange={() => handleToggle("2FA")} />
                                </div>
                                
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold uppercase tracking-wider">Access Registry Audit</p>
                                        <p className="text-[10px] text-text-muted">Review recently authorized devices and login locations.</p>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-8 text-[10px]">
                                        <History size={14} className="mr-2" /> View Audit Log
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ORGANIZATION */}
                    <TabsContent value="organization" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Corporate Identity</CardTitle>
                                <CardDescription>Verified information for {currentUser?.clientCompany || 'your organization'}.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted">Organization Name</Label>
                                        <Input disabled value={currentUser?.clientCompany || ''} className="bg-bg-primary opacity-60" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted">Business Classification</Label>
                                        <Input disabled value={currentUser?.businessType || 'Strategic Partner'} className="bg-bg-primary opacity-60" />
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-bg-tertiary/50 border border-border-sub">
                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
                                        Note: Organizational parameters are locked for strategic stakeholders. Please contact your Aaromach Account Manager to modify core registry data.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* BILLING */}
                    <TabsContent value="billing" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Payment Protocol</CardTitle>
                                <CardDescription>Manage active methods for invoice settlement.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-green">
                                            <CreditCard size={18} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Visa ending in 4242</p>
                                            <p className="text-[9px] text-text-muted uppercase tracking-widest">Expires 12/2026</p>
                                        </div>
                                    </div>
                                    <Badge variant="active" className="text-[8px] h-5">Primary</Badge>
                                </div>
                                <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest">
                                    Manage Methods in Financials Portal
                                    <ChevronRight size={14} className="ml-2" />
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
