'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    User, 
    Building2, 
    ShieldCheck,
    Pencil,
    Search,
    Banknote,
    Mail,
    FileText,
    Clock,
    Key
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ChangePasswordDialog } from "@/components/change-password-dialog";

export default function ClientProfilePage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentUserId(userId);
    }, []);

    const user = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const handleSave = () => {
        toast({ title: "Profile Registry Updated", description: "Your contact and billing parameters have been committed." });
    };

    if (!mounted || !currentUserId || !user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        Client Identity
                    </p>
                    <h1 className="page-title">Personal Profile</h1>
                    <p className="page-subtitle">Official portal credentials and organizational context.</p>
                </div>
                <div className="page-header-right items-center text-left">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[200px]" 
                            placeholder="Find detail..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleSave}>
                        Commit Changes
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEFT: Identity Card */}
                <div className="space-y-6 text-left">
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
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-tertiary/30 border-border-sub">
                        <CardHeader className="pb-3 text-left">
                            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14} className="text-text-green"/> Authorization Level
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded bg-bg-primary border border-border-sub space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase">Portal Access</p>
                                <p className="text-xs font-bold text-text-primary uppercase tracking-tight">Full Strategic Visibility</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="text-left">
                        <CardHeader>
                            <CardTitle>Security Registry</CardTitle>
                            <CardDescription>Manage credentials and portal access keys.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full" onClick={() => setIsPasswordDialogOpen(true)}>
                                <Key size={14} className="mr-2"/> Change Access Key
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Detailed Information */}
                <div className="lg:col-span-2 space-y-6 text-left">
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal Contact</CardTitle>
                            <CardDescription>Direct lines of communication for portal notifications.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Verified Email</Label>
                                    <Input defaultValue={user.email} className="bg-bg-primary" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Direct Line</Label>
                                    <Input defaultValue={user.phone} className="bg-bg-primary" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2 mb-1">
                                <Banknote size={16} className="text-brand-red" />
                                <CardTitle>Billing Registry</CardTitle>
                            </div>
                            <CardDescription>Strategic parameters for invoice delivery and settlement terms.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Billing Contact Name</Label>
                                    <Input 
                                        placeholder="Accounts Payable / Name" 
                                        defaultValue={user.billingDetails?.contactName}
                                        className="bg-bg-primary h-11 text-xs" 
                                    />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Billing Email Address</Label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input 
                                            placeholder="ap@organization.com" 
                                            defaultValue={user.billingDetails?.email}
                                            className="bg-bg-primary pl-9 h-11 text-xs" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Payment Terms</Label>
                                    <Select defaultValue={user.billingDetails?.terms || 'Net 30'}>
                                        <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Net 15">Net 15</SelectItem>
                                            <SelectItem value="Net 30">Net 30</SelectItem>
                                            <SelectItem value="Net 60">Net 60</SelectItem>
                                            <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Invoice Delivery Mode</Label>
                                    <Select defaultValue={user.billingDetails?.deliveryMethod || 'Portal'}>
                                        <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Email">Email Only</SelectItem>
                                            <SelectItem value="Portal">Portal Only</SelectItem>
                                            <SelectItem value="Both">Email & Portal</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Organizational Context</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-6 p-6 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="p-4 bg-bg-tertiary rounded-lg border border-border-sub text-brand-red">
                                    <Building2 size={32} />
                                </div>
                                <div className="space-y-1 text-left">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Affiliated Organization</p>
                                    <h3 className="text-xl font-bold text-text-primary uppercase tracking-wide">{user.clientCompany || 'Independent'}</h3>
                                    <p className="text-xs text-accent-gold font-black uppercase tracking-widest">{user.businessType || 'Service Partner'}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <ChangePasswordDialog 
                isOpen={isPasswordDialogOpen} 
                setIsOpen={setIsPasswordDialogOpen} 
            />
        </div>
    );
}
