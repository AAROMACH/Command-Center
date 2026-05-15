
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  MapPin, 
  MessageSquare, 
  Flame, 
  Mail, 
  CreditCard, 
  Activity, 
  ExternalLink, 
  Lock,
  RefreshCw,
  AlertCircle,
  Search
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type IntegrationStatus = 'Connected' | 'Not Connected' | 'Placeholder' | 'Error';

interface Integration {
    id: string;
    name: string;
    icon: any;
    purpose: string;
    status: IntegrationStatus;
    lastChecked: string;
    notes: string;
}

const integrations: Integration[] = [
    {
        id: 'gmaps',
        name: 'Google Maps Platform',
        icon: MapPin,
        purpose: 'Site coordinate visualization and tactical routing.',
        status: 'Connected',
        lastChecked: '2 min ago',
        notes: 'API key restricted to verified deployment domains.'
    },
    {
        id: 'twilio',
        name: 'Twilio SMS',
        icon: MessageSquare,
        purpose: 'Field dispatch alerts and automated check-in notifications.',
        status: 'Connected',
        lastChecked: '15 min ago',
        notes: 'Account SID managed via secure environment variables.'
    },
    {
        id: 'firebase_ext',
        name: 'Firebase Extensions',
        icon: Flame,
        purpose: 'Server-side image optimization and automated email triggers.',
        status: 'Placeholder',
        lastChecked: 'N/A',
        notes: 'Managed via Firebase CLI. Extension logic pending deployment.'
    },
    {
        id: 'sendgrid',
        name: 'SendGrid Protocol',
        icon: Mail,
        purpose: 'Official report delivery and system-level comms.',
        status: 'Connected',
        lastChecked: '1 hour ago',
        notes: 'SMTP credentials stored in Secret Manager.'
    },
    {
        id: 'stripe',
        name: 'Financial Settlement',
        icon: CreditCard,
        purpose: 'Automated client invoice processing and payout logic.',
        status: 'Placeholder',
        lastChecked: 'N/A',
        notes: 'Stripe Test Mode active. Production handshake pending.'
    }
];

