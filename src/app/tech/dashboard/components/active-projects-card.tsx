'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ChevronRight } from 'lucide-react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { isOnProject } from '@/lib/project-access';
import type { Project } from '@/lib/types';
import { useDirectory } from '@/hooks/use-directory';
import { projectLead } from '@/components/project-views';

/**
 * Active projects this tech is on. Replaces the Projects tab in the phone
 * bottom nav; "All" still opens the full Projects page.
 */
export function ActiveProjectsCard({ techId }: { techId: string | null }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const people = useDirectory();
    useEffect(() => onSharedSnapshot('projects', snap =>
        setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)))), []);

    const mine = useMemo(() => techId
        ? projects.filter(p => p.status === 'active' && isOnProject(p, techId))
        : [], [projects, techId]);

    if (mine.length === 0) return null;
    return (
        <div className="rounded-xl border border-border-main bg-bg-secondary">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-sub">
                <p className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                    <FolderKanban size={14} className="text-text-muted" /> Active projects
                    <span className="text-[11px] text-text-muted font-normal">{mine.length}</span>
                </p>
                <Link href="/tech/projects" className="text-[12px] text-text-muted hover:text-text-primary">All</Link>
            </div>
            <div className="divide-y divide-border-sub">
                {mine.slice(0, 5).map(p => (
                    <Link key={p.id} href={`/tech/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-bg-tertiary transition-colors">
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-primary truncate">{p.name || p.id}</p>
                            <p className="text-[11px] text-text-muted truncate">{[p.client, p.location, `Lead: ${projectLead(p, people)?.name || 'unassigned'}`].filter(Boolean).join(' · ')}</p>
                        </div>
                        <ChevronRight size={14} className="text-text-muted shrink-0" />
                    </Link>
                ))}
            </div>
        </div>
    );
}
