'use client';

import type { Project, ProjectDocument, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, Image as ImageIcon, Download, Trash2, FolderOpen, Milestone, Camera, Paperclip, Plus, User } from 'lucide-react';
import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type DocumentsTabProps = {
    project: Project;
    documents: ProjectDocument[];
};

const DocIcon = ({ type }: { type: ProjectDocument['type'] }) => {
    if (type === 'pdf') return <FileText className="text-[#FF6644]"/>;
    if (type === 'img') return <ImageIcon className="text-text-green"/>;
    if (type === 'doc') return <FileText className="text-[#4488DD]"/>;
    return <FileText />;
};

const PreSiteDocumentList = ({ docs }: { docs: ProjectDocument[] }) => (
    <div className="doc-list small border border-border-sub rounded-md bg-bg-secondary/30">
        {docs.length > 0 ? docs.map(doc => (
            <div key={doc.id} className="doc-row small !py-1.5 !px-2 border-b border-border-sub last:border-none flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <div className="doc-icon small !h-6 !w-6 !bg-bg-tertiary flex items-center justify-center rounded border border-border-sub">
                        <DocIcon type={doc.type} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[11px] font-bold text-text-primary uppercase truncate">{doc.name}</div>
                        <div className="flex items-center gap-2 text-[8px] text-text-muted font-bold uppercase tracking-widest">
                            <span>{doc.size}</span>
                            <span className="flex items-center gap-1"><User size={8}/> {doc.uploader}</span>
                            <span>{doc.uploadDate}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary"><Download size={12} /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-red"><Trash2 size={12} /></Button>
                </div>
            </div>
        )) : (
            <div className="p-4 text-center">
                <p className="text-[9px] text-text-muted uppercase font-bold tracking-[0.2em] italic">Registry Clear: No pre-site documents</p>
            </div>
        )}
    </div>
);

