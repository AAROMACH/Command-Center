'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import type { Technician, TimeOffRequest, ReliabilityEvent } from '@/lib/types';
import { penaltyEvents, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, setDoc, getDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { uploadAvatar } from '@/lib/upload';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Gauge, ShieldAlert, MapPin, Mail, Phone, Calendar as CalendarIcon, Plus, X, User, Activity, Search, CheckCircle2, Key, Loader2, Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO } from 'date-fns';
import { getReliabilityTier, getTierBadgeVariant, getTierColor } from '@/lib/reliability';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearchParams } from 'next/navigation';
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { auditFieldChange } from '@/lib/audit';

export default function TechProfilePage() {
    const searchParams = useSearchParams();
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | undefined>(undefined);
    const [myTimeOff, setMyTimeOff] = useState<TimeOffRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'identity');
    const { toast } = useToast();
    const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Controlled form state
    const [name, setName] = useState('');
    const [preferredName, setPreferredName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState('');
    const [address, setAddress] = useState('');
    const [ecName, setEcName] = useState('');
    const [ecRelation, setEcRelation] = useState('');
    const [ecPhone, setEcPhone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const savedSnapshotRef = useRef<Record<string, unknown>>({});
    const [predefinedSkills, setPredefinedSkills] = useState<string[]>([]);
    const [selectedSkill, setSelectedSkill] = useState('');

    const [timeOffForm, setTimeOffForm] = useState({
        type: 'Vacation' as TimeOffRequest['type'],
        startDate: '',
        endDate: '',
        reason: '',
    });

    const DEFAULT_SKILLS = [
        'Low Voltage Cabling', 'Fiber Optic', 'Coax Installation', 'Network Rack Assembly',
        'IP Camera Installation', 'Access Control', 'Audio/Visual', 'Structured Cabling',
        'Data Center', 'Wireless Networks', 'CCTV', 'VoIP Systems', 'Fire Alarm', 'Security Systems',
        'Cat5e/Cat6 Termination', 'Conduit Installation', 'Cable Tray', 'Splicing',
    ];

    useEffect(() => {
        setMounted(true);
        // Load predefined skills from adminConfig
        getDoc(doc(db, 'adminConfig', 'skills')).then(snap => {
            if (snap.exists() && snap.data().predefinedSkills) {
                setPredefinedSkills(snap.data().predefinedSkills as string[]);
            } else {
                setPredefinedSkills(DEFAULT_SKILLS);
            }
        }).catch(() => setPredefinedSkills(DEFAULT_SKILLS));

        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            if (!fbUser) return;
            setCurrentTechId(fbUser.uid);
            setMyTimeOff(initialTimeOffRequests.filter(r => r.techId === fbUser.uid));
            const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setTech({ ...data, id: snap.id } as Technician);
                    setName(data.name || '');
                    setPreferredName(data.preferredName || '');
                    setEmail(data.email || '');
                    setPhone(data.phone || '');
                    setLocation(data.currentLocation || '');
                    setAddress(data.address || '');
                    setAvatarUrl(data.avatarUrl);
                    setEcName(data.emergencyContact?.name || '');
                    setEcRelation(data.emergencyContact?.relation || '');
                    setEcPhone(data.emergencyContact?.phone || '');
                    savedSnapshotRef.current = {
                        name: data.name || '', preferredName: data.preferredName || '',
                        email: data.email || '',
                        phone: data.phone || '', currentLocation: data.currentLocation || '',
                        address: data.address || '',
                        emergencyContact: data.emergencyContact || null,
                    };
                }
            });
            return () => unsubUser();
        });
        return () => unsubAuth();
    }, []);

    const myReliabilityEvents = useMemo<ReliabilityEvent[]>(() => {
        if (!currentTechId) return [];
        return penaltyEvents.filter(e => e.techId === currentTechId);
    }, [currentTechId]);

    const reliabilityScore = tech?.reliabilityScore ?? 100;
    const reliabilityTier = getReliabilityTier(reliabilityScore);

    const userFallback = useMemo(() => {
        if (!tech) return 'FT';
        return tech.name.split(' ').map((n: string) => n[0]).join('');
    }, [tech]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentTechId) return;
        setIsUploading(true);
        try {
            const url = await uploadAvatar(currentTechId, file);
            setAvatarUrl(url);
            toast({ title: 'Avatar Updated', description: 'Your profile photo has been uploaded.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleAddSkill = async (skill: string) => {
        if (!currentTechId || !skill || (tech?.skills || []).includes(skill)) return;
        const updated = [...(tech?.skills || []), skill];
        await updateDoc(doc(db, 'users', currentTechId), { skills: updated });
        setSelectedSkill('');
    };

    const handleRemoveSkill = async (skill: string) => {
        if (!currentTechId) return;
        const updated = (tech?.skills || []).filter(s => s !== skill);
        await updateDoc(doc(db, 'users', currentTechId), { skills: updated });
    };

    const handleSave = async () => {
        if (!currentTechId) return;
        setIsSaving(true);
        try {
            const updates: Record<string, any> = { name, preferredName, email, phone, currentLocation: location, address };
            if (ecName.trim() || ecRelation.trim() || ecPhone.trim()) {
                updates.emergencyContact = { name: ecName, relation: ecRelation, phone: ecPhone };
            }
            await auditFieldChange('users', currentTechId, currentTechId, name || currentTechId, savedSnapshotRef.current, updates);
            await updateDoc(doc(db, 'users', currentTechId), updates);
            savedSnapshotRef.current = { ...updates };
            toast({ title: 'Profile Saved', description: 'Your information has been updated.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTimeOffSubmit = async () => {
        if (!timeOffForm.startDate || !timeOffForm.endDate || !timeOffForm.reason) {
            toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill in all required fields.' });
            return;
        }
        const id = await createDocId(ID_PREFIXES.TIME_OFF_REQUEST);
        const newRequest: TimeOffRequest = {
            id,
            techId: currentTechId!,
            type: timeOffForm.type,
            startDate: timeOffForm.startDate,
            endDate: timeOffForm.endDate,
            reason: timeOffForm.reason,
            status: 'pending',
        };
        await setDoc(doc(db, 'timeOffRequests', id), { ...newRequest });
        setMyTimeOff(prev => [newRequest, ...prev]);
        toast({ title: 'Request Submitted', description: 'Your time-off request is pending review.' });
        setIsTimeOffDialogOpen(false);
        setTimeOffForm({ type: 'Vacation', startDate: '', endDate: '', reason: '' });
    };

    if (!mounted) return <div className="p-8 text-center text-[10px] uppercase tracking-widest text-text-muted">Loading...</div>;

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        Field Terminal
                    </p>
                    <h1 className="page-title">My Profile</h1>
                    <p className="page-subtitle">Manage your identity, reliability record, and time-off requests.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input
                            className="search-input !w-full md:!w-[220px]"
                            placeholder="Find setting..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEFT: Identity card */}
                <div className="space-y-6">
                    <Card className="bg-bg-secondary border-border-main text-center">
                        <CardContent className="pt-8 pb-8 space-y-4">
                            <div className="flex justify-center relative">
                                <Avatar className="h-24 w-24 border-2 border-border-sub">
                                    <AvatarImage asChild src={avatarUrl}>
                                        <Image src={avatarUrl || "https://picsum.photos/seed/tech/96/96"} alt="Avatar" width={96} height={96} data-ai-hint="person face" />
                                    </AvatarImage>
                                    <AvatarFallback className="text-2xl font-bold">{userFallback}</AvatarFallback>
                                </Avatar>
                                {isUploading && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                                        <Loader2 size={20} className="animate-spin text-white" />
                                    </div>
                                )}
                                <button
                                    className="absolute bottom-0 right-1/3 translate-x-1/2 p-1.5 rounded-full bg-bg-primary border border-border-sub hover:bg-bg-tertiary transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                >
                                    <Camera size={12} className="text-text-muted" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </div>
                            <div className="space-y-1 text-center">
                                <h2 className="text-xl font-bold text-text-primary uppercase tracking-wide">{tech?.name || '—'}</h2>
                                <p className="text-xs text-brand-red font-bold uppercase tracking-widest">{tech?.role || 'Field Technician'}</p>
                            </div>
                            <div className="flex justify-center">
                                <Badge variant={getTierBadgeVariant(reliabilityTier)} className="uppercase text-[9px] tracking-widest">
                                    {reliabilityTier}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Gauge size={14} className={getTierColor(reliabilityTier)} />
                                Reliability Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-end gap-2">
                                <span className={cn("text-4xl font-black", getTierColor(reliabilityTier))}>{reliabilityScore}</span>
                                <span className="text-text-muted text-sm mb-1">/100</span>
                            </div>
                            <div className="w-full bg-bg-tertiary rounded-full h-2">
                                <div
                                    className={cn("h-2 rounded-full transition-all", reliabilityScore >= 80 ? "bg-text-green" : reliabilityScore >= 60 ? "bg-accent-gold" : "bg-brand-red")}
                                    style={{ width: `${reliabilityScore}%` }}
                                />
                            </div>
                            <p className="text-[9px] uppercase tracking-widest text-text-muted">30-day rolling score</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Security</CardTitle>
                            <CardDescription>Manage your access credentials.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full h-10 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsPasswordDialogOpen(true)}>
                                <Key size={14} className="mr-2" /> Change Password
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Tabs */}
                <div className="lg:col-span-2">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-6">
                            <TabsTrigger value="identity" className="tab-trigger-plans">Identity</TabsTrigger>
                            <TabsTrigger value="reliability" className="tab-trigger-plans">Reliability</TabsTrigger>
                            <TabsTrigger value="timeoff" className="tab-trigger-plans">Time Off</TabsTrigger>
                            <TabsTrigger value="integrations" className="tab-trigger-plans">Integrations</TabsTrigger>
                        </TabsList>

                        {/* IDENTITY TAB */}
                        <TabsContent value="identity" className="m-0 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Personal Information</CardTitle>
                                    <CardDescription>Your contact details on file.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1"><User size={10} /> Full Name</Label>
                                            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-xs" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1"><User size={10} /> Preferred Name</Label>
                                            <Input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} className="h-11 text-xs" placeholder="Goes by..." />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1"><Mail size={10} /> Email</Label>
                                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-xs" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1"><Phone size={10} /> Phone</Label>
                                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 text-xs" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1"><MapPin size={10} /> Working Location</Label>
                                            <Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 text-xs" placeholder="e.g. Detroit, MI" />
                                            <p className="text-[9px] text-text-muted">Your city/region for job dispatching</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Mailing Address</Label>
                                            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-11 text-xs" placeholder="Full street address" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-2">
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                                            Save Changes
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Emergency Contact</CardTitle>
                                    <CardDescription>Provided in case of on-site emergency.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Name</Label>
                                            <Input value={ecName} onChange={(e) => setEcName(e.target.value)} className="h-11 text-xs" placeholder="Contact name" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Relation</Label>
                                            <Input value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} className="h-11 text-xs" placeholder="e.g. Spouse" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-bold text-text-muted">Phone</Label>
                                            <Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} className="h-11 text-xs" placeholder="+1 (555) 000-0000" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Skills</CardTitle>
                                    <CardDescription>Certified capabilities on record. Add or remove skills below.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex flex-wrap gap-2 min-h-[2rem]">
                                        {(tech?.skills || []).map(skill => (
                                            <Badge key={skill} variant="outline" className="text-[10px] uppercase tracking-widest flex items-center gap-1.5 pr-1.5">
                                                {skill}
                                                <button
                                                    onClick={() => handleRemoveSkill(skill)}
                                                    className="rounded-full hover:bg-brand-red/20 hover:text-brand-red transition-colors p-0.5"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </Badge>
                                        ))}
                                        {(!tech?.skills || tech.skills.length === 0) && (
                                            <p className="text-xs text-text-muted">No skills on record.</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Select value={selectedSkill} onValueChange={setSelectedSkill}>
                                            <SelectTrigger className="h-9 text-[10px] uppercase font-bold tracking-widest flex-1">
                                                <SelectValue placeholder="Add a skill..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {predefinedSkills
                                                    .filter(s => !(tech?.skills || []).includes(s))
                                                    .map(s => (
                                                        <SelectItem key={s} value={s} className="text-[10px] uppercase font-bold">{s}</SelectItem>
                                                    ))
                                                }
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest"
                                            onClick={() => handleAddSkill(selectedSkill)}
                                            disabled={!selectedSkill}
                                        >
                                            <Plus size={14} className="mr-1" /> Add
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* RELIABILITY TAB */}
                        <TabsContent value="reliability" className="m-0 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Activity size={16} className="text-brand-red" />
                                        Reliability Event Log
                                    </CardTitle>
                                    <CardDescription>Recent events affecting your operational score.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {myReliabilityEvents.length === 0 ? (
                                        <div className="py-12 text-center space-y-2">
                                            <CheckCircle2 size={32} className="mx-auto text-text-green opacity-50" />
                                            <p className="text-xs text-text-muted uppercase tracking-widest">No reliability events on record.</p>
                                        </div>
                                    ) : (
                                        <ScrollArea className="h-[400px]">
                                            <div className="space-y-3 pr-4">
                                                {myReliabilityEvents.map(event => (
                                                    <div key={event.id} className="flex items-start gap-4 p-4 rounded-lg bg-bg-secondary border border-border-sub">
                                                        <div className={cn("p-2 rounded border", event.scoreChange >= 0 ? "bg-text-green/10 border-text-green/30 text-text-green" : "bg-brand-red/10 border-brand-red/30 text-brand-red")}>
                                                            <ShieldAlert size={14} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{event.eventType.replace(/_/g, ' ')}</p>
                                                                <span className={cn("text-sm font-black shrink-0", event.scoreChange >= 0 ? "text-text-green" : "text-brand-red")}>
                                                                    {event.scoreChange > 0 ? '+' : ''}{event.scoreChange}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-text-muted mt-1">{event.reason}</p>
                                                            <p className="text-[9px] text-text-muted uppercase tracking-widest mt-2">
                                                                {format(parseISO(event.createdAt), 'MMM d, yyyy')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TIME OFF TAB */}
                        <TabsContent value="timeoff" className="m-0 space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary">Time-Off Requests</h3>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">Submit and track your leave requests.</p>
                                </div>
                                <Button
                                    className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest"
                                    onClick={() => setIsTimeOffDialogOpen(true)}
                                >
                                    <Plus size={14} className="mr-2" /> New Request
                                </Button>
                            </div>

                            {myTimeOff.length === 0 ? (
                                <Card>
                                    <CardContent className="py-16 text-center space-y-2">
                                        <CalendarIcon size={32} className="mx-auto text-text-muted opacity-40" />
                                        <p className="text-xs text-text-muted uppercase tracking-widest">No time-off requests on file.</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-3">
                                    {myTimeOff.map(req => (
                                        <Card key={req.id} className="bg-bg-secondary border-border-sub">
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                                            <CalendarIcon size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{req.type}</p>
                                                            <p className="text-[10px] text-text-muted mt-0.5">
                                                                {format(parseISO(req.startDate), 'MMM d')} — {format(parseISO(req.endDate), 'MMM d, yyyy')}
                                                            </p>
                                                            {req.reason && <p className="text-[10px] text-text-muted mt-0.5 italic">{req.reason}</p>}
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        variant={req.status === 'approved' ? 'active' : req.status === 'denied' ? 'high' : req.status === 'cancelled' ? 'outline' : 'onhold'}
                                                        className="text-[9px] uppercase tracking-widest shrink-0"
                                                    >
                                                        {req.status}
                                                    </Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="integrations" className="m-0 space-y-6">
                            <div className="rounded-xl border border-border-sub bg-bg-secondary p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-500/10 rounded-lg">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-blue-400" fill="currentColor">
                                            <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064 5.963 5.963 0 014.123 1.632l2.883-2.88C17.545 2.901 15.035 2 12.545 2 7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest text-text-primary">Google Calendar Sync</p>
                                        <p className="text-[10px] text-text-muted mt-0.5">Sync your schedule, PTO, and job assignments with Google Calendar.</p>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-dashed border-blue-400/30 bg-blue-400/5 p-4 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Coming Soon</p>
                                    <p className="text-[10px] text-text-muted leading-relaxed">
                                        Google Calendar integration is in development. Once enabled, your assigned jobs, scheduled PTO, and calendar events will sync automatically.
                                    </p>
                                </div>
                                <div className="space-y-2 text-[10px] text-text-muted">
                                    <p className="font-bold uppercase tracking-wider text-text-secondary">What will sync:</p>
                                    <ul className="space-y-1 pl-3">
                                        <li>· Assigned work orders (title, date, time, location)</li>
                                        <li>· Approved PTO / time-off blocks</li>
                                        <li>· Project milestones and deadlines</li>
                                        <li>· Follow-up reminders</li>
                                    </ul>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Time Off Dialog */}
            <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                <DialogContent className="sm:max-w-[440px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest text-sm font-bold flex items-center gap-2">
                            <CalendarIcon size={16} className="text-brand-red" /> New Time-Off Request
                        </DialogTitle>
                        <DialogDescription className="text-xs">Submit a leave request for admin review.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Type</Label>
                            <Select value={timeOffForm.type} onValueChange={(v) => setTimeOffForm(p => ({ ...p, type: v as TimeOffRequest['type'] }))}>
                                <SelectTrigger className="h-11 text-xs font-bold uppercase">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vacation">Vacation</SelectItem>
                                    <SelectItem value="Sick">Sick</SelectItem>
                                    <SelectItem value="Personal">Personal</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Start Date</Label>
                                <Input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm(p => ({ ...p, startDate: e.target.value }))} className="h-11 text-xs" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">End Date</Label>
                                <Input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm(p => ({ ...p, endDate: e.target.value }))} className="h-11 text-xs" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Reason</Label>
                            <Textarea
                                placeholder="Brief explanation..."
                                value={timeOffForm.reason}
                                onChange={(e) => setTimeOffForm(p => ({ ...p, reason: e.target.value }))}
                                className="h-20 text-xs resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTimeOffDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleTimeOffSubmit}>Submit Request</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ChangePasswordDialog isOpen={isPasswordDialogOpen} setIsOpen={setIsPasswordDialogOpen} />
        </div>
    );
}
