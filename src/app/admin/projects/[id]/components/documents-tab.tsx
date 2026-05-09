'use client';

import type { Project, ProjectDocument, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, Image as ImageIcon, Download, Trash2, FolderOpen, Milestone, Camera, Paperclip, Plus, User } from 'lucide-react';
import React from 'react';
import Image from 'next/image';

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
    <div className="doc-list small">
        {docs.length > 0 ? docs.map(doc => (
            <div key={doc.id} className="doc-row small">
                <div className="doc-icon small"><DocIcon type={doc.type} /></div>
                <div className="doc-info">
                    <div className="doc-name">{doc.name}</div>
                    <div className="doc-meta">
                        <span>{doc.size}</span>
                        <span className="flex items-center gap-1"><User size={10}/> {doc.uploader}</span>
                        <span>{doc.uploadDate}</span>
                    </div>
                </div>
                <div className="doc-actions">
                    <Button variant="outline" size="icon-sm" className="doc-btn"><Download size={13} /></Button>
                    <Button variant="outline" size="icon-sm" className="doc-btn"><Trash2 size={13} /></Button>
                </div>
            </div>
        )) : (
            <div className="empty-state !text-xs !py-2">No pre-site documents uploaded.</div>
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
        <div className="field-group !p-0">
             <header className="phase-header !py-3 !px-4">
                <div className="phase-num">{phase.phaseNumber}</div>
                <h4 className="phase-name">{phase.name}</h4>
             </header>
             <div className="p-4 space-y-4">
                <div>
                    <label className="field-label">Phase Notes</label>
                    <Textarea 
                        className="field-textarea" 
                        defaultValue={phase.notes}
                        placeholder="Add notes specific to this phase..."
                    />
                </div>

                <div>
                    <label className="field-label">Task Documentation (Photos)</label>
                    {requiredPhotoTasks.length > 0 ? (
                        <div className="space-y-4">
                            {requiredPhotoTasks.map(task => {
                                const taskPhotos = findPhotosForTask(task.id);
                                return (
                                    <div key={task.id} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-muted">
                                                <Camera size={14}/>
                                                <span className={task.isCompleted ? 'text-text-green' : ''}>{task.name}</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest">
                                                <Upload size={12} className="mr-1.5"/> Add Photo
                                            </Button>
                                        </div>
                                        
                                        {taskPhotos.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {taskPhotos.map(photo => (
                                                    <div key={photo.id} className="required-photo-row !bg-bg-tertiary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="relative h-10 w-10 rounded-md border border-border-default overflow-hidden">
                                                                {photo.url && <Image src={photo.url} alt={photo.name} fill className="object-cover" />}
                                                            </div>
                                                            <div className="text-[10px] min-w-0">
                                                                <div className="font-bold text-text-primary uppercase truncate">{photo.name}</div>
                                                                <div className="text-text-muted flex items-center gap-1 mt-0.5">
                                                                    <User size={10}/> {photo.uploader}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="outline" size="icon-sm" className="h-7 w-7"><Download size={12}/></Button>
                                                            <Button variant="outline" size="icon-sm" className="h-7 w-7 text-text-red hover:bg-brand-red-dim"><Trash2 size={12}/></Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center border border-dashed border-border-sub rounded-md bg-bg-primary/50">
                                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No evidence uploaded for this task</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                         <div className="empty-state !text-xs !py-2 !text-left !px-3">No tasks in this phase require photo documentation.</div>
                    )}
                </div>

                <div>
                    <label className="field-label">Phase Document Registry</label>
                    <div className="space-y-2">
                        {otherPhaseDocs.length > 0 ? otherPhaseDocs.map(doc => (
                             <div key={doc.id} className="doc-row small !py-2 !px-2">
                                <div className="doc-icon small !h-8 !w-8"><DocIcon type={doc.type} /></div>
                                <div className="doc-info">
                                    <div className="doc-name !text-sm">{doc.name}</div>
                                    <div className="doc-meta">
                                        <span>{doc.size}</span>
                                        <span className="flex items-center gap-1"><User size={10}/> {doc.uploader}</span>
                                    </div>
                                </div>
                                <div className="doc-actions">
                                    <Button variant="outline" size="icon-sm" className="doc-btn"><Download size={13} /></Button>
                                    <Button variant="outline" size="icon-sm" className="doc-btn"><Trash2 size={13} /></Button>
                                </div>
                            </div>
                        )) : (
                             <div className="empty-state !text-xs !py-2 !text-left !px-3">No additional documents for this phase.</div>
                        )}
                        <Button variant="dashed" size="sm" className="w-full !h-9 !text-xs">
                            <Paperclip size={14} className="mr-2" /> Upload to this phase
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
        <div>
            <div className="docs-toolbar">
                <div className="text-sm text-text-secondary">{documents.length} files uploaded</div>
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm">
                        <Plus size={14} className="mr-2"/> Add Pre-Site Doc
                    </Button>
                    <Button variant="default" size="sm">
                        <Upload size={14} className="mr-2"/> Upload to Phases
                    </Button>
                </div>
            </div>

            <div className="mb-6">
                <h3 className="field-group-title"><FolderOpen /> Pre-Site Documents</h3>
                <p className="body-text !text-sm mb-3 max-w-prose">Key project files like floor plans, contracts, and SOWs. Visible to admins and clients.</p>
                <PreSiteDocumentList docs={preSiteDocs} />
            </div>

            <div>
                 <h3 className="field-group-title"><Milestone /> Milestone Documents</h3>
                 <p className="body-text !text-sm mb-3 max-w-prose">Phase-specific notes, required photo sign-offs, and other documents uploaded by technicians from the field.</p>
                 <div className="space-y-4">
                    {project.phases.map(phase => (
                        <MilestoneDocuments key={phase.id} phase={phase} documents={documents} />
                    ))}
                 </div>
            </div>
        </div>
    );
}
