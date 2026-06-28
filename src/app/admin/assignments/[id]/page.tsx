'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
    ArrowLeft,
    MapPin,
    Calendar,
    Clock,
    DollarSign,
    User,
    Briefcase,
    FileText,
    Activity,
    CheckCircle2,
    ExternalLink,
    Navigation,
    ShieldCheck,
    AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

function getStatusVariant(status: string): any {
    switch (status) {
        case 'in-progress': return 'inprogress';
        case 'completed': return 'completed';
        case 'confirmed': case 'on-my-way': return 'active';
        default: return 'scheduled';
    }
}

function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
        'unassigned': 'Unassigned',
        'assigned': 'Assigned',
        'confirmed': 'Confirmed',
        'on-my-way': 'En Route',
        'in-progress': 'In Progress',
        'checked-out': 'Checked Out',
        'completed': 'Completed',
    };
    return labels[status] || status;
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 py-2.5 border-b border-border-sub last:border-0">
            <Icon size={13} className="text-text-muted mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-0.5">{label}</p>
                <p className="text-[11px] font-bold text-text-primary leading-tight">{value || '—'}</p>
            </div>
        </div>
    );
}

export default function AssignmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const assignmentId = params?.id as string;

    const [assignment, setAssignment] = useState<WorkOrder | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [relatedLogs, setRelatedLogs] = useState<WeeklyLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!assignmentId) return;

        const tryLoad = async () => {
            // Try assignments collection first
            const asmtRef = doc(db, 'assignments', assignmentId);
            const asmtSnap = await getDoc(asmtRef);
            if (asmtSnap.exists()) {
                setAssignment({ ...asmtSnap.data(), id: asmtSnap.id } as WorkOrder);
                setLoading(false);
                return;
            }
            // Fallback to workOrders collection
            const woRef = doc(db, 'workOrders', assignmentId);
            const woSnap = await getDoc(woRef);
            if (woSnap.exists()) {
                setAssignment({ ...woSnap.data(), id: woSnap.id } as WorkOrder);
            }
            setLoading(false);
        };

        tryLoad();
    }, [assignmentId]);

    useEffect(() => {
        if (!assignment) return;

        const techId = assignment.assignedTechnicianId || assignment.techId || (assignment.assignedTechIds?.[0]);
        if (techId) {
            const unsubTech = onSnapshot(doc(db, 'users', techId), (snap) => {
                if (snap.exists()) setTech({ ...snap.data(), id: snap.id } as Technician);
            });
            return () => unsubTech();
        }
    }, [assignment]);

    useEffect(() => {
        if (!assignment) return;
        const unsubLogs = onSnapshot(
            query(collection(db, 'weeklyLogs'), where('techId', '==', assignment.techId || assignment.assignedTechnicianId || '')),
            (snap) => {
                const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog));
                setRelatedLogs(logs.filter(l => l.items?.some(i => i.workOrderId === assignmentId)));
            }
        );
        return () => unsubLogs();
    }, [assignment, assignmentId]);

    const handleVerify = async () => {
        if (!assignment) return;
        try {
            await updateDoc(doc(db, 'assignments', assignment.id), {
                isAudited: true,
                auditedAt: new Date().toISOString(),
            });
            toast({ title: 'Assignment Verified', description: 'Marked as audited in Firestore.' });
            setAssignment(prev => prev ? { ...prev, isAudited: true } : prev);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Verify Failed', description: e.message });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <p className="text-xs font-bold uppercase text-text-muted tracking-widest animate-pulse">Loading assignment...</p>
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold text-text-muted" onClick={() => router.back()}>
                    <ArrowLeft size={13} className="mr-1.5" /> Back
                </Button>
                <div className="py-24 text-center border border-dashed border-border-sub rounded-xl">
                    <AlertTriangle size={32} className="mx-auto text-text-muted mb-2 opacity-40" />
                    <p className="text-xs font-bold uppercase text-text-muted">Assignment not found</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase">{assignmentId}</p>
                </div>
            </div>
        );
    }

    const techId = assignment.assignedTechnicianId || assignment.techId;
    const payLabel = assignment.payType === 'hourly'
        ? `$${assignment.pay}/hr`
        : assignment.payType === 'blended'
            ? `$${assignment.blendedFixedPay} + $${assignment.blendedHourlyRate}/hr`
            : `$${assignment.pay?.toFixed(2)}`;

    const fieldNationUrl = assignment.externalWorkOrderId
        ? `https://app.fieldnation.com/workorders/${assignment.externalWorkOrderId}`
        : null;

    return (
        <div className="max-w-4xl mx-auto space-y-6 text-left pb-24">
            {/* Back + header */}
            <div>
                <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold text-text-muted -ml-2 mb-4" onClick={() => router.back()}>
                    <ArrowLeft size={13} className="mr-1.5" /> Back to Assignments
                </Button>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <p className="page-eyebrow flex items-center gap-2">
                            <Activity size={12} />
                            Assignment Detail
                        </p>
                        <h1 className="page-title leading-none">
                            {assignment.title || assignment.description || assignmentId.toUpperCase()}
                        </h1>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-mono font-bold text-text-muted uppercase">{assignmentId.toUpperCase()}</span>
                            {assignment.shortId && <span className="text-text-muted">·</span>}
                            {assignment.shortId && <span className="text-[10px] font-mono text-text-muted">{assignment.shortId.toUpperCase()}</span>}
                            {assignment.source && (
                                <Badge variant="outline" className="h-4 text-[7px] uppercase tracking-widest">{assignment.source}</Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={getStatusVariant(assignment.status)} className="text-[10px] uppercase font-black px-3 h-7">
                            {getStatusLabel(assignment.status)}
                        </Badge>
                        {assignment.priority && (
                            <Badge variant={assignment.priority === 'critical' || assignment.priority === 'high' ? 'high' : 'medium'} className="text-[10px] uppercase font-black px-3 h-7">
                                {assignment.priority}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main details — 2/3 */}
                <div className="md:col-span-2 space-y-5">
                    {/* Job Info */}
                    <Card>
                        <CardHeader className="pb-2 text-left">
                            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                <FileText size={12} className="text-brand-red" /> Job Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <InfoRow icon={Briefcase} label="Client" value={assignment.clientName} />
                            <InfoRow icon={MapPin} label="Location" value={assignment.location} />
                            <InfoRow icon={Calendar} label="Schedule Date" value={assignment.scheduleDate || '—'} />
                            <InfoRow icon={Clock} label="Start Window" value={assignment.scheduleTime || '—'} />
                            <InfoRow icon={Activity} label="Job Type" value={assignment.jobType || assignment.projectType || '—'} />
                            <InfoRow icon={DollarSign} label="Pay" value={payLabel} />
                        </CardContent>
                    </Card>

                    {/* Scope of Work */}
                    {assignment.description && (
                        <Card>
                            <CardHeader className="pb-2 text-left">
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                    <FileText size={12} className="text-brand-red" /> Scope of Work
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-text-secondary leading-relaxed">{assignment.description}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Notes */}
                    {assignment.notes && (
                        <Card>
                            <CardHeader className="pb-2 text-left">
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                    <FileText size={12} className="text-brand-red" /> Notes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-text-secondary leading-relaxed">{assignment.notes}</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* History */}
                    {assignment.history && assignment.history.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2 text-left">
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                    <Activity size={12} className="text-brand-red" /> History
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {[...assignment.history].reverse().map((event, i) => (
                                    <div key={i} className="flex items-start gap-3 py-2 border-b border-border-sub last:border-0">
                                        <div className="h-1.5 w-1.5 rounded-full bg-brand-red mt-1.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-mono text-text-muted">{event.date}</p>
                                            <p className="text-[11px] font-bold uppercase text-text-primary">{event.type.replace(/_/g, ' ')}</p>
                                            <p className="text-[10px] text-text-secondary leading-tight mt-0.5">{event.details}</p>
                                        </div>
                                        <span className="text-[9px] text-text-muted uppercase font-bold shrink-0">{event.user}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {/* Weekly Log Links */}
                    {relatedLogs.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2 text-left">
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-brand-red" /> Weekly Logs
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {relatedLogs.map(log => (
                                    <div key={log.id} className="flex items-center justify-between p-2 rounded bg-bg-secondary border border-border-sub">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-text-primary">Week of {log.weekOf}</p>
                                            <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'scheduled' : 'outline'} className="h-4 text-[7px] mt-0.5">
                                                {log.status}
                                            </Badge>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-text-green">${(log.totalPayout || 0).toFixed(2)}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar — 1/3 */}
                <div className="space-y-5">
                    {/* Assigned Tech */}
                    <Card>
                        <CardHeader className="pb-2 text-left">
                            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                                <User size={12} className="text-brand-red" /> Operative
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {tech ? (
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback className="text-xs">{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-[11px] font-black uppercase text-text-primary">{tech.name}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{tech.email}</p>
                                    </div>
                                </div>
                            ) : techId ? (
                                <p className="text-[10px] font-bold uppercase text-text-muted">{techId}</p>
                            ) : (
                                <p className="text-[10px] font-bold uppercase text-text-muted opacity-40">Unassigned</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Quick Actions */}
                    <Card>
                        <CardHeader className="pb-2 text-left">
                            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-9 text-[10px] uppercase font-bold justify-start gap-2"
                                onClick={() => {
                                    const q = encodeURIComponent(assignment.location || '');
                                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, '_blank', 'noopener');
                                }}
                            >
                                <Navigation size={12} /> Directions
                            </Button>
                            {fieldNationUrl && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-9 text-[10px] uppercase font-bold justify-start gap-2"
                                    onClick={() => window.open(fieldNationUrl, '_blank', 'noopener')}
                                >
                                    <ExternalLink size={12} /> Field Nation
                                </Button>
                            )}
                            {!assignment.isAudited && (
                                <Button
                                    size="sm"
                                    className="w-full h-9 text-[10px] uppercase font-bold justify-start gap-2 border border-text-green text-text-green bg-transparent hover:bg-text-green/10"
                                    onClick={handleVerify}
                                >
                                    <ShieldCheck size={12} /> Verify Assignment
                                </Button>
                            )}
                            {assignment.isAudited && (
                                <div className="flex items-center gap-2 p-2.5 rounded bg-text-green/5 border border-text-green/20">
                                    <ShieldCheck size={12} className="text-text-green" />
                                    <span className="text-[10px] font-black uppercase text-text-green">Verified</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Skills */}
                    {assignment.requiredSkills && assignment.requiredSkills.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2 text-left">
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-text-muted">Required Skills</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-1">
                                    {assignment.requiredSkills.map(skill => (
                                        <Badge key={skill} variant="outline" className="text-[8px] uppercase h-5">{skill}</Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
