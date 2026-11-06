'use client';
import { PageHeader } from '@/components/page-header';
import { PageLoading } from '@/components/empty-state';

import { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { uploadAvatar } from '@/lib/upload';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Loader2, Camera, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SettingsTabs } from "@/components/settings-tabs";
import Image from "next/image";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);


    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        // The user listener is kept here so it closes on unmount / user change
        // (returning it from the auth callback never unsubscribed it).
        let unsubUser: (() => void) | undefined;
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            unsubUser?.();
            unsubUser = undefined;
            if (!fbUser) return;
            unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setCurrentUser({ ...data, id: snap.id });
                    setName(data.name || '');
                    setEmail(data.email || '');
                    setAvatarUrl(data.avatarUrl);
                }
            });
        });
        return () => { unsubAuth(); unsubUser?.(); };
    }, []);

    const userFallback = useMemo(() => {
        if (!currentUser) return 'SA';
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
            await updateDoc(doc(db, 'users', currentUser.id), { name });
            toast({ title: "Profile Saved", description: "Your personal information has been updated." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };


    if (!mounted) return <PageLoading label="Loading profile…" />;

    return (
        <div className="space-y-5 max-w-4xl mx-auto pb-24 text-left">
            <PageHeader
                eyebrow="Account"
                icon={User}
                title="Profile"
                subtitle="Your details and sign-in security."
            />

            <SettingsTabs tabs={[
                { id: 'personal', label: 'Personal', icon: User, content: (<>
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal information</CardTitle>
                            <CardDescription>Update your photo and personal details here.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                                <div className="relative">
                                    <Avatar className="h-20 w-20">
                                        <AvatarImage asChild src={avatarUrl} alt="User Avatar">
                                            <Image src={avatarUrl || "https://picsum.photos/seed/user1/80/80"} alt="User Avatar" width={80} height={80} data-ai-hint="person face" />
                                        </AvatarImage>
                                        <AvatarFallback>{userFallback}</AvatarFallback>
                                    </Avatar>
                                    {isUploading && (
                                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                                            <Loader2 size={20} className="animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        disabled={isUploading}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Camera size={14} className="mr-2" />
                                        {isUploading ? 'Uploading...' : 'Change Avatar'}
                                    </Button>
                                    <p className="text-xs text-text-muted">JPG, GIF, PNG or WebP. 5 MB max.</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        className="hidden"
                                        onChange={handleAvatarChange}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full name</Label>
                                    <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email address</Label>
                                    <Input id="email" type="email" value={email} readOnly disabled />
                                    <p className="text-[10px] text-text-muted">Contact email is managed in the Directory. It isn&apos;t your sign-in email.</p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-4 sm:px-6 py-4">
                            <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                                {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </CardFooter>
                    </Card>
                </>) },
                { id: 'security', label: 'Security', icon: ShieldCheck, content: (<>
                    <Card>
                        <CardHeader>
                            <CardTitle>Security</CardTitle>
                            <CardDescription>Manage your password and two-factor authentication.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full" onClick={() => setIsPasswordDialogOpen(true)}>Change password</Button>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="block w-full">
                                            <Button variant="outline" className="w-full" disabled>Enable Two-Factor Authentication</Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Two-factor authentication setup coming soon.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </CardContent>
                    </Card>
                    <p className="text-[12px] text-text-muted px-1">
                        Notification choices (email, text, phone) are in <Link href="/admin/settings?tab=notifications" className="text-brand-red hover:underline">Settings → Notifications</Link>.
                    </p>
                </>) },
            ]} />

            <ChangePasswordDialog
                isOpen={isPasswordDialogOpen}
                setIsOpen={setIsPasswordDialogOpen}
            />
        </div>
    );
}
