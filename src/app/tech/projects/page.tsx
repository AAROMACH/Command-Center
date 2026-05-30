'use client';
import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from 'firebase/firestore';
import type { Project, Technician } from '@/lib/types';
import { Briefcase, Search } from 'lucide-react';
import { ProjectsClient } from './components/projects-client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TechProjectsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        const unsubProj = onSnapshot(collection(db, 'projects'), (snap) => {
            setAllProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
        });

        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });

        return () => { unsubProj(); unsubTech(); };
    }, []);

    const techProjects = useMemo(() => {
        if (!currentTechId) return [];
        return allProjects
            .filter(p => (p.team || []).some(member => member.technicianId === currentTechId))
            .filter(p => 
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [allProjects, currentTechId, searchQuery]);

    const activeProjects = techProjects.filter(p => p.status === 'active');
    const onHoldProjects = techProjects.filter(p => p.status === 'on-hold');
    const completedProjects = techProjects.filter(p => p.status === 'completed');

    if (!currentTechId) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Synchronizing Registry...</p>
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
                    <h1 className="page-title">My Projects</h1>
                    <p className="page-subtitle text-left">Manage your large-scale, multi-day deployments.</p>
                </div>
                <div className="page-header-right">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Search projects..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
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
                    <ProjectsClient projects={activeProjects} technicians={technicians} />
                </TabsContent>
                <TabsContent value="on-hold" className="mt-0">
                    <ProjectsClient projects={onHoldProjects} technicians={technicians} />
                </TabsContent>
                <TabsContent value="completed" className="mt-0">
                    <ProjectsClient projects={completedProjects} technicians={technicians} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
