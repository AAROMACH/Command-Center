'use client';
import type { Project, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, DollarSign, AlertTriangle, Info, Plus, Users } from 'lucide-react';
import React, {useState} from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ManageTeamDialog } from './manage-team-dialog';

type OverviewTabProps = {
    project: Project;
    setProject: React.Dispatch<React.SetStateAction<Project>>;
    allTechnicians: Technician[];
};

export function OverviewTab({ project, setProject, allTechnicians }: OverviewTabProps) {
    const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);

    const getTechnician = (id: string) => allTechnicians.find(t => t.id === id);

    const budgetProgress = project.projectBudget && project.actualBudget ? (project.actualBudget / project.projectBudget) * 100 : 0;
    const hoursProgress = project.estimatedHours && project.actualHours ? (project.actualHours / project.estimatedHours) * 100 : 0;

    const formatCurrency = (value?: number) => {
        if (value === undefined) return '$0.00';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main Content: Briefing & Economics */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="field-group">
                        <h3 className="field-group-title"><FileText/> Site Briefing</h3>
                        
                        <div className="field-row">
                            <label className="field-label">Scope of Work</label>
                            <Textarea className="field-textarea" defaultValue={project.scope}></Textarea>
                        </div>
                        
                        <div className="field-row">
                            <label className="field-label">Onsite Contact</label>
                            <Input className="field-input" placeholder="Name + phone number..." defaultValue={project.onsiteContact} />
                        </div>
                        
                        <div className="field-row">
                            <label className="field-label">Field Intelligence & Site Notes</label>
                            <div className="note-chips">
                                {project.siteHazardNotes.map(note => (
                                    <div key={note.id} className={`note-chip ${note.type === 'danger' ? 'danger' : 'info'}`}>
                                        {note.type === 'danger' ? <AlertTriangle size={13}/> : <Info size={13}/>}
                                        {note.text}
                                    </div>
                                ))}
                                <button className="note-chip-add"><Plus size={13}/> Add Note</button>
                            </div>
                            <Textarea className="field-textarea mt-2" placeholder="Parking, entry codes, badge requirements..." defaultValue={project.siteAccessInstructions}></Textarea>
                        </div>
                    </div>

                     <div className="field-group">
                        <h3 className="field-group-title"><DollarSign/> Project Economics</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="field-label !mb-0">Budget</label>
                                    <p className="text-sm font-mono"><span className="font-bold text-text-primary">{formatCurrency(project.actualBudget)}</span> / <span className="text-text-muted">{formatCurrency(project.projectBudget)}</span></p>
                                </div>
                                <div className="progress-wrap">
                                    <div className="progress-track !h-[6px]"><div className="progress-fill green" style={{ width: `${budgetProgress}%` }}></div></div>
                                </div>
                            </div>
                             <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="field-label !mb-0">Hours</label>
                                     <p className="text-sm font-mono"><span className="font-bold text-text-primary">{project.actualHours || 0}h</span> / <span className="text-text-muted">{project.estimatedHours || 0}h</span></p>
                                </div>
                                <div className="progress-wrap">
                                    <div className="progress-track !h-[6px]"><div className="progress-fill gold" style={{ width: `${hoursProgress}%` }}></div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Content: Team */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="field-group">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="field-group-title !mb-0"><Users/> Project Team</h3>
                            <Button variant="outline" size="sm" onClick={() => setIsTeamDialogOpen(true)}>Manage Team</Button>
                        </div>
                        <div className="space-y-3">
                            {project.team.map(member => {
                                const tech = getTechnician(member.technicianId);
                                if (!tech) return null;
                                return (
                                    <div key={tech.id} className="flex items-center gap-3 p-3 rounded-md bg-bg-primary border border-border-subtle">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={tech.avatarUrl} alt={tech.name} />
                                            <AvatarFallback>{tech.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm text-text-primary">{tech.name}</p>
                                            <p className="text-xs text-text-muted">{member.role}</p>
                                        </div>
                                        <Badge variant="active" className="!text-xs">Online</Badge>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm">Cancel</Button>
                <Button variant="default" size="sm">Save Changes</Button>
            </div>
            
            <ManageTeamDialog 
              isOpen={isTeamDialogOpen}
              setIsOpen={setIsTeamDialogOpen}
              project={project}
              setProject={setProject}
              allTechnicians={allTechnicians}
            />
        </>
    );
}
