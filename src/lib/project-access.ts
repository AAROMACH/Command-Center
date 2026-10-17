import { hasPermission, type RoleLike } from './permissions';
import type { Project, ProjectTeamMember } from './types';

/**
 * Who can do what on a project from the Tech Portal. Mirrors
 * firestore.rules (isProjectManager / isLeadOn / isOnProject).
 *
 *   Project Manager — every project: create, staff, plan, documents, close.
 *   Project Lead    — projects where they are the named lead: plan phases
 *                     and tasks, assign tasks, upload documents.
 *   Field Tech      — projects they are on: tasks, check-in/out, own logs.
 */

/** Crew roles (Manage Team) that make someone the project's lead. */
export const LEAD_TEAM_ROLES = ['Project Lead', 'Project Manager'];

type Who = RoleLike & { id?: string };

export function canManageProjects(user: Who | null | undefined): boolean {
  return hasPermission(user, 'tech.projects.manage');
}

export function isNamedLead(project: Pick<Project, 'team'> & { projectLeadId?: string | null }, uid: string | undefined): boolean {
  if (!uid) return false;
  return project.projectLeadId === uid
    || (project.team || []).some(m => m.techId === uid && LEAD_TEAM_ROLES.includes(m.role));
}

/** Plan phases/tasks, assign tasks and upload documents on this project. */
export function canLeadProject(user: Who | null | undefined, project: Parameters<typeof isNamedLead>[0]): boolean {
  if (canManageProjects(user)) return true;
  return hasPermission(user, 'tech.projects.lead') && isNamedLead(project, user?.id);
}

export function isOnProject(project: Pick<Project, 'team' | 'assignedTechnicianIds'> & { projectLeadId?: string | null }, uid: string | undefined): boolean {
  if (!uid) return false;
  return (project.assignedTechnicianIds || []).includes(uid)
    || project.projectLeadId === uid
    || (project.team || []).some(m => m.techId === uid);
}

/**
 * The crew fields firestore.rules reads, derived from the team list. Written
 * with every team change — they used to stay [] forever, so the rules never
 * recognised anyone as being on a project.
 */
export function crewFields(team: ProjectTeamMember[]): { assignedTechnicianIds: string[]; projectLeadId: string | null } {
  const ids = Array.from(new Set(team.map(m => m.techId).filter(Boolean)));
  const lead = team.find(m => m.role === 'Project Lead') || team.find(m => LEAD_TEAM_ROLES.includes(m.role));
  return { assignedTechnicianIds: ids, projectLeadId: lead?.techId || null };
}
