'use client';

import { useState, useMemo, useEffect } from 'react';
import type { ServiceRequest, Technician, WorkOrder, Project } from '@/lib/types';
import { technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Check, 
  X, 
  Eye, 
  Briefcase, 
  ClipboardList, 
  AlertTriangle,
  Wrench,
  Camera,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Building2,
  LayoutDashboard,
  FileCheck,
  SearchCheck,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  Type,
  DollarSign,
  Lock
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { db } from "@/lib/firebase";
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { isSuperAdmin, isDispatchAdmin } from '@/lib/permissions';
import { format, parseISO } from 'date-fns';
import { PAY_TYPE_LABELS } from '@/lib/constants';

type RequestsClientProps = {
    requests: ServiceRequest[];
    isHistory?: boolean;
};

export function RequestsClient({ requests, isHistory = false }: RequestsClientProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
    const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
    const [conversionType, setConversionType] = useState<'assignment' | 'project' | null>(null);
    const [conversionTitle, setConversionTitle] = useState("");
    const [conversionPay, setConversionPay] = useState<number>(0);
    const [conversionPayType, setConversionPayType] = useState<'fixed' | 'hourly' | 'blended'>('fixed');
    const [blendedFixed, setBlendedFixed] = useState<number>(0);
    const [blendedHours, setBlendedHours] = useState<number>(0);
    const [blendedHourly, setBlendedHourly] = useState<number>(0);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());
    const [rejectionReason, setRejectionReason] = useState("");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            const user = technicians.find(t => t.id === userId);
            setCurrentUser(user || null);
        }
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [requests.length, itemsPerPage]);

    useEffect(() => {
        if (!isReviewOpen) {
            setVerifiedFields(new Set());
        }
    }, [isReviewOpen]);

    const totalPages = Math.ceil(requests.length / itemsPerPage);
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return requests.slice(start, start + itemsPerPage);
    }, [requests, currentPage, itemsPerPage]);

    const handleOpenReview = (req: ServiceRequest) => {
        setSelectedRequest(req);
        setIsReviewOpen(true);
    };

    const toggleVerify = (field: string) => {
        setVerifiedFields(prev => {
            const next = new Set(prev);
            if (next.has(field)) next.delete(field);
            else next.add(field);
            return next;
        });
    };

    const isAllVerified = verifiedFields.size >= 5;

    const userIsSuper = isSuperAdmin(currentUser);
    const userIsDispatch = isDispatchAdmin(currentUser);

    const handleOpenConversion = (type: 'assignment' | 'project') => {
        if (!selectedRequest) return;
        setConversionType(type);
        setConversionTitle(
            type === 'project' 
                ? `${selectedRequest.clientName} - ${selectedRequest.requestType} Initiative`
                : `${selectedRequest.clientName} - ${selectedRequest.requestType}`
        );
        setConversionPay(0);
        setConversionPayType('fixed');
        setBlendedFixed(0);
        setBlendedHours(0);
        setBlendedHourly(0);
        setIsConversionDialogOpen(true);
    };

    const handleAction = async (status: ServiceRequest['status']) => {
        if (!selectedRequest) return;
        
        const requiresSuper = status === 'rejected' || status === 'approved';
        if (requiresSuper && !userIsSuper) {
            toast({ variant: 'destructive', title: 'Authorization Restricted', description: 'This authorization path requires Super Admin credentials.' });
            return;
        }

        const docRef = doc(db, 'clientRequests', selectedRequest.id);
        const now = new Date().toISOString();

        try {
            if (status === 'rejected') {
                if (!rejectionReason.trim()) {
                    toast({ variant: 'destructive', title: 'Note Required', description: 'Please provide a reason for the client before rejection.' });
                    return;
                }
                await updateDoc(docRef, { 
                  status: 'rejected', 
                  rejectionReason: rejectionReason.trim(),
                  reviewedAt: now,
                  reviewedBy: currentUser?.name || 'Admin',
                  closedAt: now
                });
                toast({
                    variant: "destructive",
                    title: "Intake Terminated",
                    description: `Request ${selectedRequest.id.toUpperCase()} has been rejected.`,
                });
                setIsRejectionDialogOpen(false);
                setIsReviewOpen(false);
            } else if (status === 'reviewed') {
                await updateDoc(docRef, { status: 'reviewed', reviewedAt: now, reviewedBy: currentUser?.name || 'Admin' });
                toast({
                    title: "Review Finalized",
                    description: `Request ${selectedRequest.id.toUpperCase()} marked as reviewed.`,
                });
                setIsReviewOpen(false);
            } else if (status === 'approved') {
                await updateDoc(docRef, { status: 'approved' });
                toast({
                    title: "Intake Approved",
                    description: `Request ${selectedRequest.id.toUpperCase()} approved.`,
                });
                setIsReviewOpen(false);
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Registry Error", description: e.message });
        }
    };

    const executeConversion = async () => {
        if (!selectedRequest || !conversionType || !conversionTitle.trim()) return;

        const docRef = doc(db, 'clientRequests', selectedRequest.id);
        const today = format(new Date(), 'yyyy-MM-dd');
        const now = new Date().toISOString();

        try {
            let newId = '';
            if (conversionType === 'assignment') {
                const newWO: any = {
                    title: conversionTitle.trim(),
                    description: selectedRequest.description,
                    location: selectedRequest.location,
                    requiredSkills: [],
                    priority: selectedRequest.priority,
                    status: 'unassigned',
                    clientName: selectedRequest.clientName,
                    projectType: selectedRequest.requestType,
                    scheduleDate: today,
                    scheduleTime: '09:00 AM EST',
                    pay: conversionPay,
                    payType: conversionPayType,
                    blendedFixedPay: conversionPayType === 'blended' ? blendedFixed : undefined,
                    blendedIncludedHours: conversionPayType === 'blended' ? blendedHours : undefined,
                    blendedHourlyRate: conversionPayType === 'blended' ? blendedHourly : undefined,
                    source: 'Client',
                    history: [
                        { type: 'note', date: today, details: `Converted from service intake ${selectedRequest.id.toUpperCase()}.`, user: currentUser?.name || 'Admin' }
                    ]
                };
                const createdRef = await addDoc(collection(db, 'workOrders'), newWO);
                newId = createdRef.id;
            } else {
                const newProject: any = {
                    name: conversionTitle.trim(),
                    client: selectedRequest.clientName,
                    location: selectedRequest.location,
                    status: 'active',
                    startDate: today,
                    estimatedDuration: '4 weeks',
                    scope: selectedRequest.description,
                    assignedTechnicianIds: [],
                    team: [],
                    phases: [
                        { id: 'ph-1', phaseNumber: 1, name: 'Site Audit & Prep', tasks: [] }
                    ],
                    siteHazardNotes: [],
                    actualBudget: 0,
                    actualHours: 0
                };
                const createdRef = await addDoc(collection(db, 'projects'), newProject);
                newId = createdRef.id;
            }

            await updateDoc(docRef, { 
                status: 'closed', 
                convertedId: newId, 
                conversionType: conversionType, 
                closedAt: now,
                title: conversionTitle.trim()
            });

            toast({ title: "Registry Synced", description: "Mission data has been transferred from intake." });
            setIsConversionDialogOpen(false);
            setIsReviewOpen(false);
            router.push(conversionType === 'project' ? '/admin/projects' : '/admin/dispatch');
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Conversion Failed', description: e.message });
        }
    };

    const VerifyToggle = ({ field, label }: { field: string, label: string }) => (
        <button 
            type="button"
            disabled={selectedRequest?.status !== 'new'}
            onClick={() => toggleVerify(field)}
            className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded transition-all",
                (verifiedFields.has(field) || selectedRequest?.status !== 'new')
                    ? "bg-green-dim text-text-green border border-green-border" 
                    : "bg-bg-tertiary text-text-muted border border-border-sub hover:border-text-primary",
                selectedRequest?.status !== 'new' && "cursor-default"
            )}
        >
            {(verifiedFields.has(field) || selectedRequest?.status !== 'new') ? <CheckCircle2 size={10} /> : <Circle size={10} />}
            <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
        </button>
    );

    const formatDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return 'N/A';
        try {
            return format(parseISO(dateStr), 'MM-dd HH:mm');
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="space-y-4">
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr className="bg-bg-tertiary">
                            <th style={{ width: "140px" }} className="text-center pl-0">Intake ID</th>
                            <th style={{ width: "120px" }} className="text-center">Status</th>
                            <th className="text-left pl-0">Title & Briefing</th>
                            <th className="text-left pl-0">Scope Summary</th>
                            <th style={{ width: "180px" }} className="text-left pl-0">Creation Time</th>
                            <th style={{ width: "180px" }} className="text-left pl-0">{isHistory ? 'Closure Time' : 'Audit Timeline'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedRequests.map((req) => (
                            <tr key={req.id} className="group hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => handleOpenReview(req)}>
                                <td className="!py-4">
                                    <div className="font-mono text-[10px] font-bold text-brand-red uppercase text-center">{req.id.toUpperCase()}</div>
                                </td>
                                <td className="!py-4">
                                    <div className="flex justify-center">
                                        <Badge variant={req.status === 'rejected' ? 'missed' : req.status === 'closed' ? 'active' : 'pending'} className="text-[7px] h-3.5 px-1.5 uppercase">
                                            {req.status}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[200px] text-left">
                                        {req.title || 'No Title Provided'}
                                    </p>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <p className="text-[10px] text-text-secondary leading-snug line-clamp-1 text-left">{req.description}</p>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <Plus size={10} className="text-text-muted"/> {req.submittedDate}
                                    </p>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <p className="text-[10px] text-brand-red font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <CheckCircle2 size={10} className="text-text-green"/> {formatDateStr(req.closedAt || req.reviewedAt)}
                                    </p>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
                    <div className="flex items-center gap-4 text-left">
                        <div className="flex items-center gap-1.5 text-left">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Show</p>
                            <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                                <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">
                            Showing <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, requests.length)}</span> of {requests.length}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="outline" 
                            size="icon-sm" 
                            disabled={currentPage === 1}
                            onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.max(1, prev - 1)); }}
                            className="h-7 w-7 border-border-sub bg-bg-primary"
                        >
                            <ChevronLeft size={14} />
                        </Button>
                        <div className="px-2 text-[10px] font-bold text-text-primary uppercase tracking-tighter">Page {currentPage} of {totalPages}</div>
                        <Button 
                            variant="outline" 
                            size="icon-sm" 
                            disabled={currentPage === totalPages}
                            onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.min(totalPages, prev + 1)); }}
                            className="h-7 w-7 border-border-sub bg-bg-primary"
                        >
                            <ChevronRight size={14} />
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1 text-left">
                                <div className="flex items-center gap-2 mb-1 text-left">
                                    <ClipboardList className="text-brand-red h-5 w-5" />
                                    <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Mission Intake Audit</DialogTitle>
                                </div>
                                <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Verification required for deployment path authorization.</DialogDescription>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-[10px] font-black text-brand-red uppercase tracking-widest font-mono">{selectedRequest?.id.toUpperCase()}</p>
                                <Badge variant={selectedRequest?.status === 'closed' ? 'active' : selectedRequest?.status === 'rejected' ? 'missed' : 'pending'} className="text-[7px] uppercase h-4 tracking-tighter">
                                    {selectedRequest?.status}
                                </Badge>
                            </div>
                        </div>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                            {selectedRequest.status === 'closed' && selectedRequest.convertedId && (
                                <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between mb-6 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-green">
                                            <CheckCircle2 size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Registry Linkage</p>
                                            <p className="text-xs font-bold text-text-primary uppercase">
                                                {selectedRequest.conversionType === 'project' ? 'Project' : 'Assignment'} Created: <span className="text-brand-red font-mono">{selectedRequest.convertedId.toUpperCase()}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 text-[9px] font-bold uppercase"
                                        onClick={() => router.push(selectedRequest.conversionType === 'project' ? `/admin/projects/${selectedRequest.convertedId}` : `/admin/dispatch`)}
                                    >
                                        View Record <ExternalLink size={12} className="ml-1.5" />
                                    </Button>
                                </div>
                            )}

                            {selectedRequest.status === 'rejected' && (
                                <div className="p-4 rounded-xl bg-brand-red-dim/5 border border-brand-red/30 space-y-2 mb-6">
                                    <p className="text-[9px] font-black text-brand-red uppercase tracking-widest flex items-center gap-2 text-left">
                                        <ShieldAlert size={12}/> Rejection Justification
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium italic text-left">
                                        &quot;{selectedRequest.rejectionReason || 'No reason provided.'}&quot;
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                                <Building2 size={12}/> Client Entity
                                            </p>
                                            <VerifyToggle field="client" label="verify" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{selectedRequest.clientName}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                                <MapPin size={12}/> Site Coordinates
                                            </p>
                                            <VerifyToggle field="location" label="verify" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <span className="text-xs font-bold text-text-primary uppercase">{selectedRequest.location}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                                <LayoutDashboard size={12}/> Technical Category
                                            </p>
                                            <VerifyToggle field="category" label="verify" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <Badge variant="outline" className="text-[10px] uppercase bg-bg-secondary">{selectedRequest.requestType}</Badge>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                                <AlertTriangle size={12}/> Deployment Priority
                                            </p>
                                            <VerifyToggle field="priority" label="verify" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <Badge variant={selectedRequest.priority === 'critical' || selectedRequest.priority === 'high' ? 'high' : 'medium'} className="h-5 px-3 uppercase text-[10px]">
                                                {selectedRequest.priority}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                                    <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Scope Briefing</p>
                                    <VerifyToggle field="scope" label="verify" />
                                </div>
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub italic text-sm text-text-secondary leading-relaxed uppercase font-medium text-left">
                                    &quot;{selectedRequest.description}&quot;
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default">
                        {selectedRequest?.status === 'new' && (
                            <div className="flex flex-col items-center gap-4 w-full">
                                <div className="flex items-center justify-between w-full">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Audit Verification Phase:</p>
                                    <p className={cn("text-[9px] font-black uppercase tracking-widest", isAllVerified ? "text-text-green" : "text-text-red")}>
                                        {verifiedFields.size} / 5 Fields Verified
                                    </p>
                                </div>
                                <Button 
                                    disabled={!isAllVerified || (!userIsSuper && !userIsDispatch)}
                                    onClick={() => handleAction('reviewed')} 
                                    className={cn(
                                        "w-full h-11 text-[10px] uppercase font-bold tracking-[0.15em] transition-all",
                                        isAllVerified ? "bg-brand-red hover:bg-brand-red-hover shadow-lg" : "bg-bg-tertiary text-text-muted border border-border-sub"
                                    )}
                                >
                                    {isAllVerified ? (
                                        <><SearchCheck size={16} className="mr-2" /> Mark as Reviewed & Confirmed</>
                                    ) : (
                                        <><Lock size={14} className="mr-2" /> Verify All Fields to Continue</>
                                    )}
                                </Button>
                            </div>
                        )}

                        {selectedRequest?.status === 'reviewed' && (
                            <div className="flex flex-col gap-4 w-full">
                                <div className="flex items-center justify-between w-full border-b border-border-sub pb-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Authorization Decision:</p>
                                    <Badge variant="active" className="text-[8px] h-4">AUDIT PASSED</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <Button 
                                        variant="destructive-outline" 
                                        disabled={!userIsSuper}
                                        onClick={() => setIsRejectionDialogOpen(true)} 
                                        className="h-11 uppercase font-bold text-[10px] tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                    >
                                        <X size={16} className="mr-2" /> Reject Intake
                                    </Button>
                                    <Button 
                                        disabled={!userIsSuper}
                                        onClick={() => handleAction('approved')} 
                                        className="h-11 bg-text-green hover:bg-text-green/90 uppercase font-bold text-[10px] tracking-widest text-white shadow-lg"
                                    >
                                        <Check size={16} className="mr-2" /> Approve for Deployment
                                    </Button>
                                </div>
                            </div>
                        )}

                        {selectedRequest?.status === 'approved' && (
                            <div className="flex flex-col gap-4 w-full">
                                <div className="flex items-center justify-between w-full border-b border-border-sub pb-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Tactical Deployment Path:</p>
                                    <Badge variant="active" className="text-[8px] h-4">AUTHORIZED</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <Button 
                                        disabled={!userIsSuper}
                                        onClick={() => handleOpenConversion('assignment')} 
                                        className="h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white shadow-lg"
                                    >
                                        <Wrench size={16} className="mr-2" /> Convert to Assignment
                                    </Button>
                                    <Button 
                                        disabled={!userIsSuper}
                                        variant="outline"
                                        onClick={() => handleOpenConversion('project')} 
                                        className="h-11 border-accent-gold text-accent-gold hover:bg-accent-gold/10 uppercase font-bold text-[10px] tracking-widest"
                                    >
                                        <Briefcase size={16} className="mr-2" /> Convert to Project
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {(selectedRequest?.status === 'closed' || selectedRequest?.status === 'rejected') && (
                            <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsReviewOpen(false)}>
                                Close Audit Log
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* REJECTION BRIEFING POPUP */}
            <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Rejection Briefing</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Provide a tactical justification for terminating this intake request.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-4">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-1">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest text-left">Mission Termination Handshake</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium text-left">
                                You are rejecting request <span className="text-text-primary font-bold">{(selectedRequest?.id || '').toUpperCase()}</span>. This will be transmitted to the client entity.
                            </p>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1">Manual note to give reason to client (Required)</Label>
                            <Textarea 
                                placeholder="e.g., Site access restricted, incomplete data, or out of service scope..." 
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                className="bg-bg-primary border-border-sub min-h-[120px] text-xs leading-relaxed uppercase font-medium"
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsRejectionDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button 
                            variant="destructive" 
                            disabled={!rejectionReason.trim()}
                            onClick={() => handleAction('rejected')} 
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white shadow-lg"
                        >
                            <X size={16} className="mr-2" /> Confirm & Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CONVERSION INITIALIZATION POPUP */}
            <Dialog open={isConversionDialogOpen} onOpenChange={setIsConversionDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            {conversionType === 'project' ? <Briefcase className="text-accent-gold h-5 w-5" /> : <Wrench className="text-brand-red h-5 w-5" />}
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">
                                {conversionType === 'project' ? 'Initialize Project Registry' : 'Stage New Assignment'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Define operational identifiers for the new registry entry.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center gap-1.5">
                                <Type size={12} className="text-brand-red" />
                                Official Title / Identifier
                            </Label>
                            <Input 
                                placeholder="e.g. Gotham Data Center Rewiring" 
                                value={conversionTitle}
                                onChange={e => setConversionTitle(e.target.value)}
                                className="h-11 bg-bg-primary border-border-sub text-xs font-bold uppercase tracking-wide"
                                autoFocus
                            />
                        </div>

                        {conversionType === 'assignment' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2 text-left">
                                        <Label className="h-4 text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center">Pay Model</Label>
                                        <Select value={conversionPayType} onValueChange={(val: any) => setConversionPayType(val)}>
                                            <SelectTrigger className="h-11 bg-bg-primary text-xs uppercase font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                                <SelectItem value="hourly" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                                <SelectItem value="blended" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <Label className="h-4 text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center gap-1.5">
                                            <DollarSign size={12} className="text-text-green" />
                                            Labor Rate ($)
                                        </Label>
                                        <Input 
                                            type="number"
                                            placeholder="0.00" 
                                            value={conversionPay}
                                            onChange={e => setConversionPay(parseFloat(e.target.value) || 0)}
                                            className="h-11 bg-bg-primary border-border-sub text-xs font-mono text-text-green font-bold"
                                        />
                                    </div>
                                </div>

                                {conversionPayType === 'blended' && (
                                    <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg bg-bg-secondary/50 border border-border-sub text-left">
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Fixed Base ($)</Label>
                                            <div className="relative">
                                                <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input 
                                                    type="number"
                                                    value={blendedFixed || ''}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        setBlendedFixed(val);
                                                        setConversionPay(val);
                                                    }}
                                                    className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Incl. Hours</Label>
                                            <Input 
                                                type="number"
                                                value={blendedHours || ''}
                                                onChange={(e) => setBlendedHours(parseFloat(e.target.value) || 0)}
                                                className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                                            />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Post Rate ($/hr)</Label>
                                            <div className="relative">
                                                <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input 
                                                    type="number"
                                                    value={blendedHourly || ''}
                                                    onChange={(e) => setBlendedHourly(parseFloat(e.target.value) || 0)}
                                                    className="bg-bg-primary h-9 font-mono text-text-green text-[11px]"
                                                />
                                            </div>
                                        </div>
                                        <p className="col-span-3 text-[9px] text-text-muted uppercase font-bold italic tracking-tighter text-left">Fixed amount for specified hours, then hourly rate applies.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-3">
                            <div className="space-y-1 text-left">
                                <p className="text-[8px] font-black text-text-muted uppercase">Inherited Context</p>
                                <div className="flex items-center gap-2">
                                    <Building2 size={12} className="text-brand-red" />
                                    <p className="text-[10px] font-bold text-text-primary uppercase">{selectedRequest?.clientName}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin size={12} className="text-brand-red" />
                                    <p className="text-[10px] font-bold text-text-primary uppercase truncate">{selectedRequest?.location}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsConversionDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button 
                            disabled={!conversionTitle.trim()}
                            onClick={executeConversion} 
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white shadow-lg"
                        >
                            <CheckCircle2 size={16} className="mr-2" /> Finalize Registry
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
