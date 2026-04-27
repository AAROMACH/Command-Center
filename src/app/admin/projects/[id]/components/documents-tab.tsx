'use client';

import type { ProjectDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, FileText, Image as ImageIcon, Download, Trash2, FolderOpen, Milestone } from 'lucide-react';
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

const DocumentList = ({ docs }: { docs: ProjectDocument[] }) => (
    <div className="doc-list">
        {docs.length > 0 ? docs.map(doc => (
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
            <div className="empty-state">No documents in this category.</div>
        )}
    </div>
);


export function DocumentsTab({ documents }: DocumentsTabProps) {
    const preSiteDocs = documents.filter(doc => ['Site Doc', 'Contract'].includes(doc.label));
    const milestoneDocs = documents.filter(doc => !preSiteDocs.some(psd => psd.id === doc.id));
    
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

            <div className="mt-6">
                <h3 className="field-group-title"><FolderOpen /> Pre-Site Documents</h3>
                <DocumentList docs={preSiteDocs} />
            </div>

            <div className="mt-6">
                 <h3 className="field-group-title"><Milestone /> Milestone Documents</h3>
                 <p className="body-text !text-sm mb-3 max-w-prose">Photos and sign-offs attached to specific milestone tasks will appear here automatically as they are completed by technicians.</p>
                <DocumentList docs={milestoneDocs} />
            </div>
        </div>
    );
}
