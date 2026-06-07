'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import type { Technician, TimeOffRequest, ReliabilityEvent } from '@/lib/types';
import { penaltyEvents, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Gauge, ShieldAlert, MapPin, Mail, Phone, Calendar as CalendarIcon, Plus, User, Activity, Timer, Settings2, Sliders, Search, Banknote, History, CheckCircle2, Lock, Key } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { subDays, isAfter, format, parseISO } from 'date-fns';
import { getReliabilityTier, getTierBadgeVariant, getTierColor } from '@/lib/reliability';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearchParams } from 'next/navigation';
import { ChangePasswordDialog } from "@/components/change-password-dialog";

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

    useEffect(() => {
        setMounted(true);
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            if (!fbUser) return;
            setCurrentTechId(fbUser.uid);
            setMyTimeOff(initialTimeOffRequests.filter(r => r.techId === fbUser.uid));
            const unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) setTech({ ...snap.data(), id: snap.id } as Technician);
            });
            return () => unsubUser();
        });
        return () => unsubAuth();
    }, []);}
    // ... rest of the file is unchanged from what you pasted