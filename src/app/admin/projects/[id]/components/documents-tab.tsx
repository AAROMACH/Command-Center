'use client';

import type { ProjectDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, FileText, Image as ImageIcon, Download, Trash2 } from 'lucide-react';
import React from 'react';

type DocumentsTabProps = {
    documents: ProjectDocument[];
};

const DocIcon = ({type}: {type: ProjectDocument['type']}) => {
    if (type === 'pdf') return <FileText/>
    if (type === 'img') return <ImageIcon/>
    if (type === 'doc') return <FileText/>
    return <FileText/>
}

export function DocumentsTab({ documents }: DocumentsTabProps) {
    
    return (
        <div>
            <div className="docs-toolbar">
                <div className="text-sm text-text-secondary">{documents.length} files uploaded</div>
                <Button variant="default" size="sm">
                    <Upload size={14} className="mr-2"/> Upload File
                </Button>
            </div>
            
            <div className="upload-zone">
                <Upload size={28} className="text-text-muted mb-2"/>
                <div className="upload-zone-text">Drop files here or click to upload</div>
                <div className="upload-zone-sub">PDF, images, Word docs — any file type accepted</div>
            </div>

            <div className="doc-list">
                {documents.length > 0 ? documents.map(doc => (
                    <div key={doc.id} className="doc-row">
                        <div className={`doc-icon ${doc.type}`}><DocIcon type={doc.type}/></div>
                        <div className="doc-info">
                            <div className="doc-name">{doc.name}</div>
                            <div className="doc-meta">
                                <span className="doc-label">{doc.label}</span>
                                <span>Uploaded by {doc.uploader}</span>
                                <span>{doc.uploadDate}</span>
                            </div>
                        </div>
                        <div className="doc-size">{doc.size}</div>
                        <div className="doc-actions">
                            <Button variant="outline" size="sm" className="doc-btn"><Download size={13} className="mr-1.5"/>Download</Button>
                            <Button variant="outline" size="icon-sm" className="doc-btn"><Trash2 size={13}/></Button>
                        </div>
                    </div>
                )) : (
                    <div className="empty-state">No documents uploaded yet.</div>
                )}
            </div>
        </div>
    );
}
