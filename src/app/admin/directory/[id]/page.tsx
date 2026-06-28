'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, Phone, MapPin, Briefcase, Clock, CheckCircle, AlertTriangle, DollarSign, Calendar, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierBadgeVariant } from '@/lib/reliability';
import { format, parseISO } from 'date-fns';
import type { Technician, WorkOrder, WeeklyLog } from '@/lib/types';

export default function DirectoryPersonPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [person, setPerson] = useState<Technician | null>(null);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        getDoc(doc(db, 'users', id)).then(snap => {
            if (snap.exists()) setPerson({ ...snap.data(), id: snap.id } as Technician);
            setLoading(false);
        });

        const unsubA = onSnapshot(collection(db, 'assignments'), snap => {
            const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
            setAssignments(all.filter(wo => wo.assignedTechnicianId === id || wo.techId === id));
        });
        const unsubL = onSnapshot(collection(db, 'weeklyLogs'), snap => {
            const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog));
            setWeeklyLogs(all.filter(l => l.techId === id).sort((a, b) => b.weekOf?.localeCompare(a.weekOf || '') || 0));
        });
        return () => { unsubA(); unsubL(); };
    }, [id]);

    const activeJobs = assignments.filter(wo => wo.status !== 'completed');
    const completedJobs = assignments.filter(wo => wo.status === 'completed');
    const pendingPay = weeklyLogs.filter(l => l.status === 'Submitted').reduce((s, l) => s + (l.totalPayout || 0), 0);
    const totalEarned = weeklyLogs.filter(l => l.status === 'Approved').reduce((s, l) => s + (l.totalPayout || 0), 0);
    const reliabilityScore = person?.reliabilityScore ?? (completedJobs.length > 0 ? Math.round((completedJobs.length / assignments.length) * 100) : 0);
    const tier = getReliabilityTier(reliabilityScore);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—';
        try { return format(parseISO(dateStr), 'MM/dd/yyyy'); } catch { return dateStr; }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="space-y-2 text-center">
                    <div className="h-16 w-16 rounded-full bg-bg-secondary animate-pulse mx-auto" />
                    <div className="h-4 w-32 bg-bg-secondary animate-pulse rounded mx-auto" />
                </div>
            </div>
        );
    }

    if (!person) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <AlertTriangle size={32} className="text-text-red" />
                <p className="text-[11px] font-bold text-text-muted uppercase">Personnel record not found</p>
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-[10px] uppercase font-bold">
                    <ArrowLeft size={14} className="mr-2" /> Back
                </Button>
            </div>
        );
    }

    const roles: string[] = Array.isArray(person.roles) ? person.roles : (person.role ? [person.role] : ['Staff']);

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/admin/directory')} className="h-8 text-[10px] uppercase font-bold text-text-muted">
                    <ArrowLeft size={14} className="mr-2" /> Directory
                </Button>
            </div>

            {/* Profile hero */}
            <div className="flex flex-col md:flex-row gap-6 p-6 rounded-xl border border-border-sub bg-bg-secondary">
                <div className="flex flex-col items-center gap-3 md:w-48 shrink-0">
                    <Avatar className="h-20 w-20 border-2 border-brand-red">
                        <AvatarImage src={person.avatarUrl} />
                        <AvatarFallback className="text-lg font-bold">{(person.name || 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <Badge variant={getTierBadgeVariant(tier)} className="text-[8px] uppercase tracking-widest px-3">{tier}</Badge>
                </div>
                <div className="flex-1 space-y-4">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight text-text-primary">{person.name || 'Unnamed'}</h1>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {roles.map(r => <Badge key={r} variant="scheduled" className="text-[8px] uppercase h-4 px-2">{r}</Badge>)}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {person.email && (
                            <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                                <Mail size={12} className="text-text-muted shrink-0" />{person.email}
                            </a>
                        )}
                        {person.phone && (
                            <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                                <Phone size={12} className="text-text-muted shrink-0" />{person.phone}
                            </a>
                        )}
                        {person.currentLocation && (
                            <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                                <MapPin size={12} className="text-text-muted shrink-0" />{person.currentLocation}
                            </span>
                        )}
                        {person.clientCompany && (
                            <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                                <Briefcase size={12} className="text-text-muted shrink-0" />{person.clientCompany}
                            </span>
                        )}
                    </div>
                </div>
                {/* Stats */}
                <div className="md:w-48 shrink-0 grid grid-cols-2 md:grid-cols-1 gap-3">
                    {[
                        { label: 'Active Jobs', value: activeJobs.length, icon: Clock, color: 'text-text-amber' },
                        { label: 'Completed', value: completedJobs.length, icon: CheckCircle, color: 'text-text-green' },
                        { label: 'Pending Pay', value: `$${pendingPay.toFixed(0)}`, icon: DollarSign, color: 'text-text-amber' },
                        { label: 'Total Earned', value: `$${totalEarned.toFixed(0)}`, icon: DollarSign, color: 'text-text-green' },
                    ].map(stat => (
                        <div key={stat.label} className="p-2.5 rounded-lg bg-bg-primary border border-border-sub">
                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{stat.label}</p>
                            <p className={cn("text-lg font-bold font-mono mt-0.5", stat.color)}>{stat.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Active Assignments */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                        <Briefcase size={11} /> Active Assignments ({activeJobs.length})
                    </h3>
                    {activeJobs.length === 0 ? (
                        <p className="text-[10px] text-text-muted uppercase py-4 text-center">No active assignments</p>
                    ) : activeJobs.map(wo => (
                        <div key={wo.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-text-primary uppercase truncate">{wo.title || wo.description || wo.id}</p>
                                <p className="text-[9px] text-text-muted uppercase">{wo.clientName} — {wo.scheduleDate ? formatDate(wo.scheduleDate) : 'TBD'}</p>
                            </div>
                            <Badge variant={wo.status === 'in-progress' ? 'active' : 'scheduled'} className="text-[7px] uppercase h-4 shrink-0 ml-2">{wo.status}</Badge>
                        </div>
                    ))}
                </div>

                {/* Weekly Logs */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                        <Calendar size={11} /> Weekly Logs ({weeklyLogs.length})
                    </h3>
                    {weeklyLogs.length === 0 ? (
                        <p className="text-[10px] text-text-muted uppercase py-4 text-center">No weekly logs</p>
                    ) : weeklyLogs.slice(0, 10).map(log => (
                        <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                            <div>
                                <p className="text-[11px] font-bold text-text-primary uppercase">Week of {log.weekOf}</p>
                                <p className="text-[9px] text-text-muted uppercase">${(log.totalPayout || 0).toFixed(2)} payout</p>
                            </div>
                            <Badge
                                variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'scheduled' : 'onhold'}
                                className="text-[7px] uppercase h-4 shrink-0"
                            >{log.status}</Badge>
                        </div>
                    ))}
                </div>

                {/* Completed Assignments */}
                <div className="lg:col-span-2 space-y-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                        <CheckCircle size={11} className="text-text-green" /> Completed Jobs ({completedJobs.length})
                    </h3>
                    {completedJobs.length === 0 ? (
                        <p className="text-[10px] text-text-muted uppercase py-4 text-center">No completed assignments</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {completedJobs.slice(0, 20).map(wo => (
                                <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-sub bg-bg-secondary">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-text-primary uppercase truncate">{wo.title || wo.description || wo.id}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.clientName} · ${wo.pay || 0}</p>
                                    </div>
                                    <Badge variant="active" className="text-[7px] uppercase h-4 shrink-0 ml-2">Done</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
