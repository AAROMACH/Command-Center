
'use client';

import type { Project, ProjectDailyLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Search, Plus, Check, Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, Clock, Pencil, Trash2, User, Save, X, History, Info, ClipboardCheck } from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, parse, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { LogAssignmentDialog } from './log-assignment-dialog';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const TimesheetLogDetails = ({ log }: { log: ProjectDailyLog }) => (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Field Activity Report</div>
        <p className="text-[11px] text-text-secondary leading-relaxed italic">&quot;{log.workSummary}&quot;</p>
      </div>
      
      <div className="flex flex-wrap gap-1">
        {(log.taskIdsCompleted || []).map((taskId) => (
          <div key={taskId} className="inline-flex items-center gap-1 rounded-full bg-green-dim border border-green-border px-2 py-0.5 text-[9px] font-bold text-text-green uppercase tracking-tighter">
            <Check size={10} /> Task Verified: {taskId.split('-')[1]}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Site Evidence</div>
        <div className="flex flex-wrap gap-2">
          {(log.photoUrls || []).map((photoUrl, index) => (
            <div key={index} className="relative h-14 w-20 rounded border border-border-sub bg-bg-tertiary overflow-hidden group cursor-pointer hover:border-brand-red transition-colors">
              <Image
                src={photoUrl}
                alt={`Site photo ${index + 1}`}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
);

const TimesheetCard = ({ log, tech, viewBy, onEdit }: { log: ProjectDailyLog; tech?: Technician; viewBy: 'tech' | 'date'; onEdit: (log: ProjectDailyLog) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="ts-card hover:border-border-default transition-colors">
            <div className="flex items-center gap-4 p-2">
                {tech && (
                    <div className="flex items-center gap-2 min-w-[150px]">
                        <Avatar className="h-6 w-6 border border-border-sub">
                            <AvatarImage src={tech.avatarUrl} alt={tech.name}/>
                            <AvatarFallback className="text-[8px]">{tech.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col text-left">
                            <span className="text-[11px] font-bold text-text-primary uppercase tracking-tight truncate">{tech.name}</span>
                            {viewBy === 'tech' && <span className="text-[8px] text-text-muted font-bold uppercase">{log.date}</span>}
                        </div>
                    </div>
                )}
                
                <div className="flex-1 grid grid-cols-2 gap-6">
                    <div className="flex flex-col text-left">
                        <span className="text-[8px] font-bold uppercase text-text-muted tracking-widest">Temporal Entry</span>
                        <span className="text-[11px] font-mono font-bold text-text-green">{log.date}</span>
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[8px] font-bold uppercase text-text-muted tracking-widest">Session Total</span>
                        <span className="text-[11px] font-mono font-bold text-text-primary">{log.totalHours}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="active" className="h-5 text-[8px] uppercase tracking-widest px-2">Verified</Badge>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(log); }}
                        className="p-1 hover:bg-bg-tertiary rounded transition-colors text-text-muted hover:text-brand-red"
                    >
                        <Pencil size={14}/>
                    </button>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 hover:bg-bg-tertiary rounded transition-colors text-text-muted hover:text-text-primary"
                    >
                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    </button>
                </div>
            </div>
            
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-border-sub bg-bg-primary/20 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="pt-4 text-left">
                        <TimesheetLogDetails log={log} />
                    </div>
                </div>
            )}
        </div>
    )
};

export function TimesheetsTab({ timesheets, technicians, project }: { timesheets: ProjectDailyLog[]; technicians: Technician[]; project: Project }) {
    const [viewBy, setViewBy] = useState<'tech' | 'date'>('date');
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const [isEditLogOpen, setIsEditLogOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<ProjectDailyLog | null>(null);
    const { toast } = useToast();

    const isReadOnly = project.status === 'completed';

    const getTechnician = useCallback((id: string) => technicians.find(t => t.id === id), [technicians]);

    const filteredTimesheets = useMemo(() => {
        let filtered = timesheets;
        
        if (date?.from && date?.to) {
            filtered = filtered.filter(log => {
                const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                return isWithinInterval(logDate, { start: date.from!, end: date.to! });
            });
        }
        
        if(search) {
            const lowercasedSearch = search.toLowerCase();
            filtered = filtered.filter(log => {
                const tech = getTechnician(log.technicianId);
                return tech?.name.toLowerCase().includes(lowercasedSearch) || log.date.toLowerCase().includes(lowercasedSearch);
            });
        }
        
        return filtered;
    }, [timesheets, date, search, getTechnician]);

    const groupedData = useMemo(() => {
        if (viewBy === 'tech') {
            const byTech = filteredTimesheets.reduce((acc, log) => {
                const techId = log.technicianId;
                if (!acc[techId]) {
                    acc[techId] = { logs: [], totalHoursNum: 0 };
                }
                acc[techId].logs.push(log);
                acc[techId].totalHoursNum += (log.hoursWorked || 0);
                return acc;
            }, {} as Record<string, { logs: ProjectDailyLog[]; totalHoursNum: number }>);
            
            return Object.entries(byTech).map(([techId, data]) => {
                const tech = getTechnician(techId);
                return {
                    id: techId,
                    title: tech?.name || 'Unknown',
                    avatarUrl: tech?.avatarUrl,
                    logs: data.logs,
                    totalTime: `${data.totalHoursNum.toFixed(1)}h`,
                }
            });
        } else {
            const byDate = filteredTimesheets.reduce((acc, log) => {
                 if (!acc[log.date]) {
                    acc[log.date] = { logs: [], totalHoursNum: 0 };
                }
                acc[log.date].logs.push(log);
                acc[log.date].totalHoursNum += (log.hoursWorked || 0);
                return acc;
            }, {} as Record<string, { logs: ProjectDailyLog[], totalHoursNum: number }>);

            return Object.entries(byDate).map(([date, data]) => ({
                id: date,
                title: date,
                logs: data.logs,
                totalTime: `${data.totalHoursNum.toFixed(1)}h`,
            })).sort((a,b) => b.id.localeCompare(a.id));
        }
    }, [filteredTimesheets, viewBy, getTechnician]);

    const handleManualLog = async (newLog: any) => {
        try {
            const logHours = newLog.totalMinutes / 60;
            await addDoc(collection(db, 'projectDailyLogs'), {
                ...newLog,
                projectId: project.id,
                hoursWorked: logHours
            });

            const projectRef = doc(db, 'projects', project.id);
            await updateDoc(projectRef, {
                actualHours: (project.actualHours || 0) + logHours
            });

            toast({ title: 'Session Transmitted', description: 'Timesheet log committed to project registry.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const handleOpenEdit = (log: ProjectDailyLog) => {
        if (isReadOnly) return;
        setEditingLog(log);
        setIsEditLogOpen(true);
    };

    const handleUpdateLog = async (updatedLog: ProjectDailyLog) => {
        if (!editingLog) return;
        try {
            const logRef = doc(db, 'projectDailyLogs', updatedLog.id);
            const oldHours = editingLog.hoursWorked || 0;
            const newHours = updatedLog.hoursWorked || 0;
            
            await updateDoc(logRef, {
                ...updatedLog
            });

            if (oldHours !== newHours) {
                const projectRef = doc(db, 'projects', project.id);
                await updateDoc(projectRef, {
                    actualHours: (project.actualHours || 0) - oldHours + newHours
                });
            }

            toast({ title: 'Registry Synchronized', description: 'Timesheet parameters have been updated.' });
            setIsEditLogOpen(false);
            setEditingLog(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        }
    };

    const handleDeleteLog = async (logId: string) => {
        const logToDelete = timesheets.find(l => l.id === logId);
        if (!logToDelete) return;
        
        try {
            await deleteDoc(doc(db, 'projectDailyLogs', logId));
            const projectRef = doc(db, 'projects', project.id);
            await updateDoc(projectRef, {
                actualHours: Math.max(0, (project.actualHours || 0) - (logToDelete.hoursWorked || 0))
            });
            toast({ title: 'Record Purged', description: 'Timesheet entry removed from operational ledger.' });
            setIsEditLogOpen(false);
            setEditingLog(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Purge Failed', description: e.message });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-bg-secondary border border-border-main shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-brand-red-dim rounded-lg border border-brand-red/20 text-brand-red">
                        <Clock size={20} />
                    </div>
                    <div className="text-left">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Master Project Tally</p>
                        <p className="text-xl font-mono font-bold text-text-primary">{(project.actualHours || 0).toFixed(1)} Total Hours Logged</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="h-9 px-6 text-[10px] font-bold uppercase tracking-widest border-border-sub" onClick={() => toast({ title: "CSV Export Initiated", description: "Generating high-fidelity timesheet manifest." })}>
                    <Download size={14} className="mr-1.5"/> Export Audit Manifest
                </Button>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 p-2 bg-bg-secondary/30 rounded-lg border border-border-sub">
                <div className="flex items-center gap-1.5 bg-bg-tertiary p-0.5 rounded border border-border-sub">
                    <Button onClick={() => setViewBy('date')} variant="ghost" className={cn("h-7 px-3 text-[10px] uppercase font-bold", viewBy === 'date' ? "bg-bg-secondary text-brand-red" : "text-text-muted")}>By Date</Button>
                    <Button onClick={() => setViewBy('tech')} variant="ghost" className={cn("h-7 px-3 text-[10px] uppercase font-bold", viewBy === 'tech' ? "bg-bg-secondary text-brand-red" : "text-text-muted")}>By Tech</Button>
                </div>
                
                <div className="flex items-center gap-3 flex-1 md:flex-none">
                    <div className="search-wrap !mb-0 flex-1 md:w-[180px]">
                        <Search />
                        <Input className="search-input !w-full !h-8" placeholder="Filter logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                     <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="date"
                            variant={"outline"}
                            size="sm"
                            className={cn(
                              "h-8 w-[200px] justify-start text-left font-normal text-[10px] uppercase tracking-widest",
                              !date && "text-text-muted"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                            {date?.from ? (
                              date.to ? (
                                <>
                                  {format(date.from, "MMM dd")} - {format(date.to, "MMM dd")}
                                </>
                              ) : (
                                format(date.from, "MMM dd")
                              )
                            ) : (
                              <span>Pick range</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={1}
                          />
                        </PopoverContent>
                      </Popover>
                    <div className="flex gap-2">
                        <Button 
                            variant="default" 
                            size="sm" 
                            className={cn("h-8 !text-[10px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover", isReadOnly && "opacity-50 cursor-not-allowed")}
                            onClick={() => !isReadOnly && setIsLogDialogOpen(true)}
                            disabled={isReadOnly}
                        >
                            <Plus size={14} className="mr-1.5"/> {isReadOnly ? 'Registry Locked' : 'Log Session'}
                        </Button>
                    </div>
                </div>
            </div>
            
            {groupedData.length > 0 ? (
                 <Accordion type="multiple" defaultValue={groupedData.map(g => g.id)} className="w-full space-y-3">
                    {groupedData.map((group : any) => (
                        <AccordionItem key={group.id} value={group.id} className="accordion-item border border-border-main bg-bg-secondary/40">
                            <AccordionTrigger className="accordion-trigger px-4 py-3 hover:bg-bg-tertiary/50 hover:no-underline border-none">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        {viewBy === 'tech' && group.avatarUrl && (
                                            <Avatar className="h-5 w-5 border border-border-sub">
                                                <AvatarImage src={group.avatarUrl}/>
                                            </Avatar>
                                        )}
                                        <span className="text-[11px] font-black uppercase tracking-widest text-text-primary">{group.title}</span>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] bg-bg-tertiary border-border-sub text-text-muted">{group.logs.length} RECORD(S)</Badge>
                                </div>
                                <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em] mr-4">
                                    {viewBy === 'date' ? 'Daily Hours:' : 'Tech Total Hours:'} <span className="text-text-primary font-mono text-xs">{group.totalTime}</span>
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="accordion-content px-2 pb-2 pt-0 space-y-1">
                                {group.logs.map((log: ProjectDailyLog) => (
                                    <TimesheetCard key={log.id} log={log} tech={getTechnician(log.technicianId)} viewBy={viewBy} onEdit={handleOpenEdit} />
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                 </Accordion>
            ) : (
                 <div className="p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                    <CalendarIcon size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No temporal records match the current filter parameters.</p>
                </div>
            )}

            <LogAssignmentDialog
                isOpen={isLogDialogOpen}
                setIsOpen={setIsLogDialogOpen}
                technicians={technicians}
                projectId={project.id}
                onLogAdded={handleManualLog}
            />

            {editingLog && (
                <EditLogDialog 
                    isOpen={isEditLogOpen}
                    setIsOpen={setIsEditLogOpen}
                    log={editingLog}
                    technicians={technicians}
                    onSave={handleUpdateLog}
                    onDelete={handleDeleteLog}
                />
            )}
        </div>
    );
}

function EditLogDialog({ 
    isOpen, 
    setIsOpen, 
    log, 
    technicians, 
    onSave,
    onDelete
}: { 
    isOpen: boolean, 
    setIsOpen: (o: boolean) => void, 
    log: ProjectDailyLog, 
    technicians: Technician[], 
    onSave: (l: ProjectDailyLog) => void,
    onDelete: (id: string) => void
}) {
    const normalizeDate = useCallback((dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return dateStr; // Already yyyy-MM-dd
            const [m, d, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
    }, []);

    const [formData, setFormData] = useState<ProjectDailyLog>({ 
        ...log,
        date: normalizeDate(log.date)
    });

    useEffect(() => {
        setFormData({
            ...log,
            date: normalizeDate(log.date)
        });
    }, [log, normalizeDate]);

    const handleSave = () => {
        try {
            const checkIn = parse(`${formData.date}T${formData.checkInTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
            const checkOut = parse(`${formData.date}T${formData.checkOutTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
            const diffMs = checkOut.getTime() - checkIn.getTime();
            
            if (diffMs < 0) return;

            const totalMinutes = Math.round(diffMs / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const hoursWorked = parseFloat((totalMinutes / 60).toFixed(1));

            onSave({
                ...formData,
                hoursWorked,
                totalHours: `${hours}h ${minutes}m`
            });
        } catch (e) {
            console.error("Temporal parsing error:", e);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[550px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden flex flex-col">
                <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <Pencil className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Edit Timesheet Log</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs uppercase font-bold text-text-muted">Modify mission duration and reporting details.</DialogDescription>
                </DialogHeader>

                <div className="p-6 space-y-6 text-left flex-1 overflow-y-auto">
                    <div className="space-y-3">
                        <h3 className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em] flex items-center gap-2">
                            <History size={12}/> Technician&apos;s Original Log
                        </h3>
                        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-bg-secondary border border-border-sub shadow-inner">
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase">Initial Date</p>
                                <p className="text-xs font-mono font-bold text-text-primary uppercase">{log.date}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase">Original Window</p>
                                <p className="text-xs font-mono font-bold text-text-primary uppercase">
                                    {log.checkInTime || 'N/A'} — {log.checkOutTime || 'N/A'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-2">
                            <span className="text-text-muted"><Info size={12} /></span>
                            <p className="text-[9px] text-text-muted font-bold uppercase">Reference values shown for audit integrity.</p>
                        </div>
                    </div>

                    <Separator className="bg-border-sub" />

                    <div className="space-y-6">
                        <h3 className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] px-1">Current Log Parameters</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Operative</Label>
                                <Select value={formData.technicianId} onValueChange={(val) => setFormData({...formData, technicianId: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {technicians.map(t => <SelectItem key={t.id} value={t.id} className="text-xs uppercase font-bold">{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Work Date</Label>
                                <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Check-In Time</Label>
                                <Input 
                                    type="time" 
                                    value={formData.checkInTime || '09:00'} 
                                    onChange={e => setFormData({...formData, checkInTime: e.target.value})} 
                                    className="h-10 bg-bg-primary text-sm font-mono font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Check-Out Time</Label>
                                <Input 
                                    type="time" 
                                    value={formData.checkOutTime || '17:00'} 
                                    onChange={e => setFormData({...formData, checkOutTime: e.target.value})} 
                                    className="h-10 bg-bg-primary text-sm font-mono font-bold"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Field Summary</Label>
                            <Textarea 
                                value={formData.workSummary} 
                                onChange={e => setFormData({...formData, workSummary: e.target.value})} 
                                className="bg-bg-primary text-xs min-h-[100px] leading-relaxed uppercase font-medium"
                                placeholder="Edit report summary..."
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex flex-row items-center justify-between gap-3">
                    <Button variant="outline" className="h-10 px-4 uppercase font-bold text-[10px] tracking-widest shrink-0 border-brand-red text-text-red hover:bg-brand-red-dim" onClick={() => onDelete(log.id)}>
                        <Trash2 size={16} className="mr-2"/> Purge Record
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-6 uppercase font-bold text-[10px] tracking-widest">Discard</Button>
                        <Button onClick={handleSave} className="h-10 px-8 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white shadow-lg">
                            <Save size={16} className="mr-2"/> Save Changes
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
