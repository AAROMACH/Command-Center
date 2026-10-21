'use client';
import { useSessionState } from '@/hooks/use-session-state';
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
import { cn } from '@/lib/utils';
import { ProjectsClient } from './components/projects-client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from '@/components/page-header';
import { PageLoading } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';

export default function TechProjectsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    // Crew names/avatars (techs can't read `users`; this used to be empty).
    const technicians = useDirectory();
    const [searchQuery, setSearchQuery] = useSessionState('tech/projects:searchQuery', "");
    const [viewMode, setViewMode] = useSessionState<'grid' | 'list'>('tech/projects:viewMode', 'grid');
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
        return <PageLoading label="Loading projects…" />;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Projects"
                icon={Briefcase}
                title={isPM && scope === 'all' ? 'All projects' : 'My projects'}
                subtitle={isPM ? 'Create, staff and run every project.' : 'Your multi-day projects.'}
                actions={<>
                    {isPM && (
                        <>
                            <div className="tabs !mb-0 flex-nowrap" role="tablist" aria-label="Scope">
                                {(['all', 'mine'] as const).map(s => (
                                    <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
                                        className={cn('tab', scope === s && 'active')}>
                                        {s === 'all' ? 'All' : 'Mine'}
                                    </button>
                                ))}
                            </div>
                            <Button className="h-10 sm:h-9" onClick={() => setNewOpen(true)}>
                                <Plus size={14} className="mr-1.5" /> New project
                            </Button>
                        </>
                    )}
                    <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search projects" className="w-full sm:w-[250px]" />
                    <div className="flex items-center border border-border-main rounded-md overflow-hidden h-10 sm:h-9">
                        <button onClick={() => setViewMode('grid')} aria-label="Grid view" className={`w-10 h-full flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary'}`}>
                            <LayoutGrid size={14} />
                        </button>
                        <button onClick={() => setViewMode('list')} aria-label="List view" className={`w-10 h-full flex items-center justify-center border-l border-border-main transition-colors ${viewMode === 'list' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary'}`}>
                            <LayoutList size={14} />
                        </button>
                    </div>
                </>}
            />

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="tabs !mb-4 h-auto justify-start bg-transparent p-0">
                    <TabsTrigger value="active" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
                        Active <span className="tab-count">({activeProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="on-hold" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
                        On hold <span className="tab-count">({onHoldProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
                        Completed <span className="tab-count">({completedProjects.length})</span>
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="mt-0">
                    <ProjectsClient projects={activeProjects} technicians={technicians} viewMode={viewMode} filtered={!!searchQuery} />
                </TabsContent>
                <TabsContent value="on-hold" className="mt-0">
                    <ProjectsClient projects={onHoldProjects} technicians={technicians} viewMode={viewMode} filtered={!!searchQuery} />
                </TabsContent>
                <TabsContent value="completed" className="mt-0">
                    <ProjectsClient projects={completedProjects} technicians={technicians} viewMode={viewMode} filtered={!!searchQuery} />
                </TabsContent>
            </Tabs>
            {isPM && <NewProjectDialog isOpen={newOpen} setIsOpen={setNewOpen} onSave={handleNewProject} />}
        </div>
    );
}
