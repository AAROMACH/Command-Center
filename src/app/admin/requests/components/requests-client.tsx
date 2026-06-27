
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { ServiceRequest, Technician, WorkOrder } from '@/lib/types';
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
  Lock,
  Search,
  ArrowUpDown,
  Info,
  Calendar,
  User,
  History,
  Download,
  SearchCode
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
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
import { doc, updateDoc, setDoc, collection } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { isSuperAdmin, isDispatchAdmin } from '@/lib/permissions';
import { format, parseISO } from 'date-fns';
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { JobDetailDialog } from '@/components/job-detail-dialog';

type RequestsClientProps = {
    requests: ServiceRequest[];
    workOrders?: WorkOrder[];
    isHistory?: boolean;
};

export function RequestsClient({ requests = [], workOrders = [], isHistory = false }: RequestsClientProps) {
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
    
    // Assignment Card Popup State
    const [isMissionCardOpen, setIsMissionCardOpen] = useState(false);
    const [linkedMission, setLinkedMission] = useState<WorkOrder | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
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

    const totalPages = Math.ceil(requests.length / (itemsPerPage || 1));
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
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    const handleViewMissionCard = (req: ServiceRequest) => {
        if (!req.convertedId) return;
        
        if (req.conversionType === 'project') {
            router.push(`/admin/projects/${req.convertedId}`);
        } else {
            const wo = workOrders.find(w => w.id === req.convertedId);
            if (wo) {
                setLinkedMission(wo);
                setIsMissionCardOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Registry Discrepancy', description: 'Linked assignment record could not be located in current terminal buffer.' });
            }
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
                    source: 'Client',
                    history: [
                        { type: 'note', date: today, details: `Converted from service intake ${selectedRequest.id.toUpperCase()}.`, user: currentUser?.name || 'Admin' }
                    ]
                };

                if (conversionPayType === 'blended') {
                    if (blendedFixed) newWO.blendedFixedPay = blendedFixed;
                    if (blendedHours) newWO.blendedIncludedHours = blendedHours;
                    if (blendedHourly) newWO.blendedHourlyRate = blendedHourly;
                }

                newId = await createDocId(ID_PREFIXES.WORK_ORDER);
                await setDoc(doc(db, 'workOrders', newId), { ...newWO, id: newId });
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
                newId = await createDocId(ID_PREFIXES.PROJECT);
                await setDoc(doc(db, 'projects', newId), { ...newProject, id: newId });
            }

            await updateDoc(docRef, { 
                status: 'closed', 
                convertedId: newId, 
                conversionType: conversionType, 
                closedAt: now,
                title: conversionTitle.trim()
            });

            toast({ title: "Record Created", description: "Job data has been transferred from intake." });
            setIsConversionDialogOpen(false);
            setIsReviewOpen(false);
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
                (verifiedFields.has(field) || (selectedRequest?.status !== 'new' && selectedRequest?.status !== 'rejected'))
                    ? "bg-green-dim text-text-green border border-green-border" 
                    : "bg-bg-tertiary text-text-muted border border-border-sub hover:border-text-primary",
                selectedRequest?.status !== 'new' && "cursor-default"
            )}
        >
            {(verifiedFields.has(field) || (selectedRequest?.status !== 'new' && selectedRequest?.status !== 'rejected')) ? <CheckCircle2 size={10} /> : <Circle size={10} />}
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
                            {!isHistory ? (
                                <>
                                    <th className="text-left pl-0">Client Entity</th>
                                    <th className="text-left pl-0">Technical Category</th>
                                    <th className="text-left pl-0">Location Coordinates</th>
                                    <th className="text-center">Priority</th>
                                </>
                            ) : (
                                <>
                                    <th className="text-left pl-0">Mission Title</th>
                                    <th className="text-left pl-0">Scope Briefing</th>
                                    <th style={{ width: "180px" }} className="text-left pl-0">Audit Timeline</th>
                                    <th style={{ width: "120px" }} className="text-center">Action</th>
                                </>
                            )}
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
                                {!isHistory ? (
                                    <>
                                        <td className="!py-4 text-left pl-0">
                                            <div className="flex items-center gap-2">
                                                <Building2 size={12} className="text-text-muted" />
                                                <span className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[150px] text-left">{req.clientName}</span>
                                            </div>
                                        </td>
                                        <td className="!py-4 text-left pl-0">
                                            <Badge variant="outline" className="text-[9px] uppercase bg-bg-primary border-border-sub">{req.requestType}</Badge>
                                        </td>
                                        <td className="!py-4 text-left pl-0">
                                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase font-bold tracking-tighter truncate max-w-[150px] text-left">
                                                <MapPin size={10} className="text-brand-red shrink-0" />
                                                <span className="truncate">{req.location}</span>
                                            </div>
                                        </td>
                                        <td className="!py-4">
                                            <div className="flex justify-center">
                                                <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1.5 uppercase">
                                                    {req.priority}
                                                </Badge>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="!py-4 text-left pl-0">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[200px] text-left">
                                                {req.title || 'No Title Provided'}
                                            </p>
                                        </td>
                                        <td className="!py-4 text-left pl-0">
                                            <p className="text-[10px] text-text-secondary leading-snug line-clamp-1 text-left">{req.description}</p>
                                        </td>
                                        <td className="!py-4 text-left pl-0">
                                            <div className="flex flex-col gap-0.5 mt-1 border-l border-border-sub pl-2 text-left">
                                                <p className="text-[8px] text-text-muted uppercase font-bold flex items-center gap-1">
                                                    <Plus size={8} /> Created: {req.submittedDate}
                                                </p>
                                                <p className={cn("text-[8px] uppercase font-bold flex items-center gap-1", req.status === 'rejected' ? 'text-text-red' : 'text-text-green')}>
                                                    <CheckCircle2 size={8} className={req.status === 'rejected' ? 'text-text-red' : 'text-text-green'} /> Final: {formatDateStr(req.closedAt || req.reviewedAt)}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="!py-4 text-center">
                                            {req.status === 'closed' && req.convertedId ? (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-7 text-[8px] uppercase font-bold border-brand-red text-brand-red hover:bg-brand-red hover:text-white"
                                                    onClick={(e) => { e.stopPropagation(); handleViewMissionCard(req); }}
                                                >
                                                    View Mission
                                                </Button>
                                            ) : (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 text-[8px] uppercase font-bold text-text-muted"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenReview(req); }}
                                                >
                                                    Audit Detail
                                                </Button>
                                            )}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1 text-left">
                                <div className="flex items-center gap-2 mb-1 text-left">
                                    <ClipboardList className="text-brand-red h-5 w-5" />
                                    <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Mission Intake Terminal</DialogTitle>
                                </div>
                                <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Audit and verification terminal for client service requests.</DialogDescription>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-[10px] font-black text-brand-red uppercase tracking-widest font-mono">{(selectedRequest?.id || '').toUpperCase()}</p>
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
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Registry Linkage Active</p>
                                            <p className="text-xs font-bold text-text-primary uppercase text-left">
                                                Converted to {selectedRequest.conversionType === 'project' ? 'Project' : 'Assignment'}: <span className="text-brand-red font-mono">{(selectedRequest.convertedId || '').toUpperCase()}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 text-[9px] font-bold uppercase"
                                        onClick={() => handleViewMissionCard(selectedRequest)}
                                    >
                                        View Mission Terminal <ChevronRight size={12} className="ml-1.5" />
                                    </Button>
                                </div>
                            )}

                            {(selectedRequest.status === 'closed' || selectedRequest.status === 'rejected') && (
                                <div className="p-4 rounded-xl bg-bg-tertiary/50 border border-border-sub space-y-4 mb-6">
                                    <div className="flex items-center justify-between border-b border-border-sub pb-2">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <History size={12}/> Audit Metadata
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-3 gap-6">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase">Created On</p>
                                            <p className="text-xs font-bold text-text-primary uppercase">{selectedRequest.submittedDate}</p>
                                        </div>
                                        {selectedRequest.reviewedBy && (
                                            <div className="space-y-1 text-left">
                                                <p className="text-[8px] font-black text-text-muted uppercase">Reviewed By</p>
                                                <p className="text-xs font-bold text-text-primary uppercase">{selectedRequest.reviewedBy}</p>
                                            </div>
                                        )}
                                        {selectedRequest.closedAt && (
                                            <div className="space-y-1 text-left">
                                                <p className="text-[8px] font-black text-text-muted uppercase">Finalized On</p>
                                                <p className="text-xs font-bold text-text-primary uppercase">{format(parseISO(selectedRequest.closedAt), 'MM-dd-yyyy')}</p>
                                            </div>
                                        )}
                                    </div>
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
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">{selectedRequest.clientName}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                                <MapPin size={12}/> Site Coordinates
                                            </p>
                                            <VerifyToggle field="location" label="verify" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-left">
                                            <span className="text-xs font-bold text-text-primary uppercase text-left">{selectedRequest.location}</span>
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
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-left">
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
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-left">
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
                            
                            {(selectedRequest.imageUrls?.length || 0) > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Visual Evidence Registry</p>
                                        <VerifyToggle field="photos" label="verify" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {selectedRequest.imageUrls?.map((url, i) => (
                                            <div key={i} className="relative aspect-video rounded-xl border border-border-sub overflow-hidden bg-bg-primary group">
                                                <img src={url} alt="Site evidence" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button variant="ghost" size="icon" className="text-white" asChild>
                                                        <a href={url} target="_blank" rel="noopener noreferrer"><Eye size={20}/></a>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(selectedRequest.documentUrls?.length || 0) > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Technical Asset Registry</p>
                                        <VerifyToggle field="documents" label="verify" />
                                    </div>
                                    <div className="space-y-2">
                                        {selectedRequest.documentUrls?.map((docName, i) => (
                                            <div key={i} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                                <div className="flex items-center gap-4 text-left">
                                                    <div className="p-2.5 bg-bg-primary rounded border border-border-sub text-brand-red">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide text-left">{docName}</p>
                                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-left">Tactical Asset · Ready for Download</p>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary">
                                                    <Download size={16}/>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        {selectedRequest?.status === 'new' && (
                            <div className="flex flex-col items-center gap-4 w-full">
                                <div className="flex items-center justify-between w-full">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Audit Verification Phase:</p>
                                    <p className={cn("text-[9px] font-black uppercase tracking-widest", isAllVerified ? "text-text-green" : "text-text-red")}>
                                        {verifiedFields.size} / 5 Core Indicators Verified
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
                                        <><Lock size={14} className="mr-2" /> Complete Verification to Proceed</>
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
                            <div className="flex flex-col gap-4 w-full">
                                <div className="p-4 rounded-xl bg-bg-tertiary/50 border border-border-sub flex items-start gap-4 text-left">
                                    <Info size={18} className="text-accent-gold shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium text-left">
                                        This intake has been finalized. Audit trail preserved in the historical registry. Converted missions are active in their respective logistical hubs.
                                    </p>
                                </div>
                                <div className="flex gap-3 w-full">
                                    <Button variant="outline" className="flex-1 h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsReviewOpen(false)}>
                                        Close
                                    </Button>
                                    {selectedRequest.status === 'closed' && selectedRequest.convertedId && (
                                        <Button 
                                            className="flex-1 h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest"
                                            onClick={() => handleViewMissionCard(selectedRequest)}
                                        >
                                            View Mission Card <ArrowUpRight size={14} className="ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* REJECTION BRIEFING POPUP */}
            <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <ShieldAlert className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Rejection Briefing</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Provide a tactical justification for terminating this intake request.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-4">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-1 text-left">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest">Mission Termination Handshake</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium">
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
                                <div className="grid grid-cols-2 gap-4 items-end">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center">Pay Model</Label>
                                        <Select value={conversionPayType} onValueChange={(val: any) => setConversionPayType(val)}>
                                            <SelectTrigger className="h-11 bg-bg-primary text-xs uppercase font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                                <SelectItem value="hourly" className="text-xs font-bold uppercase">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                                <SelectItem value="blended" className="text-xs font-bold uppercase">{PAY_TYPE_LABELS.blended}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center gap-1.5">
                                            <DollarSign size={12} className="text-text-green" />
                                            Labor Rate ($)
                                        </Label>
                                        <div className="relative">
                                            <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-green" />
                                            <Input 
                                                type="number"
                                                placeholder="0.00" 
                                                value={conversionPay || ''}
                                                onChange={e => setConversionPay(parseFloat(e.target.value) || 0)}
                                                className="h-11 bg-bg-primary border-border-sub text-xs font-mono text-text-green font-bold pl-8"
                                            />
                                        </div>
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

                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-3 shadow-inner text-left">
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
            
            {/* MISSION DETAIL CARD POPUP */}
            <JobDetailDialog 
                isOpen={isMissionCardOpen}
                setIsOpen={setIsMissionCardOpen}
                mission={linkedMission}
                onUpdate={(id, updates) => {
                    // Update in local mission buffer if needed
                    if (linkedMission?.id === id) {
                        setLinkedMission({ ...linkedMission, ...updates });
                    }
                }}
            />
        </div>
    );
}
