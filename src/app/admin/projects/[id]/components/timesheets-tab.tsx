
'use client';

import type { ProjectDailyLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Search, Plus, Check, Circle, Calendar as CalendarIcon, ChevronDown, ChevronUp, Download } from 'lucide-react';
import React, { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { LogAssignmentDialog } from './log-assignment-dialog';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, deleteDoc } from 'firebase/firestore';

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
          <button className="h-14 w-14 rounded border-2 border-dashed border-border-sub flex items-center justify-center text-text-muted hover:border-brand-red hover:text-brand-red transition-all">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
);


const TimesheetCard = ({ log, tech, viewBy }: { log: ProjectDailyLog; tech?: Technician; viewBy: 'tech' | 'date' }) => {
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
                        <span className="text-[11px] font-mono font-bold text-text-primary">{log.hoursWorked} HOURS</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="active" className="h-5 text-[8px] uppercase tracking-widest px-2">Verified</Badge>
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

type TimesheetsTabProps = {
    timesheets: ProjectDailyLog[];
    technicians: Technician[];
    projectId: string;
    projectStatus?: string;
};


export function TimesheetsTab({ timesheets, technicians, projectId, projectStatus }: TimesheetsTabProps) {
    const [viewBy, setViewBy] = useState<'tech' | 'date'>('date');
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const { toast } = useToast();

    const isReadOnly = projectStatus === 'completed';

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
                    acc[techId] = { logs: [], totalHours: 0 };
                }
                acc[techId].logs.push(log);
                acc[techId].totalHours += log.hoursWorked;
                return acc;
            }, {} as Record<string, { logs: ProjectDailyLog[]; totalHours: number }>);
            
            return Object.entries(byTech).map(([techId, data]) => {
                const tech = getTechnician(techId);
                return {
                    id: techId,
                    title: tech?.name || 'Unknown',
                    avatarUrl: tech?.avatarUrl,
                    logs: data.logs,
                    totalTime: `${data.totalHours.toFixed(1)}h`,
                }
            });
        } else {
            const byDate = filteredTimesheets.reduce((acc, log) => {
                 if (!acc[log.date]) {
                    acc[log.date] = { logs: [], totalHours: 0 };
                }
                acc[log.date].logs.push(log);
                acc[log.date].totalHours += log.hoursWorked;
                return acc;
            }, {} as Record<string, { logs: ProjectDailyLog[], totalHours: number }>);

            return Object.entries(byDate).map(([date, data]) => ({
                id: date,
                title: date,
                logs: data.logs,
                totalTime: `${data.totalHours.toFixed(1)}h`,
            })).sort((a,b) => b.id.localeCompare(a.id));
        }
    }, [filteredTimesheets, viewBy, getTechnician]);

    const handleManualLog = async (newLog: ProjectDailyLog) => {
        try {
            await addDoc(collection(db, 'projectDailyLogs'), {
                ...newLog,
                projectId
            });
            toast({ title: 'Session Transmitted', description: 'Timesheet log committed to project registry.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    return (
        <div className="space-y-4">
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
                        <Button variant="outline" size="sm" className="h-8 !text-[10px] uppercase font-bold tracking-widest" onClick={() => toast({ title: "CSV Export Initiated", description: "Generating high-fidelity timesheet manifest." })}>
                            <Download size={14} className="mr-1.5"/> CSV
                        </Button>
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
                        <AccordionItem key={group.id} value={group.id} className="accordion-item border border-border-sub bg-bg-secondary/40">
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
                                <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em] mr-4">Total Time: <span className="text-text-primary font-mono text-xs">{group.totalTime}</span></span>
                            </AccordionTrigger>
                            <AccordionContent className="accordion-content px-2 pb-2 pt-0 space-y-1">
                                {group.logs.map((log: ProjectDailyLog) => (
                                    <TimesheetCard key={log.id} log={log} tech={getTechnician(log.technicianId)} viewBy={viewBy} />
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
                projectId={projectId}
                onLogAdded={handleManualLog}
            />
        </div>
    );
}
