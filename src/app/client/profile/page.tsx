'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { uploadAvatar } from '@/lib/upload';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    User,
    Building2,
    ShieldCheck,
    Search,
    Banknote,
    Mail,
    Key,
    CreditCard,
    ChevronRight,
    Camera,
    Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { auditFieldChange } from '@/lib/audit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function ClientProfilePage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [phone, setPhone] = useState("");
    const [billingContactName, setBillingContactName] = useState("");
    const [billingEmail, setBillingEmail] = useState("");
    const [billingTerms, setBillingTerms] = useState("Net 30");
    const [billingDelivery, setBillingDelivery] = useState("Portal");
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const savedSnapshotRef = useRef<Record<string, unknown>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            if (!fbUser) return;
            const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setCurrentUser({ ...data, id: snap.id });
                    setPhone(data.phone || '');
                    setAvatarUrl(data.avatarUrl);
                    setBillingContactName(data.billingDetails?.contactName || '');
                    setBillingEmail(data.billingDetails?.email || '');
                    setBillingTerms(data.billingDetails?.terms || 'Net 30');
                    setBillingDelivery(data.billingDetails?.deliveryMethod || 'Portal');
                    savedSnapshotRef.current = {
                        phone: data.phone || '',
                        billingDetails: data.billingDetails || {},
                    };
                }
            });
            return () => unsubUser();
        });
        return () => unsubAuth();
    }, []);

    const userFallback = useMemo(() => {
        if (!currentUser?.name) return 'CL';
        return currentUser.name.split(' ').map((n: string) => n[0]).join('');
    }, [currentUser]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser?.id) return;
        setIsUploading(true);
        try {
            const url = await uploadAvatar(currentUser.id, file);
            setAvatarUrl(url);
            toast({ title: "Avatar Updated", description: "Your profile photo has been uploaded." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!currentUser?.id) return;
        setIsSaving(true);
        try {
            const updates = {
                phone,
                billingDetails: {
                    contactName: billingContactName,
                    email: billingEmail,
                    terms: billingTerms,
                    deliveryMethod: billingDelivery,
                },
            };
            await auditFieldChange('users', currentUser.id, currentUser.id, currentUser.name || currentUser.id, savedSnapshotRef.current, updates);
            await updateDoc(doc(db, 'users', currentUser.id), updates);
            savedSnapshotRef.current = { ...updates };
            toast({ title: "Profile Registry Updated", description: "Your contact and billing parameters have been committed." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    if (!mounted) return <div className="p-8 text-center text-[10px] uppercase tracking-widest text-text-muted">Loading...</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 text-left">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        Client Identity
                    </p>
                    <h1 className="page-title text-left">Personal Profile</h1>
                    <p className="page-subtitle text-left">Official portal credentials and organizational context.</p>
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
                    <Button onClick={handleSave} disabled={isSaving} className="h-10 px-6 font-bold uppercase tracking-widest text-[10px]">
                        {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                        Commit Changes
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
                {/* LEFT: Identity Card */}
                <div className="space-y-6 text-left">
                    <Card className="bg-bg-secondary border-border-main text-center">
                        <CardContent className="pt-8 pb-8 space-y-4">
                            <div className="flex justify-center">
                                <div className="relative">
                                    <Avatar className="h-24 w-24 border-2 border-border-sub">
                                        <AvatarImage asChild src={avatarUrl}>
                                            <Image src={avatarUrl || "https://picsum.photos/seed/client/96/96"} alt="Avatar" width={96} height={96} data-ai-hint="person face" />
                                        </AvatarImage>
                                        <AvatarFallback className="text-2xl font-bold">{userFallback}</AvatarFallback>
                                    </Avatar>
                                    {isUploading && (
                                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                                            <Loader2 size={20} className="animate-spin text-white" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="absolute bottom-0 right-0 p-1.5 rounded-full bg-bg-elevated border border-border-sub text-text-muted hover:text-text-primary transition-colors"
                                    >
                                        <Camera size={12} />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        className="hidden"
                                        onChange={handleAvatarChange}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1 text-center">
                                <h2 className="text-xl font-bold text-text-primary uppercase tracking-wide text-center">{currentUser?.name || '—'}</h2>
                                <p className="text-xs text-brand-red font-bold uppercase tracking-widest text-center">{currentUser?.role || 'Client'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-tertiary/30 border-border-sub text-left">
                        <CardHeader className="pb-3 text-left">
                            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2 text-left">
                                <ShieldCheck size={14} className="text-text-green"/> Authorization Level
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded bg-bg-primary border border-border-sub space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase text-left">Portal Access</p>
                                <p className="text-xs font-bold text-text-primary uppercase tracking-tight text-left">Full Strategic Visibility</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="text-left">
                        <CardHeader className="text-left">
                            <CardTitle>Security Registry</CardTitle>
                            <CardDescription>Manage credentials and portal access keys.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full h-10 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsPasswordDialogOpen(true)}>
                                <Key size={14} className="mr-2"/> Change Access Key
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Detailed Information Tabs */}
                <div className="lg:col-span-2 text-left">
                    <Tabs defaultValue="identity" className="w-full text-left">
                        <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-6 text-left">
                            <TabsTrigger value="identity" className="tab-trigger-plans">Profile Details</TabsTrigger>
                            <TabsTrigger value="billing" className="tab-trigger-plans">Billing Protocols</TabsTrigger>
                        </TabsList>

                        <TabsContent value="identity" className="m-0 space-y-6 text-left">
                            <Card>
                                <CardHeader className="text-left">
                                    <CardTitle>Personal Contact</CardTitle>
                                    <CardDescription>Direct lines of communication for portal notifications.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Verified Email</Label>
                                            <Input value={currentUser?.email || ''} readOnly className="bg-bg-primary h-11 text-xs opacity-60 cursor-not-allowed" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Direct Line</Label>
                                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-bg-primary h-11 text-xs" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="text-left">
                                    <CardTitle>Organizational Context</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center gap-6 p-6 rounded-lg bg-bg-secondary/50 border border-border-sub text-left">
                                        <div className="p-4 bg-bg-tertiary rounded-lg border border-border-sub text-brand-red">
                                            <Building2 size={32} />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Affiliated Organization</p>
                                            <h3 className="text-xl font-bold text-text-primary uppercase tracking-wide text-left">{currentUser?.clientCompany || 'Independent'}</h3>
                                            <p className="text-xs text-accent-gold font-black uppercase tracking-widest text-left">{currentUser?.businessType || 'Service Partner'}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="billing" className="m-0 space-y-6 text-left">
                            <Card>
                                <CardHeader className="text-left">
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
                                                value={billingContactName}
                                                onChange={(e) => setBillingContactName(e.target.value)}
                                                className="bg-bg-primary h-11 text-xs uppercase font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Billing Email Address</Label>
                                            <div className="relative">
                                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input
                                                    placeholder="ap@organization.com"
                                                    value={billingEmail}
                                                    onChange={(e) => setBillingEmail(e.target.value)}
                                                    className="bg-bg-primary pl-9 h-11 text-xs"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Payment Terms</Label>
                                            <Select value={billingTerms} onValueChange={setBillingTerms}>
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
                                            <Select value={billingDelivery} onValueChange={setBillingDelivery}>
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
                                <CardHeader className="text-left">
                                    <CardTitle>Payment Protocol</CardTitle>
                                    <CardDescription>Manage active methods for invoice settlement.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-green">
                                                <CreditCard size={18} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">Visa ending in 4242</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest text-left">Expires 12/2026</p>
                                            </div>
                                        </div>
                                        <Badge variant="active" className="text-[8px] h-5">Primary</Badge>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full h-11 uppercase font-bold text-[10px] tracking-widest"
                                        onClick={() => router.push('/client/billing')}
                                    >
                                        Manage Methods in Billing Terminal
                                        <ChevronRight size={14} className="ml-2" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <ChangePasswordDialog
                isOpen={isPasswordDialogOpen}
                setIsOpen={setIsPasswordDialogOpen}
            />
        </div>
    );
}
