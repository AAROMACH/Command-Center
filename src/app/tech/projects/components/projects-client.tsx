'use client';

import type { Project, Technician } from '@/lib/types';
import { Briefcase } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ProjectCard, ProjectTable } from '@/components/project-views';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
    viewMode?: 'grid' | 'list';
};


export function ProjectsClient({ projects, technicians, viewMode = 'grid', filtered = false }: ProjectsClientProps & { filtered?: boolean }) {

    if (projects.length === 0) {
        return (
            <EmptyState
                icon={Briefcase}
                title={filtered ? 'No projects match your search' : 'No projects here'}
                description={filtered ? 'Try a different name, client or location.' : 'Projects you are added to show up here.'}
            />
        );
    }

    // Same card and table as the admin portal (components/project-views).
    if (viewMode === 'list') {
        return <ProjectTable projects={projects} technicians={technicians} hrefFor={p => `/tech/projects/${p.id}`} />;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
                <ProjectCard key={project.id} project={project} technicians={technicians} href={`/tech/projects/${project.id}`} />
            ))}
        </div>
    );
}
