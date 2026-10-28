'use client';

import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Users } from 'lucide-react';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LEAD_TEAM_ROLES } from '@/lib/project-access';
import { cn, formatCityState } from '@/lib/utils';

/**
 * The project card and table shared by the admin and tech portals, so both
 * look the same. `admin` adds what only the office needs (project ID, team
 * size); everything else — lead, progress, location, start — shows for both.
 */

export function projectProgress(project: Project) {
  const tasks = (project.phases || []).flatMap(p => p.tasks || []).filter(Boolean);
  const done = tasks.filter(t => t.isCompleted).length;
  const pct = tasks.length ? (done / tasks.length) * 100 : 0;
  return { done, total: tasks.length, pct, color: pct === 100 ? 'green' : pct > 5 ? 'gold' : 'red' };
}

/** The project's lead: the named lead, else the team's Project Lead / Manager. */
export function projectLead(project: Project, people: Technician[]): Technician | null {
  const team = project.team || [];
  const id = project.projectLeadId
    || team.find(m => m.role === 'Project Lead')?.techId
    || team.find(m => LEAD_TEAM_ROLES.includes(m.role))?.techId;
  return (id && people.find(t => t.id === id)) || null;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'TBD';
  const p = dateStr.split(/[-/]/);
  if (p.length !== 3) return dateStr;
  return p[0].length === 4 ? `${p[1]}-${p[2]}-${p[0]}` : dateStr;
}

function LeadChip({ lead, size = 'sm' }: { lead: Technician | null; size?: 'sm' | 'md' }) {
  if (!lead) return <span className="text-[11px] text-text-muted">Lead: unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar className={cn('border border-border-sub', size === 'md' ? 'h-7 w-7' : 'h-5 w-5')}>
        <AvatarImage src={lead.avatarUrl} />
        <AvatarFallback className="text-[10px]">{(lead.name || 'U').charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="truncate text-[12px] font-semibold text-text-primary">{size === 'sm' ? `Lead: ${lead.name}` : lead.name}</span>
    </span>
  );
}

function ProgressBar({ project, compact }: { project: Project; compact?: boolean }) {
  const { done, total, pct, color } = projectProgress(project);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="progress-track flex-1 !h-[5px]"><div className={cn('progress-fill flashy', color)} style={{ width: `${pct}%` }} /></div>
      <span className={cn('text-[11px] font-mono font-bold shrink-0', `text-${color}`)}>{Math.round(pct)}%</span>
      {!compact && <span className="text-[11px] text-text-muted shrink-0">{done}/{total} tasks</span>}
    </div>
  );
}

export function ProjectCard({ project, technicians, href, admin }: { project: Project; technicians: Technician[]; href: string; admin?: boolean }) {
  const router = useRouter();
  const lead = projectLead(project, technicians);
  return (
    <div onClick={() => router.push(href)}
      className="group flex flex-col cursor-pointer rounded-xl border border-border-main bg-bg-secondary shadow-sm hover:border-brand-red transition-colors overflow-hidden text-left">
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant={project.status as any} className="h-5 shrink-0 text-[10px] uppercase tracking-wider">{project.status}</Badge>
            {admin && <span className="truncate font-mono text-[10px] font-bold text-brand-red">{(project.id || '').toUpperCase()}</span>}
          </div>
          {admin && <span className="flex items-center gap-1 text-[11px] text-text-muted shrink-0"><Users size={11} /> {(project.team || []).length}</span>}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-text-primary leading-tight group-hover:text-brand-red transition-colors">{project.name}</p>
          <p className="text-[12px] text-text-muted mt-0.5">{project.client}</p>
        </div>
        <div className="space-y-1.5">
          {project.location && (
            <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><MapPin size={11} className="text-brand-red shrink-0" /><span className="truncate">{formatCityState(project.location)}</span></div>
          )}
          <div className="flex items-center gap-1.5 text-[12px] text-text-secondary font-mono"><Calendar size={11} className="text-text-muted shrink-0" /> {formatDate(project.startDate)}</div>
          <LeadChip lead={lead} />
        </div>
      </div>
      <div className="border-t border-border-sub px-4 py-3 mt-auto bg-bg-primary/40"><ProgressBar project={project} /></div>
    </div>
  );
}

export function ProjectTable({ projects, technicians, hrefFor, admin }: { projects: Project[]; technicians: Technician[]; hrefFor: (p: Project) => string; admin?: boolean }) {
  const router = useRouter();
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr className="bg-bg-tertiary">
            <th className="text-left">Project</th>
            <th className="text-left">Lead</th>
            <th className="text-left hidden md:table-cell">Location</th>
            <th className="text-left hidden sm:table-cell">Start</th>
            <th className="text-left w-[28%] min-w-[140px]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(project => (
            <tr key={project.id} onClick={() => router.push(hrefFor(project))} className="cursor-pointer group hover:bg-bg-tertiary/50 transition-colors">
              <td className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={project.status as any} className="h-4 px-1.5 text-[10px] uppercase tracking-wider">{project.status}</Badge>
                  {admin && <span className="font-mono text-[10px] font-bold text-brand-red">{(project.id || '').toUpperCase()}</span>}
                </div>
                <p className="mt-1 text-[13px] font-semibold text-text-primary group-hover:text-brand-red transition-colors">{project.name}</p>
                <p className="text-[12px] text-text-muted">{project.client}</p>
              </td>
              <td className="py-3"><LeadChip lead={projectLead(project, technicians)} size="md" /></td>
              <td className="py-3 hidden md:table-cell">
                <span className="flex items-center gap-1.5 text-[12px] text-text-secondary"><MapPin size={11} className="text-brand-red shrink-0" />{formatCityState(project.location) || '—'}</span>
              </td>
              <td className="py-3 hidden sm:table-cell font-mono text-[12px] text-text-secondary">{formatDate(project.startDate)}</td>
              <td className="py-3"><ProgressBar project={project} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
