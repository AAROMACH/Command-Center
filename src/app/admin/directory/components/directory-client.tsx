'use client';
import type { Technician, WorkOrder, Project } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, Mail, MessageSquare, MapPin, Briefcase, Calendar, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

type DirectoryClientProps = {
    technicians: Technician[];
    workOrders: WorkOrder[];
    projects: Project[];
};

export function DirectoryClient({ technicians, workOrders, projects }: DirectoryClientProps) {

    const getTechnicianStatus = (techId: string) => {
        const isOnJob = workOrders.some(wo => wo.assignedTechnicianId === techId && wo.status === 'in-progress');
        const isOnProject = projects.some(p => p.team.some(member => member.technicianId === techId) && p.status === 'active');
        
        if (isOnJob) {
            const job = workOrders.find(wo => wo.assignedTechnicianId === techId && wo.status === 'in-progress');
            return { status: 'On Assignment', details: `Job: ${job?.id.toUpperCase()}`, variant: 'onhold' as const };
        }
        if (isOnProject) {
             const project = projects.find(p => p.team.some(member => member.technicianId === techId) && p.status === 'active');
            return { status: 'On Assignment', details: `Project: ${project?.id.toUpperCase()}`, variant: 'onhold' as const };
        }
        return { status: 'Available', details: 'Awaiting next assignment', variant: 'active' as const };
    }
    
    const getAssignmentHistory = (techId: string) => {
        const jobs = workOrders.filter(wo => wo.assignedTechnicianId === techId && wo.status === 'completed').slice(0, 2);
        const projectIds = projects.filter(p => p.team.some(m => m.technicianId === techId) && p.status === 'completed').map(p => p.id);
        
        return [
            ...jobs.map(j => ({ id: j.id, description: j.description, type: 'Job' as const })),
            ...projects.filter(p => projectIds.includes(p.id)).slice(0, 2).map(p => ({ id: p.id, description: p.name, type: 'Project' as const }))
        ].slice(0, 3);
    }
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            {technicians.map(tech => {
                const techStatus = getTechnicianStatus(tech.id);
                const history = getAssignmentHistory(tech.id);

                return (
                <Card key={tech.id} className="flex flex-col">
                    <CardContent className="p-6 flex flex-col flex-1">
                       <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border-2 border-border-default">
                                    <AvatarImage src={tech.avatarUrl} />
                                    <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary">{tech.name}</h3>
                                    <p className="text-sm text-text-secondary">{tech.role}</p>
                                </div>
                            </div>
                       </div>
                       
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
                           <div className="flex items-start gap-2">
                                <ShieldCheck size={16} className="mt-0.5 text-text-muted shrink-0"/>
                                <div>
                                    <div className="text-xs text-text-muted">Reliability</div>
                                    <div className="font-semibold text-text-primary">{tech.reliabilityScore}%</div>
                                </div>
                            </div>
                             <div className="flex items-start gap-2">
                                <Calendar size={16} className="mt-0.5 text-text-muted shrink-0"/>
                                 <div>
                                    <div className="text-xs text-text-muted">Status</div>
                                    <div className="font-semibold text-text-primary flex items-center gap-1.5">
                                      <Badge variant={techStatus.variant} className="!p-0 !h-1.5 !w-1.5"></Badge>
                                      {techStatus.status}
                                    </div>
                                </div>
                            </div>
                             <div className="flex items-start gap-2 col-span-2">
                                <Mail size={16} className="mt-0.5 text-text-muted shrink-0"/>
                                 <div>
                                    <div className="text-xs text-text-muted">Contact</div>
                                    <div className="font-semibold text-text-primary">{tech.email}</div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4">
                             <h4 className="field-label !mb-2">Skills</h4>
                             <div className="flex flex-wrap gap-1.5">
                                {tech.skills.map(skill => (
                                    <Badge key={skill} variant="secondary" className="bg-bg-tertiary text-text-secondary border-border-subtle font-normal">{skill}</Badge>
                                ))}
                            </div>
                        </div>
                        
                         <div className="mb-4">
                             <h4 className="field-label !mb-2">Recent Activity</h4>
                             {history.length > 0 ? (
                                <div className="space-y-2">
                                    {history.map(item => (
                                        <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded-md bg-bg-primary border border-border-subtle">
                                            <Briefcase size={14} className="text-text-muted shrink-0"/>
                                            <div className="truncate">
                                               <span className="font-semibold text-text-secondary mr-2">{item.type}</span>
                                               <span className="text-text-muted">{item.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             ) : (
                                <div className="empty-state !text-xs !py-2 !px-3 !text-left">No completed assignments.</div>
                             )}
                        </div>

                        <div className="mt-auto flex gap-2">
                             <Button variant="outline" size="sm" className="flex-1">
                                <Phone size={14} className="mr-2"/> Call
                            </Button>
                             <Button variant="outline" size="sm" className="flex-1">
                                <MessageSquare size={14} className="mr-2"/> Message
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}}
        </div>
    );
}
