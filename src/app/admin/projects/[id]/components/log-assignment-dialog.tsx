'use client';

import { useState } from 'react';
import type { Technician, TimesheetLog } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type LogAssignmentDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    technicians: Technician[];
    projectId: string;
    onLogAdded: (newLog: any) => void;
};

const defaultLogState = {
    technicianId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    checkInTime: '09:00',
    checkOutTime: '17:00',
    logSummary: '',
};

export function LogAssignmentDialog({ isOpen, setIsOpen, technicians, projectId, onLogAdded }: LogAssignmentDialogProps) {
    const [logData, setLogData] = useState(defaultLogState);
    const { toast } = useToast();

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setLogData({ ...logData, [name]: value });
    };

    const handleSelectChange = (name: string, value: string) => {
        setLogData({ ...logData, [name]: value });
    };
    
    const handleSubmit = () => {
        if (!logData.technicianId || !logData.date || !logData.checkInTime || !logData.checkOutTime) {
            toast({
                variant: 'destructive',
                title: 'Incomplete Parameters',
                description: 'Identity, Date, and Duration windows are mandatory for registry logs.',
            });
            return;
        }

        const checkIn = new Date(`${logData.date}T${logData.checkInTime}`);
        const checkOut = new Date(`${logData.date}T${logData.checkOutTime}`);
        const diffMs = checkOut.getTime() - checkIn.getTime();

        if (diffMs < 0) {
            toast({
                variant: 'destructive',
                title: 'Temporal Discrepancy',
                description: 'Check-out time must follow check-in time.',
            });
            return;
        }

        const totalMinutes = Math.round(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        const newLog = {
            assignmentId: `ts-${new Date().getTime()}`,
            projectId,
            technicianId: logData.technicianId,
            date: logData.date,
            checkInTime: logData.checkInTime, // Store raw HH:mm
            checkOutTime: logData.checkOutTime, // Store raw HH:mm
            totalHours: `${hours}h ${minutes}m`,
            totalMinutes,
            workSummary: logData.logSummary || 'MANUAL REGISTRY ENTRY',
            taskIdsCompleted: [],
            taskIdsProgressed: [],
            phaseIdsWorked: [],
            materialsUsed: [],
            photoUrls: [],
        };

        onLogAdded(newLog);
        setIsOpen(false);
        setLogData(defaultLogState);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[550px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden flex flex-col">
                <DialogHeader className="text-left border-b border-border-sub bg-bg-tertiary/30 p-6">
                    <DialogTitle className="page-title text-xl uppercase font-bold tracking-widest">Manual Session Registry</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold text-text-muted">Initialize a field session entry for project <span className="text-text-primary">{projectId.toUpperCase()}</span>.</DialogDescription>
                </DialogHeader>
                <div className="p-6 space-y-6 text-left flex-1 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-left">
                             <Label htmlFor="technicianId" className="text-[10px] uppercase font-bold text-text-muted">Operative Identity</Label>
                            <Select value={logData.technicianId} onValueChange={(value) => handleSelectChange('technicianId', value)}>
                                <SelectTrigger id="technicianId" className="bg-bg-primary h-10 text-xs font-bold uppercase">
                                    <SelectValue placeholder="Select operative" />
                                </SelectTrigger>
                                <SelectContent>
                                    {technicians.map(tech => (
                                        <SelectItem key={tech.id} value={tech.id} className="text-xs uppercase font-bold">{tech.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 text-left">
                             <Label htmlFor="date" className="text-[10px] uppercase font-bold text-text-muted">Mission Date</Label>
                             <Input id="date" name="date" type="date" value={logData.date} onChange={handleInputChange} className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-left">
                             <Label htmlFor="checkInTime" className="text-[10px] uppercase font-bold text-text-muted">Initial Check-In</Label>
                             <Input id="checkInTime" name="checkInTime" type="time" value={logData.checkInTime} onChange={handleInputChange} className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2 text-left">
                             <Label htmlFor="checkOutTime" className="text-[10px] uppercase font-bold text-text-muted">Final Check-Out</Label>
                             <Input id="checkOutTime" name="checkOutTime" type="time" value={logData.checkOutTime} onChange={handleInputChange} className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                     <div className="space-y-2 text-left">
                         <Label htmlFor="logSummary" className="text-[10px] uppercase font-bold text-text-muted">Mission Narrative</Label>
                        <Textarea id="logSummary" name="logSummary" value={logData.logSummary} onChange={handleInputChange} className="bg-bg-primary min-h-[120px] text-xs uppercase font-medium leading-relaxed" placeholder="Document site activity, terminal outcomes, and field obstacles..."/>
                    </div>
                </div>
                <DialogFooter className="p-6 border-t border-border-sub bg-bg-tertiary/30">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="h-11 px-8 font-bold uppercase text-[10px] tracking-widest">Discard</Button>
                    <Button onClick={handleSubmit} className="bg-brand-red hover:bg-brand-red-hover h-11 px-10 font-bold uppercase text-[10px] tracking-widest text-white">Authorize Registry Log</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}