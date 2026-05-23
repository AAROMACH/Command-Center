'use client';

import type { Project, ProjectDocument, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Download, 
  Trash2, 
  Milestone, 
  Plus, 
  User, 
  FileSpreadsheet,
  ShieldCheck,
  Check,
  X,
  Type
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type DocumentsTabProps = {
    project: Project;
    documents: ProjectDocument[];
};

const DocIcon = ({ type }: { type: ProjectDocument['type'] }) => {
    if (type === 'pdf') return <FileText className="text-[#FF6644]"/>;
    if (type === 'img') return <ImageIcon className="text-text-green"/>;
    if (type === 'doc') return <FileText className="text-[#4488DD]"/>;
    if (type === 'csv') return <FileSpreadsheet className="text-text-green"/>;
    return <FileText className="text-text-muted"/>;
};

export function DocumentsTab({ project, documents }: DocumentsTabProps) {
    const { toast } = useToast();
    const [pendingDownload, setPendingDownload] = useState<ProjectDocument | null>(null);
    const [isConfirmDownloadOpen, setIsConfirmDownloadOpen] = useState(false);
    
    // Naming Dialog State
    const [isNamingOpen, setIsNamingOpen] = useState(false);
    const [customName, setCustomName] = useState("");
    const [pendingUpload, setPendingUpload] = useState<{
        file: File;
        phaseId?: string;
        taskId?: string;
    } | null>(null);

    const preSiteDocs = documents.filter(doc => !doc.phaseId);

    const handleFileSelect = (file: File, phaseId?: string, taskId?: string) => {
        if (file.size > 10 * 1024 * 1024) {
            toast({
                variant: 'destructive',
                title: 'Payload Error',
                description: 'File size exceeds the 10MB security threshold.',
            });
            return;
        }
        setPendingUpload({ file, phaseId, taskId });
        setCustomName("");
        setIsNamingOpen(true);
    };

    const handleExecuteUpload = async () => {
        if (!pendingUpload) return;
        const { file, phaseId, taskId } = pendingUpload;

        const extension = file.name.split('.').pop()?.toLowerCase();
        let type: ProjectDocument['type'] = 'other';
        if (extension === 'pdf') type = 'pdf';
        else if (['jpg', 'jpeg', 'png', 'webp'].includes(extension || '')) type = 'img';
        else if (['doc', 'docx', 'txt'].includes(extension || '')) type = 'doc';
        else if (extension === 'csv') type = 'csv';
        
        const displayName = customName.trim() || file.name;
        
        const docData: any = {
            projectId: project.id,
            name: displayName,
            originalName: file.name,
            type: type,
            label: taskId ? 'Completion Evidence' : phaseId ? 'Phase Asset' : 'Pre-Site Document',
            uploader: 'System Admin',
            uploadDate: format(new Date(), 'MM-dd-yyyy'),
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            url: URL.createObjectURL(file), 
        };

        if (phaseId) docData.phaseId = phaseId;
        if (taskId) docData.taskId = taskId;

        try {
            await addDoc(collection(db, 'projectDocuments'), docData);
            toast({
                title: "Registry Handshake Successful",
                description: `${displayName} has been synchronized with the project registry.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: e.message });
        } finally {
            setIsNamingOpen(false);
            setPendingUpload(null);
        }
    };

    const handleDeleteDoc = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'projectDocuments', id));
            toast({ variant: "destructive", title: "Asset Deleted", description: "Document removed from project registry." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
        }
    };

    const initiateDownload = (doc: ProjectDocument) => {
        setPendingDownload(doc);
        setIsConfirmDownloadOpen(true);
    };

    const executeDownload = () => {
        if (!pendingDownload) return;
        
        const link = document.createElement('a');
        link.href = pendingDownload.url || '';
        link.download = pendingDownload.originalName || pendingDownload.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
            title: "Download Executed",
            description: `${pendingDownload.name} successfully transmitted to device.`,
        });
        
        setIsConfirmDownloadOpen(false);
        setPendingDownload(null);
    };

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red flex items-center gap-2">
                        <FileText size={14}/>
                        Pre-Site Documents
                    </h3>
                    <label className="cursor-pointer">
                        <Input 
                            type="file" 
                            className="hidden" 
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        />
                        <div className="inline-flex h-6 items-center gap-1 rounded border border-border-sub bg-bg-secondary px-2 text-[8px] font-bold uppercase tracking-widest hover:bg-bg-tertiary transition-colors">
                            <Plus size={10} className="mr-1"/> Add Document
                        </div>
                    </label>
                </div>
                
                <div className="doc-list small border border-border-sub rounded-md bg-bg-secondary/30">
                    {preSiteDocs.length > 0 ? preSiteDocs.map(doc => {
                        const hasAlias = doc.originalName && doc.originalName !== doc.name;
                        return (
                            <div key={doc.id} className="doc-row small !py-2 !px-3 border-b border-border-sub last:border-none flex items-center justify-between">
                                <div className="flex items-center gap-3 overflow-hidden flex-1 text-left">
                                    <div className="doc-icon small !h-6 !w-6 !bg-bg-tertiary flex items-center justify-center rounded border border-border-sub">
                                        <DocIcon type={doc.type} />
                                    </div>
                                    <div className="min-w-0 text-left">
                                        <div className="text-[11px] font-bold text-text-primary uppercase truncate">{doc.name}</div>
                                        {hasAlias && (
                                            <div className="text-[8px] text-text-muted font-medium truncate opacity-60 italic">{doc.originalName}</div>
                                        )}
                                        <div className="flex items-center gap-2 text-[7px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                                            <span>{doc.size}</span>
                                            <span className="flex items-center gap-0.5"><User size={7}/> {doc.uploader}</span>
                                            <span>{doc.uploadDate}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary" onClick={() => initiateDownload(doc)}><Download size={12} /></Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-red" onClick={() => handleDeleteDoc(doc.id)}><Trash2 size={12} /></Button>
                                </div>
                            </div>
                        )
                    }) : (
                        <div className="p-3 text-center">
                            <p className="text-[8px] text-text-muted uppercase font-bold tracking-[0.2em] italic">Registry Clear: No pre-site documents</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                 <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red flex items-center gap-2 px-1">
                    <Milestone size={14}/>
                    Phase Verification
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-left">
                    {(project.phases || []).map(phase => (
                        <MilestoneDocuments 
                            key={phase.id} 
                            phase={phase} 
                            documents={documents} 
                            onDelete={handleDeleteDoc} 
                            onUpload={handleFileSelect} 
                            onDownload={initiateDownload}
                        />
                    ))}
                 </div>
            </div>

            {/* ASSET NAMING TERMINAL */}
            <Dialog open={isNamingOpen} onOpenChange={setIsNamingOpen}>
                <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Type className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Asset Identification</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Optionally provide a descriptive identifier for this registry asset.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4 text-left">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Asset Alias (Optional)</Label>
                            <Input 
                                placeholder="e.g. Main Lobby Wiring Diagram" 
                                value={customName}
                                onChange={e => setCustomName(e.target.value)}
                                className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wide"
                                autoFocus
                            />
                        </div>
                        <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub space-y-1">
                            <p className="text-[8px] font-black text-text-muted uppercase">Original Filename</p>
                            <p className="text-[10px] font-mono text-text-primary truncate">{pendingUpload?.file.name}</p>
                        </div>
                    </div>
                    <DialogFooter className="p-6 border-t border-border-default bg-bg-tertiary/30 gap-3">
                        <Button variant="outline" onClick={() => setIsNamingOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Discard</Button>
                        <Button onClick={handleExecuteUpload} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">
                            <Upload size={16} className="mr-2"/> Commit Asset
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DOWNLOAD CONFIRMATION TERMINAL */}
            <AlertDialog open={isConfirmDownloadOpen} onOpenChange={setIsConfirmDownloadOpen}>
                <AlertDialogContent className="bg-bg-elevated border-border-default shadow-2xl">
                    <AlertDialogHeader className="text-left">
                        <AlertDialogTitle className="uppercase tracking-widest font-bold flex items-center gap-2">
                            <ShieldCheck className="text-text-green" size={18}/>
                            Authorize Asset Transfer
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs leading-relaxed uppercase font-medium">
                            Operational Action: This will transmit <span className="text-text-primary font-bold">{pendingDownload?.name}</span> from the project registry to your local device storage.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3">
                        <AlertDialogCancel className="text-[10px] font-bold uppercase tracking-widest h-10 px-6">Abort</AlertDialogCancel>
                        <AlertDialogAction onClick={executeDownload} className="bg-brand-red hover:bg-brand-red-hover text-[10px] font-bold uppercase tracking-widest h-10 px-8 text-white">
                            <Download size={14} className="mr-2"/> Confirm Download
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function MilestoneDocuments({ 
    phase, 
    documents, 
    onDelete, 
    onUpload,
    onDownload
}: { 
    phase: Phase, 
    documents: ProjectDocument[], 
    onDelete: (id: string) => void, 
    onUpload: (file: File, phaseId?: string, taskId?: string) => void,
    onDownload: (doc: ProjectDocument) => void
}) {
    const requiredPhotoTasks = (phase.tasks || []).filter(task => task.requiresPhoto);

    const findPhotosForTask = (taskId: string) => {
        return documents.filter(doc => doc.taskId === taskId && doc.type === 'img');
    };
    
    const otherPhaseDocs = documents.filter(doc => doc.phaseId === phase.id && !doc.taskId);

    return (
        <div className="field-group !p-0 overflow-hidden border border-border-sub bg-bg-secondary/50">
             <header className="bg-bg-tertiary/50 !py-1.5 !px-3 border-b border-border-sub flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 rounded-full bg-brand-red text-[7px] font-bold text-white flex items-center justify-center">{phase.phaseNumber}</div>
                    <h4 className="text-[9px] font-bold text-text-primary uppercase tracking-wider truncate max-w-[120px]">{phase.name}</h4>
                </div>
                <span className="text-[7px] font-bold text-text-muted uppercase tracking-widest">{requiredPhotoTasks.length} Targets</span>
             </header>
             <div className="p-3 space-y-3">
                <div className="space-y-2">
                    <label className="text-[8px] font-bold uppercase tracking-widest text-text-muted block border-b border-border-sub/30 pb-0.5">Field Documentation Feed</label>
                    {requiredPhotoTasks.length > 0 ? (
                        <div className="space-y-3">
                            {requiredPhotoTasks.map(task => {
                                const taskPhotos = findPhotosForTask(task.id);
                                return (
                                    <div key={task.id} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <div className={cn("h-1 w-1 rounded-full", task.isCompleted ? "bg-text-green" : "bg-text-muted")} />
                                                <span className={cn("text-[9px] font-bold uppercase tracking-tight", task.isCompleted ? 'text-text-primary' : 'text-text-muted')}>{task.name}</span>
                                            </div>
                                            <label className="cursor-pointer">
                                                <Input 
                                                    type="file" 
                                                    className="hidden" 
                                                    onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0], phase.id, task.id)}
                                                    accept="image/*"
                                                />
                                                <div className="inline-flex h-5 items-center gap-1 rounded border border-border-sub bg-bg-primary px-1.5 text-[7px] font-bold uppercase tracking-widest hover:bg-bg-tertiary transition-colors">
                                                    <Plus size={8} className="mr-0.5"/> Photo
                                                </div>
                                            </label>
                                        </div>
                                        
                                        {taskPhotos.length > 0 ? (
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {taskPhotos.map(photo => {
                                                    const hasAlias = photo.originalName && photo.originalName !== photo.name;
                                                    return (
                                                        <div key={photo.id} className="group relative aspect-video rounded border border-border-sub bg-bg-primary overflow-hidden">
                                                            <Image src={photo.url || ''} alt={photo.name} fill className="object-cover transition-transform group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1">
                                                                <p className="text-[6px] text-white font-bold uppercase truncate">{photo.name}</p>
                                                                {hasAlias && (
                                                                    <p className="text-[5px] text-white/60 truncate italic leading-none">{photo.originalName}</p>
                                                                )}
                                                                <p className="text-[5px] text-text-muted flex items-center gap-0.5 mt-0.5"><User size={6}/> {photo.uploader}</p>
                                                                <div className="flex gap-1 mt-0.5">
                                                                    <button className="p-0.5 rounded bg-white/10 hover:bg-white/20 text-white" onClick={() => onDownload(photo)}><Download size={6}/></button>
                                                                    <button className="p-0.5 rounded bg-brand-red/20 hover:bg-brand-red/40 text-brand-red" onClick={() => onDelete(photo.id)}><Trash2 size={6}/></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-1.5 text-center border border-dashed border-border-sub rounded bg-bg-primary/20">
                                                <p className="text-[7px] text-text-muted uppercase font-bold tracking-widest italic">Awaiting evidence</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                         <div className="p-2 text-center border border-dashed border-border-sub rounded text-[8px] text-text-muted font-bold uppercase tracking-widest opacity-60">No documentation targets</div>
                    )}
                </div>

                <div className="pt-1.5 border-t border-border-sub/30">
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[8px] font-bold uppercase tracking-widest text-text-muted">Phase Assets</label>
                        <label className="cursor-pointer">
                            <Input 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0], phase.id)}
                            />
                            <div className="inline-flex h-5 items-center gap-1 rounded border border-border-sub bg-bg-primary px-1.5 text-[7px] font-bold uppercase tracking-widest hover:bg-bg-tertiary transition-colors">
                                Upload
                            </div>
                        </label>
                    </div>
                    <div className="space-y-1">
                        {otherPhaseDocs.length > 0 ? otherPhaseDocs.map(doc => {
                             const hasAlias = doc.originalName && doc.originalName !== doc.name;
                             return (
                                <div key={doc.id} className="flex items-center justify-between p-1.5 rounded bg-bg-primary border border-border-sub hover:border-text-muted transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 text-left">
                                        <div className="h-5 w-5 flex-shrink-0 flex items-center justify-center text-text-muted">
                                            <DocIcon type={doc.type} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-bold text-text-primary uppercase truncate">{doc.name}</div>
                                            {hasAlias && (
                                                <div className="text-[7px] text-text-muted truncate opacity-60 italic leading-none">{doc.originalName}</div>
                                            )}
                                            <div className="text-[7px] text-text-muted font-bold flex items-center gap-1.5 mt-0.5">
                                                <span>{doc.size}</span>
                                                <span>•</span>
                                                <span className="truncate">{doc.uploader}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-0.5">
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onDownload(doc)}><Download size={8} /></Button>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-text-red" onClick={() => onDelete(doc.id)}><Trash2 size={8} /></Button>
                                    </div>
                                </div>
                            )
                        }) : (
                             <p className="text-[7px] text-text-muted uppercase font-bold italic tracking-widest mb-1 px-1">No phase assets</p>
                        )}
                    </div>
                </div>
             </div>
        </div>
    )
}