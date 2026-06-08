'use client';

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
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Search, Loader2, Camera } from "lucide-react";
import Image from "next/image";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

    const [emailNotif, setEmailNotif] = useState(true);
    const [pushNotif, setPushNotif] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            if (!fbUser) return;
            const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setCurrentUser({ ...data, id: snap.id });
                    setName(data.name || '');
                    setEmail(data.email || '');
                    setAvatarUrl(data.avatarUrl);
                    setEmailNotif(data.notificationPreferences?.email ?? true);
                    setPushNotif(data.notificationPreferences?.push ?? false);
                }
            });
            return () => unsubUser();
        });
        return () => unsubAuth();
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
            await updateDoc(doc(db, 'users', currentUser.id), { name, email });
            toast({ title: "Profile Saved", description: "Your personal information has been updated." });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleNotifChange = async (key: 'email' | 'push', value: boolean) => {
        if (key === 'email') setEmailNotif(value);
        else setPushNotif(value);
        if (!currentUser?.id) return;
        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                [`notificationPreferences.${key}`]: value,
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: err.message });
        }
    };

    if (!mounted) return <div className="p-8 text-center text-[10px] uppercase tracking-widest text-text-muted">Loading...</div>;

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        User Account
                    </p>
                    <h1 className="page-title">Profile & Settings</h1>
                    <p className="page-subtitle">Manage your personal information, notification preferences, and security settings.</p>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6 text-left">
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal Information</CardTitle>
                            <CardDescription>Update your photo and personal details here.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center gap-6">
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
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                <div className="space-y-6 text-left">
                    <Card>
                        <CardHeader>
                            <CardTitle>Security</CardTitle>
                            <CardDescription>Manage your password and two-factor authentication.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full" onClick={() => setIsPasswordDialogOpen(true)}>Change Password</Button>
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

                    <Card>
                        <CardHeader>
                            <CardTitle>Notifications</CardTitle>
                            <CardDescription>Choose how you want to be notified.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                                    <span>Email Notifications</span>
                                    <span className="font-normal leading-snug text-text-muted">
                                        Receive updates and alerts via email.
                                    </span>
                                </Label>
                                <Switch
                                    id="email-notifications"
                                    checked={emailNotif}
                                    onCheckedChange={(v) => handleNotifChange('email', v)}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
                                    <span>Push Notifications</span>
                                    <span className="font-normal leading-snug text-text-muted">
                                        Get notified on your mobile device.
                                    </span>
                                </Label>
                                <Switch
                                    id="push-notifications"
                                    checked={pushNotif}
                                    onCheckedChange={(v) => handleNotifChange('push', v)}
                                />
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
