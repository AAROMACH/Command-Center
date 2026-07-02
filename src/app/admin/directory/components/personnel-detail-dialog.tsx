'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Technician, WorkOrder, TimeOffRequest, ReliabilityEvent, ProjectDocument, ProjectDailyLog } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Mail,
    Phone,
    Shield,
    Calendar as CalendarIcon,
    History,
    Plus,
    X,
    Pencil,
    Activity,
    ShieldAlert,
    CheckCircle2,
    Check,
    Settings,
    FileText,
    Upload,
    Download,
    Trash2,
    Image as ImageIcon,
    HeartPulse,
    Info,
    ChevronRight,
    Clock,
    User,
    ClipboardCheck,
    Gauge,
    Activity as ActivityIcon,
    DollarSign,
    Loader2
} from 'lucide-react';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { penaltyEvents, assignmentTimeLogs } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierBadgeVariant, getTierColor, getManualEventOptions } from '@/lib/reliability';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, updateDoc } from 'firebase/firestore';
import { auditEvent } from '@/lib/audit';
import { uploadFile } from '@/lib/upload';
import { Switch } from '@/components/ui/switch';
import type { Permission } from '@/lib/permissions';

type PersonnelDocument = {
    id: string;
    name: string;
    type: 'pdf' | 'doc' | 'img';
    size: string;
    uploadedAt: string;
    uploader: string;
    url?: string;
}

type PersonnelDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  person: Technician | null;
  workOrders: WorkOrder[];
  timeOffRequests: TimeOffRequest[];
  onEdit?: () => void;
};

type PersonnelNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};

const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'view_dashboard', label: 'View Dashboard' },
  { key: 'view_assignments', label: 'View Assignments' },
  { key: 'manage_assignments', label: 'Manage Assignments' },
  { key: 'view_projects', label: 'View Projects' },
  { key: 'manage_projects', label: 'Manage Projects' },
  { key: 'view_directory', label: 'View Directory' },
  { key: 'manage_personnel', label: 'Manage Personnel' },
  { key: 'view_financials', label: 'View Financials' },
  { key: 'manage_payroll', label: 'Manage Payroll' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'view_crm', label: 'View CRM' },
  { key: 'manage_leads', label: 'Manage Leads' },
  { key: 'approve_pay_changes', label: 'Approve Pay Changes' },
  { key: 'field_checkin', label: 'Field Check-In' },
  { key: 'field_logs', label: 'Field Logs' },
  { key: 'manage_safety_events', label: 'Manage Safety Events' },
  { key: 'manage_certifications', label: 'Manage Certifications' },
];

