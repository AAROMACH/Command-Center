'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { doc, setDoc } from 'firebase/firestore';
import { useDirectory } from '@/hooks/use-directory';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { canManageProjects, isOnProject } from '@/lib/project-access';
import { NewProjectDialog } from '@/app/admin/projects/components/new-project-dialog';
import type { Project } from '@/lib/types';
import { Briefcase, Search, LayoutList, LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsClient } from './components/projects-client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TechProjectsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    // Crew names/avatars (techs can't read `users`; this used to be empty).
    const technicians = useDirectory();
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    // A Project Manager sees every project (and can start one); everyone
    // else sees the projects they're on.
    const { user } = useAuth();
    const { toast } = useToast();
    const isPM = canManageProjects(user);
    const [scope, setScope] = useState<'all' | 'mine'>('all');
    const [newOpen, setNewOpen] = useState(false);
    const handleNewProject = async (p: Project) => {
        try {
            await setDoc(doc(db, 'projects', p.id), { ...p });
            toast({ title: 'Project created', description: `${p.name} is ready to staff.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not create project', description: e.message });
        }
    };

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            // Live listener for projects where this tech is part of the team
            const unsubProj = onSharedSnapshot('projects', (snap) => {
                const projects = snap.docs.map(d => ({ ...d.data(), id: d.id } as Project));
                // We filter client-side for immediate reactivity to team changes
                setAllProjects(projects);
            });

            return () => { unsubProj(); };
        }
    }, []);

    const techProjects = useMemo(() => {
        if (!currentTechId) return [];
        return allProjects
            .filter(p => (isPM && scope === 'all') || isOnProject(p, currentTechId))
            .filter(p => 
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [allProjects, currentTechId, searchQuery, isPM, scope]);

    const activeProjects = techProjects.filter(p => p.status === 'active');
    const onHoldProjects = techProjects.filter(p => p.status === 'on-hold');
    const completedProjects = techProjects.filter(p => p.status === 'completed');

    if (!currentTechId) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Briefcase size={12} />
                        Strategic Deployments
                    </p>
                    <h1 className="page-title">{isPM && scope === 'all' ? 'All Projects' : 'My Projects'}</h1>
                    <p className="page-subtitle text-left">{isPM ? 'Create, staff and run every project.' : 'Manage your large-scale, multi-day deployments.'}</p>
                </div>
                <div className="page-header-right">
                    {isPM && (
                        <>
                            <div className="flex items-center border border-border-main rounded-md overflow-hidden h-9">
                                {(['all', 'mine'] as const).map((s, i) => (
                                    <button key={s} onClick={() => setScope(s)}
                                        className={`px-3 h-full text-[10px] font-bold uppercase tracking-widest transition-colors ${i ? 'border-l border-border-main' : ''} ${scope === s ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary'}`}>
                                        {s === 'all' ? 'All' : 'Mine'}
                                    </button>
                                ))}
                            </div>
                            <Button size="sm" className="h-9 text-[10px]" onClick={() => setNewOpen(true)}>
                                <Plus size={13} className="mr-1.5" /> New Project
                            </Button>
                        </>
                    )}
                    <div className="search-wrap">
                        <Search />
                        <input
                            className="search-input !w-full md:!w-[250px]"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center border border-border-main rounded-md overflow-hidden h-9">
                        <button onClick={() => setViewMode('grid')} className={`px-2.5 h-full flex items-center transition-colors ${viewMode === 'grid' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary'}`}>
                            <LayoutGrid size={13} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`px-2.5 h-full flex items-center border-l border-border-main transition-colors ${viewMode === 'list' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary'}`}>
                            <LayoutList size={13} />
                        </button>
                    </div>
                </div>
            </header>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="tabs !mb-6">
                    <TabsTrigger value="active" className="tab">
                        Active Projects <span className="tab-count">({activeProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="on-hold" className="tab">
                        On Hold <span className="tab-count">({onHoldProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="tab">
                        Completed <span className="tab-count">({completedProjects.length})</span>
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="mt-0">
                    <ProjectsClient projects={activeProjects} technicians={technicians} viewMode={viewMode} />
                </TabsContent>
                <TabsContent value="on-hold" className="mt-0">
                    <ProjectsClient projects={onHoldProjects} technicians={technicians} viewMode={viewMode} />
                </TabsContent>
                <TabsContent value="completed" className="mt-0">
                    <ProjectsClient projects={completedProjects} technicians={technicians} viewMode={viewMode} />
                </TabsContent>
            </Tabs>
            {isPM && <NewProjectDialog isOpen={newOpen} setIsOpen={setNewOpen} onSave={handleNewProject} />}
        </div>
    );
}
