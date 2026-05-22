
'use client';

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { notFound, useParams } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';
import type { Project, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';

/**
 * @fileOverview Operational Terminal for Project Detail Audit.
 * Synchronizes with Firestore to provide real-time visibility into mission progress.
 */
export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    // 1. Establish Real-time Project Link
    const unsubProject = onSnapshot(doc(db, 'projects', id), (docSnap) => {
      if (docSnap.exists()) {
        setProject({ ...docSnap.data(), id: docSnap.id } as Project);
      }
      setLoading(false);
    });

    // 2. Establish Personnel Registry Link
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });

    return () => {
      unsubProject();
      unsubTech();
    };
  }, [id]);

  if (loading) {
      return (
          <div className="flex h-[400px] items-center justify-center">
              <div className="text-center space-y-4">
                  <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Accessing Registry Folder...</p>
              </div>
          </div>
      );
  }

  if (!project) {
    return notFound();
  }

  // Placeholder arrays for sub-registries - in a real app these would also be Firestore listeners
  const documentsForProject: ProjectDocument[] = [];
  const timesheetsForProject: TimesheetLog[] = [];

  return (
    <ProjectDetailClient 
        project={project}
        technicians={technicians}
        documents={documentsForProject}
        timesheets={timesheetsForProject}
    />
  );
}
