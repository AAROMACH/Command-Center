
'use client';

import { PageLoading } from '@/components/empty-state';
import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { notFound, useParams } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';
import { ProjectDetailClient as ManagerProjectDetail } from '@/app/admin/projects/[id]/components/project-detail-client';
import { useDirectory } from '@/hooks/use-directory';
import { useAuth } from '@/contexts/auth-context';
import { canLeadProject, canManageProjects, isOnProject, isAssignedManager } from '@/lib/project-access';
import type { Project, Technician, ProjectDailyLog, ProjectDocument } from '@/lib/types';

/**
 * @fileOverview Tech view of an assigned project.
 */
export default function TechProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [dailyLogs, setDailyLogs] = useState<ProjectDailyLog[]>([]);
  // Crew names/avatars (techs can't read `users`; this used to be empty).
  const technicians = useDirectory();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  // Project Managers run the project with the office tools (no pay); a PM
  // who is also on the crew can flip to the field view to check in.
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<'manage' | 'field'>('manage');

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

    // 4. Document Registry Handshake
    const docQ = query(collection(db, 'projectDocuments'), where('projectId', '==', id), orderBy('uploadDate', 'desc'));
    const unsubDocs = onSnapshot(docQ, (snap) => {
        setDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDocument)));
    });

    return () => {
      unsubProject();
      unsubLogs();
      unsubDocs();
    };
  }, [id]);

  // Wait for the signed-in user too: lead/PM tools depend on who it is.
  if (loading || authLoading) {
      return <PageLoading label="Loading project…" />;
  }
  
  if (!project) {
    return notFound();
  }

  // PMs (the role), and whoever is this project's Project Manager on its team,
  // get the Manage view — edit project, team, phases — right here.
  const isPM = canManageProjects(user) || isAssignedManager(project, user?.id);
  const onCrew = isOnProject(project, user?.id);
  const switcher = isPM && onCrew && (
    <div className="flex justify-end mb-3">
      <div className="tabs !mb-0 flex-nowrap" role="tablist">
        {(['manage', 'field'] as const).map(v => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`tab ${view === v ? 'active' : ''}`}>
            {v === 'manage' ? 'Manage' : 'Field view'}
          </button>
        ))}
      </div>
    </div>
  );

  if (isPM && (view === 'manage' || !onCrew)) {
    return (
      <>
        {switcher}
        <ManagerProjectDetail
          mode="manager"
          project={project}
          technicians={technicians}
          documents={documents}
          timesheets={dailyLogs}
        />
      </>
    );
  }

  return (
    <>
      {switcher}
      <ProjectDetailClient 
          project={project}
          dailyLogs={dailyLogs}
          technicians={technicians}
          documents={documents}
          canLead={canLeadProject(user, project)}
          isManager={isAssignedManager(project, user?.id)}
      />
    </>
  );
}
