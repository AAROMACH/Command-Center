
'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    User, 
    Mail, 
    Phone, 
    Building2, 
    MapPin, 
    ShieldCheck,
    Briefcase,
    FileText,
    Pencil,
    Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ClientProfilePage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const user = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    if (!mounted || !currentUserId || !user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        Client Identity
                    </p>
                    <h1 className="page-title">Personal Profile</h1>
                    <p className="page-subtitle">Official portal credentials and organizational context.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[200px]" 
                            placeholder="Find detail..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="outline">
                        <Pencil size={14} className="mr-2"/>
                        Request Profile Update
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEFT: Identity Card */}
                <div className="space-y-6">
                    <Card className="bg-bg-secondary border-border-main text-center">
                        <CardContent className="pt-8 pb-8 space-y-4">
                            <div className="flex justify-center">
                                <Avatar className="h-24 w-24 border-2 border-border-sub">
                                    <AvatarImage src={user.avatarUrl} />
                                    <AvatarFallback className="text-2xl font-bold">{user.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-text-primary uppercase tracking-wide">{user.name}</h2>
                                <p className="text-xs text-brand-red font-bold uppercase tracking-widest">{user.role}</p>
                            </div>
                            <div className="flex justify-center gap-2">
                                <Badge variant="active" className="text-[10px] uppercase">Portal Verified</Badge>
                                <Badge variant="outline" className="text-[10px] uppercase bg-bg-tertiary">Tier 1 Internal</Badge>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-bg-tertiary/30 border-t border-border-sub p-4 grid grid-cols-2 divide-x divide-border-sub">
                            <div className="text-center">
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">ID Reference</p>
                                <p className="text-[10px] font-mono font-bold text-text-primary mt-0.5">{user.id.toUpperCase()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Since</p>
                                <p className="text-[10px] font-bold text-text-primary mt-0.5">JUL 2024</p>
                            </div>
                        </CardFooter>
                    </Card>

                    <Card className="bg-bg-tertiary/30 border-border-sub">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14} className="text-text-green"/> Authorization Level
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded bg-bg-primary border border-border-sub space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase">Portal Access</p>
                                <p className="text-xs font-bold text-text-primary uppercase tracking-tight">Full Strategic Visibility</p>
                            </div>
                            <div className="p-3 rounded bg-bg-primary border border-border-sub space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase">Site Authority</p>
                                <p className="text-xs font-bold text-text-primary uppercase tracking-tight">Global Organization Lead</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Detailed Information */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Contact Credentials</CardTitle>
                            <CardDescription>Official lines of communication for critical alerts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Verified Email</Label>
                                    <div className="flex items-center gap-3 p-3 rounded bg-bg-primary border border-border-sub">
                                        <Mail size={14} className="text-text-muted" />
                                        <span className="text-sm font-semibold">{user.email}</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Direct Line</Label>
                                    <div className="flex items-center gap-3 p-3 rounded bg-bg-primary border border-border-sub">
                                        <Phone size={14} className="text-text-muted" />
                                        <span className="text-sm font-semibold">{user.phone}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Organizational Context</CardTitle>
                            <CardDescription>Details regarding your associated entity and business classification.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center gap-6 p-6 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="p-4 bg-bg-tertiary rounded-lg border border-border-sub text-brand-red">
                                    <Building2 size={32} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Affiliated Organization</p>
                                    <h3 className="text-xl font-bold text-text-primary uppercase tracking-wide">{user.clientCompany || 'Independent'}</h3>
                                    <p className="text-xs text-accent-gold font-black uppercase tracking-widest">{user.businessType || 'Service Partner'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Briefcase size={16} className="text-text-muted" />
                                        <span className="text-xs font-bold uppercase text-text-primary">Managed Sites</span>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-brand-red">{(user.managedSites || []).length}</span>
                                </div>
                                <div className="p-4 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText size={16} className="text-text-muted" />
                                        <span className="text-xs font-bold uppercase text-text-primary">Active Documents</span>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-brand-red">12</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