export function PersonnelDetailDialog({ isOpen, setIsOpen, person, workOrders, timeOffRequests, onEdit }: PersonnelDetailDialogProps) {
  const [isLogEventOpen, setIsLogEventOpen] = useState(false);
  const [documents, setDocuments] = useState<PersonnelDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [notes, setNotes] = useState<PersonnelNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (!isOpen || !person?.id) return;
    const q = query(collection(db, 'personnelDocuments'), where('personnelId', '==', person.id));
    const unsub = onSnapshot(q, (snap) => {
      setDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as PersonnelDocument)));
    });
    return () => unsub();
  }, [isOpen, person?.id]);

  useEffect(() => {
    if (!isOpen || !person?.id) return;
    const q = collection(db, 'users', person.id, 'notes');
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PersonnelNote))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setNotes(sorted);
    });
    return () => unsub();
  }, [isOpen, person?.id]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !person?.id) return;
    setIsSavingNote(true);
    try {
      await addDoc(collection(db, 'users', person.id, 'notes'), {
        text: newNoteText.trim(),
        author: 'Admin',
        createdAt: new Date().toISOString(),
      });
      setNewNoteText('');
      toast({ title: 'Note Added' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!person?.id) return;
    await deleteDoc(doc(db, 'users', person.id, 'notes', noteId));
    toast({ variant: 'destructive', title: 'Note Deleted' });
  };

  const handleTogglePermission = async (permission: Permission, current: boolean | undefined) => {
    if (!person?.id) return;
    const overrides = { ...(person.permissionOverrides || {}) };
    if (current === true) {
      overrides[permission] = false;
    } else if (current === false) {
      delete overrides[permission];
    } else {
      overrides[permission] = true;
    }
    try {
      await updateDoc(doc(db, 'users', person.id), { permissionOverrides: overrides });
      const enabled = overrides[permission] !== false;
      const adminId = auth.currentUser?.uid || '';
      const adminName = auth.currentUser?.displayName || 'Admin';
      await auditEvent('users', person.id, adminId, adminName,
        `permission_${enabled ? 'granted' : 'revoked'}`,
        `Permission "${permission}" ${enabled ? 'granted to' : 'revoked from'} ${person.name}`
      );
      toast({ title: 'Permission Updated' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const isTechnician = useMemo(() => {
    if (!person) return false;
    return person.roles?.some(r => r.includes('tech') || r.includes('lead')) || (person.role || '').toLowerCase().includes('tech');
  }, [person]);

  const isStaff = useMemo(() => {
    if (!person) return false;
    return person.roles?.some(r => r.includes('admin') || r.includes('manager')) || (person.role || '').toLowerCase() === 'dispatcher' || (person.role || '').toLowerCase() === 'admin';
  }, [person]);

  const isClient = useMemo(() => {
    if (!person) return false;
    return person.roles?.includes('client') || (person.role || '').toLowerCase().includes('client');
  }, [person]);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const reliabilityEvents = useMemo(() => {
    if (!person) return [];
    return penaltyEvents.filter(e => e.techId === person.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [person]);

  const tierData = useMemo(() => {
    if (!person) return { tier: 'Reliable' as const, color: '', variant: 'active' as const };
    const tier = person.reliabilityTier || getReliabilityTier(person.reliabilityScore || 0);
    return {
        tier,
        color: getTierColor(tier),
        variant: getTierBadgeVariant(tier)
    };
  }, [person]);

  const personWorkOrders = useMemo(() => {
    if (!person) return [];
    
    const filtered = workOrders.filter(wo => 
      wo.assignedTechnicianId === person.id || 
      (wo.additionalTechnicianIds || []).includes(person.id)
    );

    return filtered.sort((a, b) => {
      const getStatusRank = (status: string) => {
        if (status === 'in-progress') return 0;
        if (status === 'on-my-way') return 1;
        if (status === 'confirmed') return 2;
        if (status === 'assigned') return 3;
        return 4;
      };

      const rankA = getStatusRank(a.status);
      const rankB = getStatusRank(b.status);

      if (rankA !== rankB) return rankA - rankB;

      const dateA = a.scheduleDate || '';
      const dateB = b.scheduleDate || '';
      return dateB.localeCompare(dateA);
    }).slice(0, 1); 
  }, [person, workOrders]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !person) return;
    setIsUploading(true);
    try {
        const storagePath = `personnelDocuments/${person.id}/${Date.now()}-${file.name}`;
        const { url, size } = await uploadFile(storagePath, file);
        const docData = {
            personnelId: person.id,
            name: file.name,
            type: (file.type.includes('image') ? 'img' : file.name.endsWith('.pdf') ? 'pdf' : 'doc') as 'pdf' | 'doc' | 'img',
            size,
            uploadedAt: new Date().toISOString(),
            uploader: 'System Admin',
            url,
        };
        await addDoc(collection(db, 'personnelDocuments'), docData);
        toast({
            title: "Document Registered",
            description: `${file.name} has been added to the personnel folder.`,
        });
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
    } finally {
        setIsUploading(false);
        e.target.value = '';
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
        await deleteDoc(doc(db, 'personnelDocuments', id));
        toast({
            variant: "destructive",
            title: "Asset Removed",
            description: "Document has been purged from the personnel registry.",
        });
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Deletion Failed', description: err.message });
    }
  };

  if (!person) return null;

  const initials = (person.name || 'U').split(' ').map(n => n[0]).join('') || 'U';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="lg:max-w-4xl bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
          <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
              <div className="flex items-start justify-between">
                  <div className="flex items-center gap-6 text-left">
                      <Avatar className="h-16 w-16 border-2 border-border-sub">
                          <AvatarImage src={person.avatarUrl} />
                          <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 text-left">
                          <div className="flex items-center gap-3">
                              <DialogTitle className="text-2xl font-bold uppercase tracking-wide text-text-primary">{person.name || 'Unnamed Operative'}</DialogTitle>
                              <Badge variant="active" className="text-[10px] h-5 px-3 uppercase tracking-widest">Active Profile</Badge>
                          </div>
                          <p className="text-sm text-text-muted font-bold uppercase tracking-[0.2em]">{person.role || 'Awaiting Allocation'}</p>
                           <div className="flex items-center gap-3 mt-2">
                               <span className="text-[10px] text-text-muted font-mono uppercase tracking-widest">{person.id}</span>
                               <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                               <div className="flex gap-1">
                                  {person.roles?.map(r => (
                                      <Badge key={r} variant="outline" className="text-[8px] uppercase h-4 bg-bg-primary">{r.replace(/_/g, ' ')}</Badge>
                                  ))}
                               </div>
                           </div>
                      </div>
                  </div>
                   <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 !text-[10px] uppercase font-bold tracking-widest" asChild>
                          <a href={`mailto:${person.email}`}><Mail size={14} className="mr-2"/> Email</a>
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 !text-[10px] uppercase font-bold tracking-widest" asChild>
                          <a href={`tel:${person.phone}`}><Phone size={14} className="mr-2"/> Call</a>
                      </Button>
                  </div>
              </div>
          </DialogHeader>

          <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 border-b border-border-sub bg-bg-secondary/30 text-left">
                  <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                      <TabsTrigger value="overview" className="tab-trigger-personnel">Overview</TabsTrigger>
                      {(isTechnician || isStaff) && <TabsTrigger value="reliability" className="tab-trigger-personnel">Reliability</TabsTrigger>}
                      {(isTechnician || isStaff) && <TabsTrigger value="documents" className="tab-trigger-personnel">Documents</TabsTrigger>}
                      <TabsTrigger value="schedule" className="tab-trigger-personnel">Schedule</TabsTrigger>
                      {isTechnician && <TabsTrigger value="assignments" className="tab-trigger-personnel">Assignments</TabsTrigger>}
                      <TabsTrigger value="notes" className="tab-trigger-personnel">Notes</TabsTrigger>
                      <TabsTrigger value="permissions" className="tab-trigger-personnel">Permissions</TabsTrigger>
                  </TabsList>
              </div>
              
              <ScrollArea className="flex-1">
                  <div className="p-6">
                      <TabsContent value="overview" className="m-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <section className="space-y-6 text-left">
                                  <div className="space-y-3">
                                      <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Core Identity</h3>
                                      <div className="grid grid-cols-[100px,1fr] gap-y-3 text-xs">
                                          <span className="text-text-muted font-bold uppercase">Official Email</span>
                                          <span className="text-text-primary truncate">
                                              {person.email ? <a href={`mailto:${person.email}`} className="hover:underline">{person.email}</a> : 'N/A'}
                                          </span>
                                          <span className="text-text-muted font-bold uppercase">Direct Line</span>
                                          <span className="text-text-primary">
                                              {person.phone ? <a href={`tel:${person.phone}`} className="hover:underline">{person.phone}</a> : 'N/A'}
                                          </span>
                                          <span className="text-text-muted font-bold uppercase">Base Address</span>
                                          <span className="text-text-primary">{person.address || 'N/A'}</span>
                                          {isClient && person.clientCompany && (
                                              <>
                                                  <span className="text-text-muted font-bold uppercase">Organization</span>
                                                  <span className="text-text-primary uppercase font-bold">{person.clientCompany}</span>
                                              </>
                                          )}
                                      </div>
                                  </div>

                                  {(isTechnician || isStaff) && person.emergencyContact && (
                                      <div className="space-y-3">
                                          <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center gap-2">
                                              <HeartPulse size={14}/> Emergency Protocol
                                          </h3>
                                          <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2">
                                              <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{person.emergencyContact.name}</p>
                                              <div className="flex items-center gap-4 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                                  <span>{person.emergencyContact.relation}</span>
                                                  <span>•</span>
                                                  <a href={`tel:${person.emergencyContact.phone}`} className="hover:underline hover:text-text-primary">{person.emergencyContact.phone}</a>
                                              </div>
                                          </div>
                                      </div>
                                  )}
                              </section>

                              {isTechnician && (
                                  <section className="space-y-6 text-left">
                                      <div className="space-y-3">
                                          <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Trust Index</h3>
                                          <div className="grid grid-cols-2 gap-4">
                                              <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Reliability Score</p>
                                                  <p className={cn("text-3xl font-mono font-bold", tierData.color)}>{person.reliabilityScore || 0}%</p>
                                                  <Badge variant={tierData.variant} className="text-[8px] h-4 uppercase">{tierData.tier}</Badge>
                                              </div>
                                              <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Active Workload</p>
                                                  <p className="text-3xl font-bold text-text-primary">{person.currentWorkload || 0}</p>
                                                  <p className="text-[9px] text-text-muted uppercase">Assignments</p>
                                              </div>
                                          </div>
                                          {/* HOURLY RATE ACTION SECTION */}
                                          <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between mt-4">
                                            <div className="text-left">
                                                <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">Project Base Rate</p>
                                                <div className="flex items-center gap-2">
                                                    <DollarSign size={14} className="text-text-green"/>
                                                    <p className="text-xl font-mono font-bold text-text-green">${(person.hourlyRate || 0).toFixed(2)} / hr</p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-8 !text-[9px] font-bold uppercase tracking-widest" onClick={onEdit}>
                                                <Pencil size={12} className="mr-1.5"/> Update Rate
                                            </Button>
                                          </div>
                                      </div>
                                      <div className="space-y-3">
                                          <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Specializations</h3>
                                          <div className="flex flex-wrap gap-2">
                                              {(person.skills || []).map(skill => (
                                                  <Badge key={skill} variant="outline" className="text-[9px] bg-bg-secondary border-border-sub text-text-primary h-6 px-3">{skill}</Badge>
                                              ))}
                                          </div>
                                      </div>
                                  </section>
                              )}
                          </div>
                      </TabsContent>

                      <TabsContent value="reliability" className="m-0 space-y-6 animate-in fade-in duration-300">
                          <div className="flex justify-between items-center mb-4 px-1">
                              <div className="space-y-1 text-left">
                                  <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Reliability Manifest</h3>
                                  <p className="text-[9px] text-text-muted uppercase font-bold italic tracking-tighter">Rolling 30-day window active for operational friction events.</p>
                              </div>
                              <Button className="h-8 !text-[10px] uppercase font-bold tracking-widest bg-brand-red text-white" onClick={() => setIsLogEventOpen(true)}>
                                  <Plus size={14} className="mr-1.5"/> Log Command Decision
                              </Button>
                          </div>

                          <div className="space-y-3">
                              {reliabilityEvents.map(event => {
                                  const isCritical = event.category === 'critical_failure';
                                  const isRecovery = event.category === 'positive_recovery';
                                  const isAutomatic = event.eventSource === 'automatic';
                                  return (
                                      <div key={event.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all text-left">
                                          <div className="flex items-center gap-6">
                                              <div className={cn(
                                                  "p-2 rounded-lg border",
                                                  isCritical ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                                                  isRecovery ? "bg-green-dim text-text-green border-green-border/30" : 
                                                  "bg-bg-primary text-text-secondary border border-border-sub"
                                              )}>
                                                  {isCritical ? <ShieldAlert size={20}/> : isRecovery ? <CheckCircle2 size={20}/> : <History size={20}/>}
                                              </div>
                                              <div className="text-left space-y-0.5">
                                                  <div className="flex items-center gap-2">
                                                      <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{event.eventType.replace(/_/g, ' ')}</p>
                                                      <Badge variant="outline" className="text-[8px] h-3.5 uppercase bg-bg-tertiary px-1">{event.category.replace(/_/g, ' ')}</Badge>
                                                      <Badge variant="outline" className={cn(
                                                          "text-[7px] h-3.5 uppercase tracking-tighter gap-1",
                                                          isAutomatic ? "bg-accent-gold-dim border-accent-gold/20 text-accent-gold" : "bg-bg-primary border-border-sub text-text-muted"
                                                      )}>
                                                          {isAutomatic ? <Settings size={8}/> : <User size={8}/>}
                                                          {event.eventSource}
                                                      </Badge>
                                                  </div>
                                                  <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{event.reason}&quot;</p>
                                                  <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                      {format(parseISO(event.createdAt), 'MMM d, yyyy')} · {isAutomatic ? 'System Generated' : `Decision by ${event.createdBy}`}
                                                  </p>
                                              </div>
                                          </div>
                                          <div className="text-right shrink-0 min-w-[80px]">
                                              <p className={cn(
                                                  "text-lg font-mono font-bold leading-none",
                                                  event.scoreChange > 0 ? "text-text-green" : "text-text-red"
                                              )}>
                                                  {event.scoreChange > 0 ? `+${event.scoreChange}` : event.scoreChange}
                                              </p>
                                          </div>
                                      </div>
                                  )
                              })}
                              {reliabilityEvents.length === 0 && (
                                  <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30">
                                      <Shield size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No operational reliability events logged</p>
                                  </div>
                              )}
                          </div>
                      </TabsContent>

                      <TabsContent value="documents" className="m-0 space-y-6 animate-in fade-in duration-300">
                          <div className="flex justify-between items-center mb-4 px-1">
                              <div className="space-y-1 text-left">
                                  <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Personnel Folder Registry</h3>
                                  <p className="text-[9px] text-text-muted uppercase font-bold italic tracking-tighter">Tactical storage for certs, IDs, and field credentials.</p>
                              </div>
                              <input 
                                  type="file" 
                                  ref={fileInputRef} 
                                  className="hidden" 
                                  onChange={handleFileChange}
                                />
                              <Button className="h-8 !text-[10px] uppercase font-bold tracking-widest bg-brand-red text-white" onClick={handleUploadClick} disabled={isUploading}>
                                  {isUploading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Upload size={14} className="mr-1.5" />}
                                  {isUploading ? 'Uploading...' : 'Upload Asset'}
                              </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {documents.map(doc => (
                                  <div key={doc.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                      <div className="flex items-center gap-4 overflow-hidden text-left">
                                          <div className={cn(
                                              "p-2.5 rounded-lg border",
                                              doc.type === 'pdf' ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                                              doc.type === 'img' ? "bg-green-dim text-text-green border-green-border/30" : 
                                              "bg-bg-primary text-text-secondary border border-border-sub"
                                          )}>
                                              {doc.type === 'img' ? <ImageIcon size={18}/> : <FileText size={18}/>}
                                          </div>
                                          <div className="min-w-0">
                                              <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[180px]">{doc.name}</p>
                                              <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                                                  {doc.size} · {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary" onClick={() => doc.url && window.open(doc.url, '_blank')}>
                                              <Download size={14}/>
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red" onClick={() => handleDeleteDoc(doc.id)}>
                                              <Trash2 size={14}/>
                                          </Button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </TabsContent>

                      <TabsContent value="schedule" className="m-0">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-4">
                                  <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-border-sub border-b pb-2 px-1 text-left">Weekly Availability</h3>
                                  <div className="space-y-2">
                                      {daysOfWeek.map(day => {
                                          const availability = person.availability?.[day.toLowerCase()];
                                          return (
                                              <div key={day} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                                  <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">{day}</span>
                                                  {availability ? (
                                                      <span className="font-mono text-[11px] font-bold text-text-green">{availability.start} - {availability.end}</span>
                                                  ) : (
                                                      <Badge variant="outline" className="text-[8px] uppercase bg-bg-tertiary">Unavailable</Badge>
                                                  )}
                                              </div>
                                          )
                                      })}
                                  </div>
                              </div>
                              <div className="space-y-4">
                                  <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center gap-2 text-left">
                                      <CalendarIcon size={14}/> Temporal Exceptions
                                  </h3>
                                  <div className="space-y-2">
                                      {(timeOffRequests || []).map((req) => (
                                          <div key={req.id} className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between text-left">
                                              <div className="space-y-1">
                                                  <p className="text-xs font-bold text-text-primary uppercase">{req.type}</p>
                                                  <p className="text-[10px] text-text-muted font-mono">{req.startDate} to {req.endDate}</p>
                                              </div>
                                              <Badge variant={req.status === 'approved' ? 'active' : req.status === 'denied' ? 'missed' : 'pending'}>{req.status.toUpperCase()}</Badge>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                           </div>
                      </TabsContent>

                      <TabsContent value="assignments" className="m-0 space-y-6">
                          <div className="space-y-4">
                              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-left">Most Recent Mission Registry</h3>
                              <div className="table-wrap p-0">
                                  <Table>
                                      <TableHeader className="bg-bg-tertiary">
                                          <TableRow className="hover:bg-transparent border-border-sub">
                                              <TableHead className="text-[10px] tracking-widest pl-6">Mission ID</TableHead>
                                              <TableHead className="text-[10px] tracking-widest text-left">Scope & Client</TableHead>
                                              <TableHead className="text-[10px] tracking-widest text-center">Status</TableHead>
                                              <TableHead className="text-right pr-6 text-[10px] tracking-widest">Settlement</TableHead>
                                          </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                          {personWorkOrders.map((wo) => (
                                              <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary transition-colors cursor-pointer">
                                                  <TableCell className="font-mono text-brand-red font-bold text-xs pl-6 text-left">{wo.id.toUpperCase()}</TableCell>
                                                  <TableCell className="text-left">
                                                      <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[250px]">{wo.description}</p>
                                                      <p className="text-[9px] text-text-muted uppercase tracking-widest">{wo.clientName}</p>
                                                  </TableCell>
                                                  <TableCell className="text-center">
                                                      <Badge variant={wo.status === 'completed' ? 'active' : wo.status === 'in-progress' ? 'inprogress' : 'onhold'} className="text-[8px] uppercase">
                                                          {wo.status}
                                                      </Badge>
                                                  </TableCell>
                                                  <TableCell className="text-right pr-6 font-mono font-bold text-text-primary">${wo.pay.toFixed(2)}</TableCell>
                                              </TableRow>
                                          ))}
                                          {personWorkOrders.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-32 text-center text-text-muted italic uppercase text-[10px] tracking-widest">No assignments on record.</TableCell>
                                            </TableRow>
                                          )}
                                      </TableBody>
                                  </Table>
                              </div>
                          </div>
                      </TabsContent>

                      <TabsContent value="notes" className="m-0 space-y-4">
                          <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Admin Notes</h3>
                          <div className="space-y-2">
                              <Textarea
                                  placeholder="Add a note about this personnel member..."
                                  value={newNoteText}
                                  onChange={(e) => setNewNoteText(e.target.value)}
                                  className="min-h-[80px] bg-bg-secondary border-border-main text-xs resize-none"
                                  onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleAddNote(); }}
                              />
                              <Button
                                  size="sm"
                                  className="h-8 text-[10px] uppercase font-bold tracking-widest"
                                  onClick={handleAddNote}
                                  disabled={!newNoteText.trim() || isSavingNote}
                              >
                                  <Plus size={13} className="mr-1.5" /> Add Note
                              </Button>
                          </div>
                          <div className="space-y-2 mt-4">
                              {notes.length === 0 && (
                                  <p className="text-[10px] text-text-muted uppercase tracking-widest py-6 text-center">No notes yet</p>
                              )}
                              {notes.map(note => (
                                  <div key={note.id} className="p-3 rounded-lg bg-bg-secondary border border-border-sub group relative">
                                      <div className="flex items-center justify-between mb-1.5">
                                          <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">{note.author}</span>
                                              <span className="text-[8px] text-text-muted">·</span>
                                              <span className="text-[9px] text-text-muted font-mono">
                                                  {format(new Date(note.createdAt), 'MM-dd-yyyy HH:mm')}
                                              </span>
                                          </div>
                                          <button
                                              onClick={() => handleDeleteNote(note.id)}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-brand-red"
                                          >
                                              <Trash2 size={12} />
                                          </button>
                                      </div>
                                      <p className="text-xs text-text-primary whitespace-pre-wrap">{note.text}</p>
                                  </div>
                              ))}
                          </div>
                      </TabsContent>

                      <TabsContent value="permissions" className="m-0 space-y-4">
                          <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1">
                              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Access & Permissions</h3>
                              <p className="text-[9px] text-text-muted uppercase">Overrides take precedence over role defaults</p>
                          </div>
                          <div className="space-y-1">
                              {ALL_PERMISSIONS.map(({ key, label }) => {
                                  const override = person?.permissionOverrides?.[key];
                                  const isOn = override === true ? true : override === false ? false : undefined;
                                  return (
                                      <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-bg-secondary transition-colors group">
                                          <div className="flex items-center gap-3">
                                              <Switch
                                                  checked={isOn === true}
                                                  onCheckedChange={() => handleTogglePermission(key, isOn)}
                                                  className="scale-75"
                                              />
                                              <div>
                                                  <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide">{label}</p>
                                                  <p className="text-[9px] text-text-muted font-mono">{key}</p>
                                              </div>
                                          </div>
                                          {isOn !== undefined && (
                                              <Badge variant={isOn ? 'active' : 'destructive'} className="text-[8px] uppercase h-4 px-1.5">
                                                  {isOn ? 'Override: ON' : 'Override: OFF'}
                                              </Badge>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      </TabsContent>
                  </div>
              </ScrollArea>
          </Tabs>

          <DialogFooter className="p-6 border-t border-border-sub bg-bg-tertiary/30">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Close</Button>
              <Button onClick={onEdit} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red text-white">
                  <Pencil size={14} className="mr-2"/> Modify Identity Registry
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogReliabilityEventDialog 
          isOpen={isLogEventOpen}
          setIsOpen={setIsLogEventOpen}
          person={person}
          onSave={() => {
              setIsLogEventOpen(false);
              toast({ title: "Registry Event Logged", description: "Operational reliability index has been updated." });
          }}
      />

      <style jsx global>{`
        .tab-trigger-personnel {
            @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
        }
        .tab-trigger-personnel[data-state="active"] {
            @apply text-text-primary border-brand-red bg-transparent shadow-none;
        }
      `}</style>
    </>
  );
}

function LogReliabilityEventDialog({ isOpen, setIsOpen, person, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, person: Technician, onSave: (evt: ReliabilityEvent) => void }) {
    const manualOptions = getManualEventOptions();
    const [selectedType, setSelectedType] = useState<string>("");
    const [reason, setReason] = useState("");
    const [assignmentId, setAssignmentId] = useState("");

    const handleSave = async () => {
        const option = manualOptions.find(o => o.type === selectedType);
        if (!option || !reason) return;

        const newEvent: ReliabilityEvent = {
            id: await createDocId(ID_PREFIXES.PENALTY_EVENT),
            techId: person.id,
            eventType: option.type,
            scoreChange: option.scoreChange,
            reason,
            relatedAssignmentId: assignmentId || undefined,
            createdAt: new Date().toISOString(),
            createdBy: 'System Admin', 
            eventSource: 'manual',
            category: option.category as any
        };

        onSave(newEvent);
        setSelectedType("");
        setReason("");
        setAssignmentId("");
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl">
                <DialogHeader className="text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <ActivityIcon size={14} className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Event Protocol</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs text-text-muted">Append an operational reliability event to technician <span className="text-text-primary font-bold">{person.name || 'Unnamed'}</span>.</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6 text-left">
                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Event Identification (Command Decision)</Label>
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="h-11 bg-bg-primary text-xs uppercase font-bold">
                                <SelectValue placeholder="Select tactical event type..." />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated max-h-[300px]">
                                {manualOptions.map(opt => (
                                    <SelectItem key={opt.type} value={opt.type} className="text-xs uppercase font-bold">
                                        <div className="flex justify-between items-center w-full gap-8 text-left">
                                            <span>{opt.label}</span>
                                            <span className={cn("font-mono", opt.scoreChange > 0 ? "text-text-green" : "text-text-red")}>
                                                ({opt.scoreChange > 0 ? `+${opt.scoreChange}` : opt.scoreChange})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Mission Context (Optional)</Label>
                        <Input 
                            placeholder="e.g. WO-18937" 
                            value={assignmentId}
                            onChange={e => setAssignmentId(e.target.value)}
                            className="h-11 bg-bg-primary text-xs font-mono uppercase"
                        />
                    </div>

                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Operational Intelligence / Reason</Label>
                        <Textarea 
                            placeholder="Provide full context for this audit entry..." 
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="bg-bg-primary min-h-[120px] text-xs leading-relaxed uppercase font-medium"
                        />
                    </div>
                </div>

                <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                    <Button 
                        disabled={!selectedType || !reason}
                        onClick={handleSave} 
                        className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white"
                    >
                        Commit to Ledger
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
