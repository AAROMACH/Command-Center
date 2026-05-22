
'use client';

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { notFound, useParams } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';
import type { Project, Technician, ProjectDailyLog, ProjectDocument } from '@/lib/types';

/**
 * @fileOverview Field Terminal for Assigned Project Oversight.
 */
export default function TechProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [dailyLogs, setDailyLogs] = useState<ProjectDailyLog[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    // 1. Mission Registry Handshake
    const unsubProject = onSnapshot(doc(db, 'projects', id), (docSnap) => {
      if (docSnap.exists()) {
        setProject({ ...docSnap.data(), id: docSnap.id } as Project);
      }
      setLoading(false);
    });

    // 2. Timesheet Registry Handshake
    const logQ = query(collection(db, 'projectDailyLogs'), where('projectId', '==', id), orderBy('date', 'desc'));
    const unsubLogs = onSnapshot(logQ, (snap) => {
      setDailyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDailyLog)));
    });

    // 3. Personnel Registry Handshake
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });

    // 4. Document Registry Handshake
    const docQ = query(collection(db, 'projectDocuments'), where('projectId', '==', id), orderBy('uploadDate', 'desc'));
    const unsubDocs = onSnapshot(docQ, (snap) => {
        setDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDocument)));
    });

    return () => {
      unsubProject();
      unsubLogs();
      unsubTech();
      unsubDocs();
    };
  }, [id]);

  if (loading) {
      return (
          <div className="flex h-[400px] items-center justify-center">
              <div className="text-center space-y-4">
                  <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Synchronizing Field Folder...</p>
              </div>
          </div>
      );
  }
  
  if (!project) {
    return notFound();
  }

  return (
    <ProjectDetailClient 
        project={project}
        dailyLogs={dailyLogs}
        technicians={technicians}
        documents={documents}
    />
  );
}