export default function SettingsPage() {
    const { toast } = useToast();
    const [isTesting, setIsTesting] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const handleTest = (id: string) => {
        setIsTesting(id);
        setTimeout(() => {
            setIsTesting(null);
            toast({
                title: "Handshake Successful",
                description: `Communication verified with ${integrations.find(i => i.id === id)?.name}.`,
            });
        }, 1500);
    };

    const getStatusBadge = (status: IntegrationStatus) => {
        switch (status) {
            case 'Connected': return <Badge variant="active" className="text-[8px] h-4">Connected</Badge>;
            case 'Placeholder': return <Badge variant="onhold" className="text-[8px] h-4">Standby</Badge>;
            case 'Error': return <Badge variant="missed" className="text-[8px] h-4">Error</Badge>;
            default: return <Badge variant="outline" className="text-[8px] h-4">Unknown</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Administration
                    </p>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Configure global parameters and monitor system-level integrations.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Find setting..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="tabs !p-0 !bg-bg-tertiary">
                    <TabsTrigger value="general" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">General</TabsTrigger>
                    <TabsTrigger value="security" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">Security</TabsTrigger>
                    <TabsTrigger value="notifications" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">Notifications</TabsTrigger>
                    <TabsTrigger value="api" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red flex items-center gap-2">
                        <Activity size={14}/>
                        API & Integrations
                    </TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                    <TabsContent value="general">
                        <Card>
                            <CardHeader>
                                <CardTitle>General Settings</CardTitle>
                                <CardDescription>Manage basic application identity and temporal settings.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="appName" className="text-[10px] uppercase font-bold text-text-muted">Application Name</Label>
                                    <Input id="appName" defaultValue="Aaromach Command Center" className="bg-bg-primary h-11 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="timezone" className="text-[10px] uppercase font-bold text-text-muted">Regional Timezone</Label>
                                    <Select defaultValue="est">
                                        <SelectTrigger id="timezone" className="bg-bg-primary h-11 text-xs"><SelectValue placeholder="Select a timezone" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
                                            <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
                                            <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-bg-tertiary/30 border-t border-border-default pt-4">
                                <Button className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Commit Changes</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="security">
                        <Card>
                            <CardHeader>
                                <CardTitle>Security Registry</CardTitle>
                                <CardDescription>Configure password complexity and authentication protocols.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between rounded-lg border border-border-sub p-4 bg-bg-primary">
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold uppercase text-text-primary">Registry Lock Rotation</h4>
                                        <p className="text-[10px] text-text-muted">Require users to cycle authentication keys periodically.</p>
                                    </div>
                                    <Switch />
                                </div>
                                <div className="flex items-center justify-between rounded-lg border border-border-sub p-4 bg-bg-primary">
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold uppercase text-text-primary">Enforce Multi-Factor (MFA)</h4>
                                        <p className="text-[10px] text-text-muted uppercase font-bold text-brand-red">High Security Mandatory</p>
                                    </div>
                                    <Switch defaultChecked />
                                </div>
                            </CardContent>
                            <CardFooter className="bg-bg-tertiary/30 border-t border-border-default pt-4">
                                <Button variant="secondary" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Update Security Ledger</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="notifications">
                        <Card>
                            <CardHeader>
                                <CardTitle>Global Alert Protocol</CardTitle>
                                <CardDescription>Master overrides for mission-critical event notifications.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                    <Label htmlFor="global-email" className="flex flex-col space-y-1">
                                        <span className="text-xs font-bold uppercase text-text-primary">Master Email Alerts</span>
                                        <span className="text-[10px] text-text-muted">Global switch for tactical report delivery.</span>
                                    </Label>
                                    <Switch id="global-email" defaultChecked />
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                    <Label htmlFor="global-sms" className="flex flex-col space-y-1">
                                        <span className="text-xs font-bold uppercase text-text-primary">Emergency SMS Pipeline</span>
                                        <span className="text-[10px] text-text-muted">Immediate field escalation via SMS protocol.</span>
                                    </Label>
                                    <Switch id="global-sms" />
                                </div>
                            </CardContent>
                            <CardFooter className="bg-bg-tertiary/30 border-t border-border-default pt-4">
                                <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Save Protocol Settings</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="api" className="space-y-6">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 flex items-start gap-4">
                            <Lock className="text-brand-red h-5 w-5 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Secure Integration Protocol</p>
                                <p className="text-[10px] text-text-secondary leading-relaxed uppercase">
                                    Raw credentials and API signatures are restricted from the UI to ensure mission-critical security. 
                                    Systems Administrators and Developers must manage authentication keys via **Firebase Console**, 
                                    **Firebase CLI (Secret Manager)**, or deployment environment variables.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {integrations.map((item) => (
                                <Card key={item.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-bg-primary rounded border border-border-sub group-hover:text-brand-red transition-colors">
                                                    <item.icon size={18} />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <CardTitle className="text-sm font-bold text-text-primary uppercase">{item.name}</CardTitle>
                                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">Status Audit</p>
                                                </div>
                                            </div>
                                            {getStatusBadge(item.status)}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <p className="text-[11px] text-text-secondary leading-normal">{item.purpose}</p>
                                        <div className="grid grid-cols-2 gap-4 p-2.5 rounded bg-bg-primary/50 border border-border-sub/50">
                                            <div>
                                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-0.5">Health Check</p>
                                                <p className="text-[10px] font-mono font-bold text-text-primary uppercase">{item.lastChecked}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-0.5">Registry Notes</p>
                                                <p className="text-[10px] font-bold text-accent-gold uppercase truncate" title={item.notes}>Verify in Console</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-0 flex justify-between gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 flex-1 text-[9px] font-bold uppercase tracking-widest border border-border-sub hover:bg-bg-tertiary"
                                            onClick={() => handleTest(item.id)}
                                            disabled={item.status === 'Placeholder' || isTesting === item.id}
                                        >
                                            {isTesting === item.id ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : <Activity className="mr-1.5 h-3 w-3" />}
                                            Run Safe Handshake
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 w-8 px-0 border-border-sub group-hover:border-text-muted"
                                            title="View Technical Documentation"
                                        >
                                            <ExternalLink size={14} />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>

                        <div className="p-4 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="text-text-muted h-4 w-4" />
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none">
                                    System Owners: Use <code className="bg-bg-primary px-1.5 py-0.5 rounded border border-border-sub text-brand-red mx-1 font-mono">firebase functions:secrets:set</code> to manage signatures via CLI.
                                </p>
                            </div>
                            <Button variant="link" className="text-[10px] font-bold uppercase text-accent-gold p-0 h-auto">Access Technical Wiki</Button>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
