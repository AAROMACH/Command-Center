
'use client';

import { useState } from 'react';
import type { Project, Technician, ProjectTeamMember } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type ManageTeamDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    project: Project;
    allTechnicians: Technician[];
};

const ROLES = [
    'Project Manager',
    'Project Lead',
    'Assist Tech',
    'Cabling Tech',
    'Fiber Tech',
    'Network Tech',
    'Apprentice',
];

export function ManageTeamDialog({ isOpen, setIsOpen, project, allTechnicians }: ManageTeamDialogProps) {
    const [team, setTeam] = useState<ProjectTeamMember[]>(project.team || []);
    const [newTechId, setNewTechId] = useState('');
    const [newTechRole, setNewTechRole] = useState('');
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();

    const getTechnician = (id: string) => allTechnicians.find(t => t.id === id);

    const availableTechnicians = allTechnicians.filter(
        (tech) => !team.some((member) => member.technicianId === tech.id)
    );

    const filteredTechnicians = availableTechnicians.filter((tech) =>
        (tech.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleRoleChange = (technicianId: string, newRole: string) => {
        setTeam(currentTeam => 
            currentTeam.map(member => 
                member.technicianId === technicianId ? { ...member, role: newRole } : member
            )
        );
    };

    const handleRemoveTech = (technicianId: string) => {
        setTeam(currentTeam => 
            currentTeam.filter(member => member.technicianId !== technicianId)
        );
    };

    const handleAddTech = () => {
        if (newTechId && newTechRole) {
            setTeam(currentTeam => [...currentTeam, { technicianId: newTechId, role: newTechRole }]);
            setNewTechId('');
            setNewTechRole('');
            setSearchQuery('');
        }
    };

    const handleSaveChanges = async () => {
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { team });
            toast({ title: 'Team Registry Updated', description: 'Personnel changes synchronized with cloud folder.' });
            setIsOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        }
    };
    
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setTeam(project.team || []);
            setSearchQuery('');
            setNewTechId('');
            setNewTechRole('');
        }
        setIsOpen(open);
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[525px] bg-bg-elevated border-border-default shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="page-title text-xl text-left">Manage Project Team</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-6">
                    <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 text-left">Current Team</h3>
                        <div className="space-y-2">
                            {team.map(member => {
                                const tech = getTechnician(member.technicianId);
                                if (!tech) return null;
                                return (
                                    <div key={member.technicianId} className="flex items-center gap-3 p-2 rounded-md bg-bg-primary border border-border-sub">
                                        <Avatar className="h-8 w-8 border border-border-sub"><AvatarImage src={tech.avatarUrl} /><AvatarFallback>{tech.name?.charAt(0)}</AvatarFallback></Avatar>
                                        <div className="flex-1 font-bold text-xs text-text-primary uppercase truncate text-left">{tech.name}</div>
                                        <Select value={member.role} onValueChange={(value) => handleRoleChange(member.technicianId, value)}>
                                            <SelectTrigger className="w-[150px] bg-bg-secondary border-border-sub h-8 text-[10px] uppercase font-bold">
                                                <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLES.map(role => <SelectItem key={role} value={role} className="text-xs uppercase font-bold">{role}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <button onClick={() => handleRemoveTech(member.technicianId)} className="p-1.5 text-text-muted hover:text-text-red transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )
                            })}
                            {team.length === 0 && (
                                <div className="p-8 text-center border border-dashed border-border-sub rounded-md">
                                    <p className="text-[10px] uppercase font-bold text-text-muted italic">No personnel assigned</p>
                                </div>
                            )}
                        </div>
                    </div>
                     <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 text-left">Add Technician</h3>
                        <div className="flex items-center gap-2">
                             <Select value={newTechId} onValueChange={setNewTechId}>
                                <SelectTrigger className="flex-1 bg-bg-secondary border-border-sub h-9 text-[10px] uppercase font-bold">
                                    <SelectValue placeholder="Select operative..." />
                                </SelectTrigger>
                                <SelectContent>
                                     <div className="p-2">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                            <Input 
                                                placeholder="Search registry..."
                                                className="w-full h-8 pl-8 bg-bg-primary border-border-sub text-[10px] uppercase font-bold"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>
                                    <ScrollArea className="h-[150px]">
                                        <div className="p-1">
                                            {filteredTechnicians.length > 0 ? filteredTechnicians.map(tech => (
                                                <SelectItem key={tech.id} value={tech.id} className="text-[10px] uppercase font-bold">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-5 w-5 border border-border-sub"><AvatarImage src={tech.avatarUrl} /><AvatarFallback>{tech.name?.charAt(0)}</AvatarFallback></Avatar>
                                                        <span>{tech.name}</span>
                                                    </div>
                                                </SelectItem>
                                            )) : (
                                                <div className="text-center text-[10px] uppercase font-bold text-text-muted p-4">No operatives found</div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                             <Select value={newTechRole} onValueChange={setNewTechRole}>
                                <SelectTrigger className="w-[150px] bg-bg-secondary border-border-sub h-9 text-[10px] uppercase font-bold">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.map(role => <SelectItem key={role} value={role} className="text-xs uppercase font-bold">{role}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Button size="icon" className="h-9 w-9 shrink-0 bg-brand-red hover:bg-brand-red-hover text-white" onClick={handleAddTech} disabled={!newTechId || !newTechRole}>
                                <Plus size={16} />
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSaveChanges} className="bg-brand-red hover:bg-brand-red-hover px-10 text-white font-bold uppercase text-[10px] tracking-widest">Save Team Updates</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
