'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User, Search } from "lucide-react";
import Image from "next/image";
import { ChangePasswordDialog } from "@/components/change-password-dialog";

export default function ProfilePage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            if (!fbUser) return;
            const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id });
            });
            return () => unsubUser();
        });
        return () => unsubAuth();
    }, []);

    const userFallback = useMemo(() => {
        if (!currentUser) return 'SA';
        return currentUser.name.split(' ').map((n: string) => n[0]).join('');
    }, [currentUser]);

    if (!mounted) return null;

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
                                <Avatar className="h-20 w-20">
                                    <AvatarImage asChild src={currentUser?.avatarUrl} alt="User Avatar">
                                       <Image src={currentUser?.avatarUrl || "https://picsum.photos/seed/user1/80/80"} alt="User Avatar" width={80} height={80} data-ai-hint="person face" />
                                    </AvatarImage>
                                    <AvatarFallback>{userFallback}</AvatarFallback>
                                </Avatar>
                                <div className="space-y-2">
                                    <Button variant="outline">Change Avatar</Button>
                                    <p className="text-xs text-text-muted">JPG, GIF or PNG. 1MB max.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input id="fullName" defaultValue={currentUser?.name || "System Administrator"} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input id="email" type="email" defaultValue={currentUser?.email || "admin@aaromach.com"} />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button>Save Changes</Button>
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
                            <Button variant="outline" className="w-full">Enable Two-Factor Authentication</Button>
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
                                <Switch id="email-notifications" defaultChecked />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
                                    <span>Push Notifications</span>
                                    <span className="font-normal leading-snug text-text-muted">
                                        Get notified on your mobile device.
                                    </span>
                                </Label>
                                <Switch id="push-notifications" />
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
    )
}