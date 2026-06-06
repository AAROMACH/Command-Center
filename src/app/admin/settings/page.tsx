"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  Search,
  Clock,
  Globe,
  Bell,
  Terminal
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';

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
        name: 'Stripe Settlement',
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
        <div className="space-y-6 text-left max-w-5xl mx-auto pb-24">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Administration
                    </p>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Unified terminal for global operational and security parameters.</p>
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

            <div className="space-y-8">
                {/* GENERAL OPERATIONS */}
                <section id="general" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Globe size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">General Operations</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Regional Deployment</CardTitle>
                            <CardDescription>Manage anchor regions and temporal system parameters.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-2">
                                            Primary Service Region
                                        </Label>
                                        <Select defaultValue="detroit">
                                            <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="detroit">Detroit / SE Michigan (HQ)</SelectItem>
                                                <SelectItem value="chicago">Chicago / Great Lakes</SelectItem>
                                                <SelectItem value="atlanta">Atlanta / SE Region</SelectItem>
                                                <SelectItem value="remote">Global / Remote Dispatch</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-2">
                                            Regional Timezone
                                        </Label>
                                        <Select defaultValue="est">
                                            <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
                                                <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
                                                <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted">Active Dispatch Window</Label>
                                        <div className="grid grid-cols-2 gap-2 text-left">
                                            <Input type="time" defaultValue="08:00" className="bg-bg-primary h-11 text-xs" />
                                            <Input type="time" defaultValue="20:00" className="bg-bg-primary h-11 text-xs" />
                                        </div>
                                        <p className="text-[9px] text-text-muted uppercase font-bold italic tracking-tighter mt-1 text-left">Alert suppression active outside this window.</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-bg-tertiary/30 border-t border-border-default pt-4">
                            <Button className="h-10 px-12 uppercase font-bold text-[10px] tracking-widest bg-brand-red">
                                Update Global Parameters
                            </Button>
                        </CardFooter>
                    </Card>
                </section>

                {/* SECURITY */}
                <section id="security" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Lock size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.SECURITY}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Authentication Protocols</CardTitle>
                            <CardDescription>Configure password complexity and identity verification layers.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border border-border-sub p-4 bg-bg-primary">
                                <div className="space-y-1 text-left">
                                    <h4 className="text-xs font-bold uppercase text-text-primary">Registry Lock Rotation</h4>
                                    <p className="text-[10px] text-text-muted uppercase">Mandatory periodic credential cycling.</p>
                                </div>
                                <Switch />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-border-sub p-4 bg-bg-primary">
                                <div className="space-y-1 text-left">
                                    <h4 className="text-xs font-bold uppercase text-text-primary">Enforce Multi-Factor (MFA)</h4>
                                    <p className="text-[10px] text-text-muted uppercase font-bold text-brand-red">High Priority Protocol</p>
                                </div>
                                <Switch defaultChecked />
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* NOTIFICATIONS */}
                <section id="notifications" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Global Alert Channels</CardTitle>
                            <CardDescription>Manage automated system and field update transmissions.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                <Label htmlFor="global-email" className="flex flex-col space-y-1 text-left">
                                    <span className="text-xs font-bold uppercase text-text-primary">Email Dispatch</span>
                                    <span className="text-[10px] text-text-muted uppercase">Transmission of formal manifests and audit logs.</span>
                                </Label>
                                <Switch id="global-email" defaultChecked />
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                <Label htmlFor="global-sms" className="flex flex-col space-y-1 text-left">
                                    <span className="text-xs font-bold uppercase text-text-primary">SMS Tactical Alerts</span>
                                    <span className="text-[10px] text-text-muted uppercase">Direct field operative check-in notifications.</span>
                                </Label>
                                <Switch id="global-sms" />
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* INTEGRATIONS */}
                <section id="api" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Activity size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.INTEGRATIONS}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {integrations.map((item) => (
                            <Card key={item.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                                <CardHeader className="pb-3 text-left">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-bg-primary rounded border border-border-sub group-hover:bg-brand-red group-hover:text-white transition-colors">
                                                <item.icon size={18} />
                                            </div>
                                            <div className="space-y-0.5 text-left">
                                                <CardTitle className="text-sm font-bold uppercase">{item.name}</CardTitle>
                                                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">Status Audit</p>
                                            </div>
                                        </div>
                                        {getStatusBadge(item.status)}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 text-left">
                                    <p className="text-[11px] text-text-secondary leading-normal uppercase font-medium">{item.purpose}</p>
                                    <div className="grid grid-cols-2 gap-4 p-2.5 rounded bg-bg-primary/50 border border-border-sub/50">
                                        <div className="text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase mb-0.5">Health Check</p>
                                            <p className="text-[10px] font-mono font-bold text-text-primary uppercase">{item.lastChecked}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-text-muted uppercase mb-0.5">Registry Notes</p>
                                            <p className="text-[10px] font-bold text-accent-gold uppercase truncate">SECURE LINK</p>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0 flex justify-between gap-2">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 flex-1 text-[9px] font-bold uppercase border border-border-sub hover:bg-bg-tertiary"
                                        onClick={() => handleTest(item.id)}
                                        disabled={item.status === 'Placeholder' || isTesting === item.id}
                                    >
                                        {isTesting === item.id ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : <Activity className="mr-1.5 h-3 w-3" />}
                                        Run Safe Handshake
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 w-8 px-0 border-border-sub"
                                    >
                                        <ExternalLink size={14} />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
