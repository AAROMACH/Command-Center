'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ListChecks, ChevronRight } from 'lucide-react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { Card, CardContent } from '@/components/ui/card';
import type { Project } from '@/lib/types';

/**
 * Open project tasks assigned to this tech (by the PM or project lead),
 * across every project. Each row opens the task's project — the task itself
 * still lives in that project's phase.
 */
export function MyTasksCard({ techId }: { techId: string | null | undefined }) {
    const [projects, setProjects] = useState<Project[]>([]);
    useEffect(() => {
        if (!techId) return;
        return onSharedSnapshot('projects', snap => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project))), () => setProjects([]));
    }, [techId]);

    const tasks = useMemo(() => projects
        .filter(p => p.status !== 'completed')
        .flatMap(p => (p.phases || []).flatMap(ph => (ph.tasks || [])
            .filter(t => t && t.assignedTechId === techId && !t.isCompleted)
            .map(t => ({ id: t.id, name: t.name, phase: ph.name, projectId: p.id, projectName: p.name })))),
    [projects, techId]);

    if (!techId || tasks.length === 0) return null;
    return (
        <Card className="bg-bg-secondary border-border-sub">
            <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">
                        <ListChecks size={13} className="text-brand-red" /> My Tasks
                    </p>
                    <span className="text-[9px] font-bold text-text-muted">{tasks.length} open</span>
                </div>
                <div className="divide-y divide-border-sub">
                    {tasks.slice(0, 8).map(t => (
                        <Link key={`${t.projectId}:${t.id}`} href={`/tech/projects/${t.projectId}`}
                            className="flex items-center gap-3 py-2 text-left hover:bg-bg-tertiary/40 rounded px-1">
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-text-primary truncate">{t.name}</p>
                                <p className="text-[9px] text-text-muted truncate">{t.projectName} · {t.phase}</p>
                            </div>
                            <ChevronRight size={14} className="text-text-muted shrink-0" />
                        </Link>
                    ))}
                </div>
                {tasks.length > 8 && <p className="text-[9px] text-text-muted">+{tasks.length - 8} more in your projects</p>}
            </CardContent>
        </Card>
    );
}
