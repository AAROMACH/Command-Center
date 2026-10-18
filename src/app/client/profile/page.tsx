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
import { PageHeader } from '@/components/page-header';
import { PageLoading } from '@/components/empty-state';

export default function ClientProfilePage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [name, setName] = useState("");
    const [preferredName, setPreferredName] = useState("");
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
                    setName(data.name || '');
                    setPreferredName(data.preferredName || '');
                    setPhone(data.phone || '');
                    setAvatarUrl(data.avatarUrl);
                    setBillingContactName(data.billingDetails?.contactName || '');
                    setBillingEmail(data.billingDetails?.email || '');
                    setBillingTerms(data.billingDetails?.terms || '');
                    setBillingDelivery(data.billingDetails?.deliveryMethod || 'Portal');
                    savedSnapshotRef.current = {
                        name: data.name || '',
                        preferredName: data.preferredName || '',
                        phone: data.phone || '',
                        'billingDetails.contactName': data.billingDetails?.contactName || '',
                        'billingDetails.email': data.billingDetails?.email || '',
                        'billingDetails.deliveryMethod': data.billingDetails?.deliveryMethod || 'Portal',
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
            toast({ title: "Photo updated", description: "Your profile photo has been uploaded." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!currentUser?.id) return;
        setIsSaving(true);
        try {
            // Dotted paths: payment terms are set by Aaromach (the rules reject
            // a client changing them), so this save never touches them.
            const updates = {
                name,
                preferredName,
                phone,
                'billingDetails.contactName': billingContactName,
                'billingDetails.email': billingEmail,
                'billingDetails.deliveryMethod': billingDelivery,
            };
            await auditFieldChange('users', currentUser.id, currentUser.id, currentUser.name || currentUser.id, savedSnapshotRef.current, updates);
            await updateDoc(doc(db, 'users', currentUser.id), updates);
            savedSnapshotRef.current = { ...updates };
            toast({ title: "Profile saved", description: "Your contact and billing details are saved." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    if (!mounted) return <PageLoading label="Loading profile…" />;

    return (
        <div className="max-w-5xl mx-auto space-y-6 text-left">
            <PageHeader
                eyebrow="Client portal"
                icon={User}
                title="Profile"
                subtitle="Your contact details, company and billing preferences."
                actions={
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                        Save changes
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
                {/* LEFT: Identity Card */}
                <div className="space-y-6 text-left">
                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm text-center">
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
                                <h2 className="text-xl font-semibold text-text-primary text-center">{currentUser?.name || '—'}</h2>
                                <p className="text-[13px] text-text-muted capitalize text-center">{currentUser?.role || 'Client'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm text-left">
                        <CardHeader className="pb-3 text-left">
                            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-2 text-left">
                                <ShieldCheck size={14} className="text-text-green"/> Portal access
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-[13px] text-text-primary">Full access to your company&apos;s jobs, requests and invoices.</p>
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm text-left">
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Security</CardTitle>
                            <CardDescription>Change the password you use to sign in.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full" onClick={() => setIsPasswordDialogOpen(true)}>
                                <Key size={14} className="mr-2"/> Change password
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Detailed Information Tabs */}
                <div className="lg:col-span-2 text-left">
                    <Tabs defaultValue="identity" className="w-full text-left">
                        <TabsList className="tabs mb-6">
                            <TabsTrigger value="identity" className="tab">Contact details</TabsTrigger>
                            <TabsTrigger value="billing" className="tab">Billing</TabsTrigger>
                        </TabsList>

                        <TabsContent value="identity" className="m-0 space-y-6 text-left">
                            <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                                <CardHeader className="text-left">
                                    <CardTitle className="text-base font-semibold">Contact</CardTitle>
                                    <CardDescription>How we reach you about jobs and requests.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Full name</Label>
                                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="bg-bg-primary" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Preferred name</Label>
                                            <Input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="Goes by…" className="bg-bg-primary" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Email</Label>
                                            <Input value={currentUser?.email || ''} readOnly className="bg-bg-primary opacity-60 cursor-not-allowed" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Phone</Label>
                                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-bg-primary" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                                <CardHeader className="text-left">
                                    <CardTitle className="text-base font-semibold">Company</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center gap-6 p-6 rounded-lg bg-bg-secondary/50 border border-border-sub text-left">
                                        <div className="p-4 bg-bg-tertiary rounded-lg border border-border-sub text-text-muted">
                                            <Building2 size={32} />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Company</p>
                                            <h3 className="text-lg font-semibold text-text-primary text-left">{currentUser?.clientCompany || 'Independent'}</h3>
                                            <p className="text-[13px] text-text-muted text-left">{currentUser?.businessType || 'Client'}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="billing" className="m-0 space-y-6 text-left">
                            <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                                <CardHeader className="text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Banknote size={16} className="text-text-muted" />
                                        <CardTitle className="text-base font-semibold">Billing details</CardTitle>
                                    </div>
                                    <CardDescription>Who receives invoices and how they are delivered.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Billing contact name</Label>
                                            <Input
                                                placeholder="Accounts payable contact"
                                                value={billingContactName}
                                                onChange={(e) => setBillingContactName(e.target.value)}
                                                className="bg-bg-primary"
                                            />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Billing email</Label>
                                            <div className="relative">
                                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input
                                                    placeholder="ap@company.com"
                                                    value={billingEmail}
                                                    onChange={(e) => setBillingEmail(e.target.value)}
                                                    className="bg-bg-primary pl-9"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Payment terms</Label>
                                            <Input value={billingTerms || 'Not set'} readOnly disabled className="bg-bg-primary" />
                                            <p className="text-[11px] text-text-muted">Set by Aaromach. Contact us to change your terms.</p>
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[12px] font-medium text-text-secondary">Invoice delivery</Label>
                                            <Select value={billingDelivery} onValueChange={setBillingDelivery}>
                                                <SelectTrigger className="bg-bg-primary">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Email">Email only</SelectItem>
                                                    <SelectItem value="Portal">Portal only</SelectItem>
                                                    <SelectItem value="Both">Email and portal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                                <CardHeader className="text-left">
                                    <CardTitle className="text-base font-semibold">Payment method</CardTitle>
                                    <CardDescription>How you pay your invoices.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-green">
                                                <CreditCard size={18} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[13px] font-semibold text-text-primary text-left">Visa ending in 4242</p>
                                                <p className="text-[12px] text-text-muted text-left">Expires 12/2026</p>
                                            </div>
                                        </div>
                                        <Badge variant="active" className="text-[10px] h-5">Primary</Badge>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => router.push('/client/billing')}
                                    >
                                        Go to billing
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
