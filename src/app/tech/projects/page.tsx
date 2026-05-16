'use client';
import { useState, useEffect, useMemo } from 'react';
import { projects, technicians } from '@/lib/data';
import { Briefcase, Search } from 'lucide-react';
import { ProjectsClient } from './components/projects-client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TechProjectsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const techProjects = useMemo(() => {
        if (!currentTechId) return [];
        return projects
            .filter(p => p.team.some(member => member.technicianId === currentTechId))
            .filter(p => 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.location.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [currentTechId, searchQuery]);

    const activeProjects = techProjects.filter(p => p.status === 'active');
    const onHoldProjects = techProjects.filter(p => p.status === 'on-hold');
    const completedProjects = techProjects.filter(p => p.status === 'completed');

    if (!currentTechId) {
        return <div>Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Briefcase size={12} />
                        Strategic Deployments
                    </p>
                    <h1 className="page-title">My Projects</h1>
                    <p className="page-subtitle">Manage your large-scale, multi-day deployments.</p>
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