const MilestoneDocuments = ({ phase, documents }: { phase: Phase, documents: ProjectDocument[] }) => {
    const requiredPhotoTasks = phase.tasks.filter(task => task.requiresPhoto);

    const findPhotosForTask = (taskId: string) => {
        return documents.filter(doc => doc.taskId === taskId && doc.type === 'img');
    };
    
    const otherPhaseDocs = documents.filter(doc => doc.phaseId === phase.id && !doc.taskId);

    return (
        <div className="field-group !p-0 overflow-hidden border border-border-sub bg-bg-secondary/50">
             <header className="bg-bg-tertiary/50 !py-2 !px-4 border-b border-border-sub flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-brand-red text-[8px] font-bold text-white flex items-center justify-center">{phase.phaseNumber}</div>
                    <h4 className="text-[10px] font-bold text-text-primary uppercase tracking-wider">{phase.name}</h4>
                </div>
                <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">{requiredPhotoTasks.length} Documentation Targets</span>
             </header>
             <div className="p-4 space-y-4">
                <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted block mb-1.5">Operational Intelligence / Notes</label>
                    <Textarea 
                        className="min-h-[60px] text-[11px] bg-bg-primary border-border-sub focus:border-brand-red resize-none" 
                        defaultValue={phase.notes}
                        placeholder="Add tactical notes for this phase..."
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted block border-b border-border-sub/30 pb-1">Field Documentation Feed</label>
                    {requiredPhotoTasks.length > 0 ? (
                        <div className="space-y-4">
                            {requiredPhotoTasks.map(task => {
                                const taskPhotos = findPhotosForTask(task.id);
                                return (
                                    <div key={task.id} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <div className={cn("h-1.5 w-1.5 rounded-full", task.isCompleted ? "bg-text-green" : "bg-text-muted")} />
                                                <span className={cn("text-[10px] font-bold uppercase tracking-tight", task.isCompleted ? 'text-text-primary' : 'text-text-muted')}>{task.name}</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-6 text-[8px] uppercase font-bold tracking-widest px-2">
                                                <Upload size={10} className="mr-1"/> Add Evidence
                                            </Button>
                                        </div>
                                        
                                        {taskPhotos.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                {taskPhotos.map(photo => (
                                                    <div key={photo.id} className="group relative aspect-video rounded border border-border-sub bg-bg-primary overflow-hidden">
                                                        <Image src={photo.url || ''} alt={photo.name} fill className="object-cover transition-transform group-hover:scale-110" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                                                            <p className="text-[7px] text-white font-bold uppercase truncate">{photo.name}</p>
                                                            <p className="text-[6px] text-text-secondary flex items-center gap-1"><User size={8}/> {photo.uploader}</p>
                                                            <div className="flex gap-1 mt-1">
                                                                <button className="p-1 rounded bg-white/10 hover:bg-white/20 text-white"><Download size={8}/></button>
                                                                <button className="p-1 rounded bg-brand-red/20 hover:bg-brand-red/40 text-brand-red"><Trash2 size={8}/></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-3 text-center border border-dashed border-border-sub rounded bg-bg-primary/20">
                                                <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest italic">Awaiting verification imagery</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                         <div className="p-3 text-center border border-dashed border-border-sub rounded text-[9px] text-text-muted font-bold uppercase tracking-widest opacity-60">No task documentation targets</div>
                    )}
                </div>

                <div className="pt-2 border-t border-border-sub/30">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted block mb-2">Phase Assets</label>
                    <div className="space-y-1">
                        {otherPhaseDocs.length > 0 ? otherPhaseDocs.map(doc => (
                             <div key={doc.id} className="flex items-center justify-between p-1.5 rounded bg-bg-primary border border-border-sub hover:border-text-muted transition-colors">
                                <div className="flex items-center gap-2 overflow-hidden flex-1">
                                    <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center text-text-muted">
                                        <DocIcon type={doc.type} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold text-text-primary uppercase truncate">{doc.name}</div>
                                        <div className="text-[8px] text-text-muted font-bold flex items-center gap-2">
                                            <span>{doc.size}</span>
                                            <span>•</span>
                                            <span>{doc.uploader}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6"><Download size={10} /></Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-red"><Trash2 size={10} /></Button>
                                </div>
                            </div>
                        )) : (
                             <p className="text-[8px] text-text-muted uppercase font-bold italic tracking-widest mb-2">No additional technical assets for this phase</p>
                        )}
                        <Button variant="outline" size="sm" className="w-full !h-7 !text-[8px] border-dashed border-border-sub hover:bg-bg-tertiary font-bold uppercase tracking-widest">
                            <Paperclip size={10} className="mr-1.5" /> Upload to this phase
                        </Button>
                    </div>
                </div>

             </div>
        </div>
    )
}


export function DocumentsTab({ project, documents }: DocumentsTabProps) {
    const preSiteDocs = documents.filter(doc => !doc.phaseId);
    
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between bg-bg-secondary/30 p-3 rounded-lg border border-border-sub">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-red-dim rounded border border-brand-red/20 text-brand-red">
                        <FolderOpen size={16} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Registry Density</p>
                        <p className="text-xs font-bold text-text-primary uppercase">{documents.length} Technical Assets Archived</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 !text-[9px] font-bold uppercase tracking-widest">
                        <Plus size={12} className="mr-1.5"/> Pre-Site Doc
                    </Button>
                    <Button variant="default" size="sm" className="h-8 !text-[9px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover">
                        <Upload size={12} className="mr-1.5"/> Batch Phase Upload
                    </Button>
                </div>
            </div>

            <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red flex items-center gap-2 mb-3 px-1">
                    <FileText size={14}/>
                    Strategic Repository
                </h3>
                <PreSiteDocumentList docs={preSiteDocs} />
            </div>

            <div className="space-y-4">
                 <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-red flex items-center gap-2 mb-1 px-1">
                    <Milestone size={14}/>
                    Tactical Phase Verification
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {project.phases.map(phase => (
                        <MilestoneDocuments key={phase.id} phase={phase} documents={documents} />
                    ))}
                 </div>
            </div>
        </div>
    );
}