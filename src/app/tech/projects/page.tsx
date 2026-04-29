'use client';
import { useState, useEffect } from 'react';
import { projects, technicians } from '@/lib/data';
import { Briefcase } from 'lucide-react';
import { ProjectsClient } from './components/projects-client';

export default function TechProjectsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const techProjects = projects.filter(p => 
        currentTechId && p.team.some(member => member.technicianId === currentTechId)
    );

    if (!currentTechId) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Briefcase size={12} />
                        My Deployments
                    </p>
                    <h1 className="page-title">My Projects</h1>
                    <p className="page-subtitle">Manage your large-scale, multi-day deployments.</p>
                </div>
            </header>
            <ProjectsClient projects={techProjects} technicians={technicians} />
        </div>
    );
}
