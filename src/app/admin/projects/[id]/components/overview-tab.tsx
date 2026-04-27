'use client';
import type { Project, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, DollarSign, AlertTriangle, Info, Plus, Users, User, Trash2 } from 'lucide-react';
import React, {useState} from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ManageTeamDialog } from './manage-team-dialog';
import { Badge } from '@/components/ui/badge';

type OverviewTabProps = {
    project: Project;
    setProject: React.Dispatch<React.SetStateAction<Project>>;
    allTechnicians: Technician[];
};

export function OverviewTab({ project, setProject, allTechnicians }: OverviewTabProps) {
    const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);

    const getTechnician = (id: string) => allTechnicians.find(t => t.id === id);
    
    return (
        <>
            <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 field-group">
                        <h3 className="field-group-title"><FileText/> Pre-Site Briefing</h3>
                        
                        <div className="field-row">
                            <label className="field-label">Scope of Work</label>
                            <Textarea className="field-textarea" defaultValue={project.scope}></Textarea>
                        </div>
                        <div className="field-row">
                            <label className="field-label">Onsite Contact</label>
                            <Input className="field-input" placeholder="Name + phone number..." defaultValue={project.onsiteContact} />
                        </div>
                        <div className="field-row">
                            <label className="field-label">Site Access Instructions</label>
                            <Textarea className="field-textarea" placeholder="Parking, entry codes..." defaultValue={project.siteAccessInstructions}></Textarea>
                        </div>
                        <div className="field-row">
                            <label className="field-label">Site Hazard Notes</label>
                            <div className="note-chips">
                                {project.siteHazardNotes.map(note => (
                                    <div key={note.id} className={`note-chip ${note.type === 'danger' ? 'danger' : 'info'}`}>
                                        {note.type === 'danger' ? <AlertTriangle size={13}/> : <Info size={13}/>}
                                        {note.text}
                                    </div>
                                ))}
                                <button className="note-chip-add"><Plus size={13}/> Add Note</button>
                            </div>
                        </div>
                    </div>

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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 field-group">
                        <h3 className="field-group-title"><Info/> Admin Notes / Critical Notes</h3>
                        <Textarea className="field-textarea !min-h-[100px]" placeholder="Internal notes for techs..." defaultValue={project.specialInstructions}></Textarea>
                    </div>

                    <div className="field-group">
                        <h3 className="field-group-title"><DollarSign/> Project Vitals</h3>
                        <div className="field-row">
                            <label className="field-label">Project Budget</label>
                            <Input className="field-input" placeholder="$0.00" defaultValue={project.projectBudget ? `$${project.projectBudget.toFixed(2)}` : ''} />
                        </div>
                        <div className="field-row">
                            <label className="field-label">Estimated Hours</label>
                            <Input className="field-input" placeholder="0" defaultValue={project.estimatedHours || ''} />
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
