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
    setIsOpen: (isOpen: boolean) => void;
    technicians: Technician[];
    projectId: string;
    onLogAdded: (newLog: TimesheetLog) => void;
};

const defaultLogState = {
    technicianId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    checkInTime: '',
    checkOutTime: '',
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
                title: 'Missing Information',
                description: 'Please fill out all required fields (Technician, Date, Check-In/Out).',
            });
            return;
        }

        const checkIn = new Date(`${logData.date}T${logData.checkInTime}`);
        const checkOut = new Date(`${logData.date}T${logData.checkOutTime}`);
        const diffMs = checkOut.getTime() - checkIn.getTime();

        if (diffMs < 0) {
            toast({
                variant: 'destructive',
                title: 'Invalid Times',
                description: 'Check-out time must be after check-in time.',
            });
            return;
        }

        const totalMinutes = Math.round(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        const newLog: TimesheetLog = {
            assignmentId: `ts-${new Date().getTime()}`,
            projectId,
            technicianId: logData.technicianId,
            date: format(new Date(`${logData.date}T00:00:00`), 'EEEE, MMMM d, yyyy'),
            checkInTime: format(checkIn, 'h:mm a'),
            checkOutTime: format(checkOut, 'h:mm a'),
            totalHours: `${hours}h ${minutes}m`,
            totalMinutes,
            logSummary: logData.logSummary,
            completedTasks: [], // For simplicity, manual entry can be part of summary.
            inProgressTasks: [], // For simplicity
            photos: [],
        };

        onLogAdded(newLog);
        toast({
            title: 'Assignment Logged',
            description: `New log for ${technicians.find(t => t.id === logData.technicianId)?.name} has been added.`,
        });
        setIsOpen(false);
        setLogData(defaultLogState);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[525px] bg-bg-elevated border-border-default">
                <DialogHeader>
                    <DialogTitle className="page-title text-xl">Log New Assignment</DialogTitle>
                    <DialogDescription>Manually log a technician's work for project {projectId.toUpperCase()}.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <Label htmlFor="technicianId" className="field-label !mb-0">Technician</Label>
                            <Select value={logData.technicianId} onValueChange={(value) => handleSelectChange('technicianId', value)}>
                                <SelectTrigger id="technicianId" className="bg-bg-primary border-border-subtle">
                                    <SelectValue placeholder="Select a technician" />
                                </SelectTrigger>
                                <SelectContent>
                                    {technicians.map(tech => (
                                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="date" className="field-label !mb-0">Date</Label>
                             <Input id="date" name="date" type="date" value={logData.date} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <Label htmlFor="checkInTime" className="field-label !mb-0">Check-In Time</Label>
                             <Input id="checkInTime" name="checkInTime" type="time" value={logData.checkInTime} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="checkOutTime" className="field-label !mb-0">Check-Out Time</Label>
                             <Input id="checkOutTime" name="checkOutTime" type="time" value={logData.checkOutTime} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
                        </div>
                    </div>
                     <div className="space-y-2">
                         <Label htmlFor="logSummary" className="field-label !mb-0">Work Log Summary</Label>
                        <Textarea id="logSummary" name="logSummary" value={logData.logSummary} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" placeholder="Summarize the work completed, challenges faced, and next steps..."/>
                    </div>
                </div>
                <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Log Assignment</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
