'use client';

import type { TimesheetLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Search, Plus, Check, Circle, Calendar as CalendarIcon, ChevronsUpDown } from 'lucide-react';
import React, { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { LogAssignmentDialog } from './log-assignment-dialog';
import { useToast } from '@/hooks/use-toast';

const TimesheetLogDetails = ({ log }: { log: TimesheetLog }) => (
    <div className="ts-log-section">
      <div className="ts-log-label">Daily Work Log</div>
      <p className="ts-log-summary">{log.logSummary}</p>
      <div className="ts-log-tasks">
        {log.completedTasks.map((task) => (
          <div key={task} className="ts-task-pill done">
            <Check size={11} /> {task}
          </div>
        ))}
        {log.inProgressTasks.map((task) => (
          <div key={task} className="ts-task-pill progress">
            <Circle size={11} fill="currentColor" /> {task}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="ts-log-label">Site Photos</div>
        <div className="ts-photos">
          {log.photos.map((photoUrl, index) => (
            <div key={index} className="ts-photo">
              <Image
                src={photoUrl}
                alt={`Site photo ${index + 1}`}
                width={60}
                height={60}
                className="h-full w-full rounded-[inherit] object-cover"
              />
            </div>
          ))}
          <button className="ts-photo !border-dashed">
            <Plus size={24} />
          </button>
        </div>
      </div>
    </div>
);


const TimesheetCard = ({ log, tech, viewBy }: { log: TimesheetLog; tech?: Technician; viewBy: 'tech' | 'date' }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="ts-card">
            <header className="ts-card-header">
                {tech && (
                    <>
                        <Avatar className="ts-tech-avatar">
                            <AvatarImage src={tech.avatarUrl} alt={tech.name}/>
                            <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="ts-tech-name">{tech.name}</div>
                            {viewBy === 'tech' && <div className="ts-tech-date">{log.date}</div>}
                        </div>
                    </>
                )}
                <div className="ts-badge-wrap">
                    <Badge variant="active">Checked Out</Badge>
                    <div className="font-semibold text-sm text-text-primary">{log.totalHours}</div>
                </div>
            </header>
            <div className="ts-body">
                <div className="ts-checkin-row">
                    <div className="ts-field">
                        <div className="ts-field-label">Check-In</div>
                        <div className="ts-field-val text-text-green">{log.checkInTime}</div>
                        <div className="text-xs text-text-muted mt-0.5">On-site · GPS verified</div>
                    </div>
                    <div className="ts-field">
                        <div className="ts-field-label">Check-Out</div>
                        <div className="ts-field-val text-accent-gold">{log.checkOutTime}</div>
                         <div className="text-xs text-text-muted mt-0.5">On-site · GPS verified</div>
                    </div>
                    <div className="ts-field">
                        <div className="ts-field-label">Total Hours</div>
                        <div className="ts-field-val">{log.totalHours}</div>
                        <div className="text-xs text-text-muted mt-0.5">{log.totalMinutes} minutes</div>
                    </div>
                </div>
                
                <div className="border-t border-border-subtle pt-2 mt-2">
                    <button className="flex w-full items-center justify-between rounded-md p-2 text-xs font-bold uppercase tracking-wider text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary" onClick={() => setIsExpanded(!isExpanded)}>
                        <span>{isExpanded ? 'Hide' : 'Show'} Daily Work Log</span>
                        <ChevronsUpDown className={`h-4 w-4 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                        <div className="pt-2">
                             <TimesheetLogDetails log={log} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
};

type TimesheetsTabProps = {
    timesheets: TimesheetLog[];
    setTimesheets: React.Dispatch<React.SetStateAction<TimesheetLog[]>>;
    technicians: Technician[];
    projectId: string;
};


export function TimesheetsTab({ timesheets, setTimesheets, technicians, projectId }: TimesheetsTabProps) {
    const [viewBy, setViewBy] = useState<'tech' | 'date'>('date');
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
    const { toast } = useToast();

    const getTechnician = useCallback((id: string) => technicians.find(t => t.id === id), [technicians]);

    const filteredTimesheets = useMemo(() => {
        let filtered = timesheets;
        
        if (date?.from && date?.to) {
            filtered = filtered.filter(log => {
                const logDate = parse(log.date, 'EEEE, MMMM d, yyyy', new Date());
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
        const formatMinutes = (minutes: number) => {
            if (!minutes) return '0h 0m';
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${h}h ${m}m`;
        };

        if (viewBy === 'tech') {
            const byTech = filteredTimesheets.reduce((acc, log) => {
                const techId = log.technicianId;
                if (!acc[techId]) {
                    acc[techId] = { logs: [], totalMinutes: 0 };
                }
                acc[techId].logs.push(log);
                acc[techId].totalMinutes += log.totalMinutes;
                return acc;
            }, {} as Record<string, { logs: TimesheetLog[]; totalMinutes: number }>);
            
            return Object.entries(byTech).map(([techId, data]) => {
                const tech = getTechnician(techId);
                return {
                    id: techId,
                    title: tech?.name || 'Unknown',
                    avatarUrl: tech?.avatarUrl,
                    logs: data.logs,
                    totalTime: formatMinutes(data.totalMinutes),
                }
            });
        } else {
            const byDate = filteredTimesheets.reduce((acc, log) => {
                 if (!acc[log.date]) {
                    acc[log.date] = { logs: [], totalMinutes: 0 };
                }
                acc[log.date].logs.push(log);
                acc[log.date].totalMinutes += log.totalMinutes;
                return acc;
            }, {} as Record<string, { logs: TimesheetLog[], totalMinutes: number }>);

            return Object.entries(byDate).map(([date, data]) => ({
                id: date,
                title: date,
                logs: data.logs,
                totalTime: formatMinutes(data.totalMinutes),
            })).sort((a,b) => new Date(b.id).getTime() - new Date(a.id).getTime());
        }
    }, [filteredTimesheets, viewBy, getTechnician]);

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <Button onClick={() => setViewBy('date')} variant={viewBy === 'date' ? 'default' : 'outline'} size="sm">Group by Date</Button>
                    <Button onClick={() => setViewBy('tech')} variant={viewBy === 'tech' ? 'default' : 'outline'} size="sm">Group by Tech</Button>
                </div>
                <div className="flex items-center gap-2">
                    <div className="search-wrap">
                        <Search />
                        <Input className="search-input !w-[200px]" placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                     <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="date"
                            variant={"outline"}
                            size="sm"
                            className={cn(
                              "w-[240px] justify-start text-left font-normal",
                              !date && "text-text-muted"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                              date.to ? (
                                <>
                                  {format(date.from, "LLL dd, y")} -{" "}
                                  {format(date.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(date.from, "LLL dd, y")
                              )
                            ) : (
                              <span>Pick a date range</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-bg-elevated" align="end">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                          />
                        </PopoverContent>
                      </Popover>
                    <Button variant="outline" size="sm" onClick={() => toast({ title: "CSV Export Initiated", description: "Generating high-fidelity timesheet manifest." })}>Export CSV</Button>
                    <Button variant="default" size="sm" onClick={() => setIsLogDialogOpen(true)}>
                        <Plus size={14} className="mr-2"/> New Log
                    </Button>
                </div>
            </div>
            
            {groupedData.length > 0 ? (
                 <Accordion type="multiple" defaultValue={groupedData.map(g => g.id)} className="w-full space-y-2">
                    {groupedData.map((group : any) => (
                        <AccordionItem key={group.id} value={group.id} className="accordion-item">
                            <AccordionTrigger className="accordion-trigger">
                                <div className="flex items-center gap-3">
                                    {viewBy === 'tech' && group.avatarUrl && <Avatar className="h-6 w-6"><AvatarImage src={group.avatarUrl}/></Avatar>}
                                    {group.title}
                                </div>
                                <span className="text-xs text-text-muted">{group.logs.length} log(s) · <span className="font-bold text-text-primary">{group.totalTime}</span></span>
                            </AccordionTrigger>
                            <AccordionContent className="accordion-content">
                                <div className="space-y-2">
                                {group.logs.map((log: TimesheetLog) => (
                                    <TimesheetCard key={log.assignmentId} log={log} tech={getTechnician(log.technicianId)} viewBy={viewBy} />
                                ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                 </Accordion>
            ) : (
                 <div className="empty-state">
                    No timesheets match your filters.
                </div>
            )}

            <LogAssignmentDialog
                isOpen={isLogDialogOpen}
                setIsOpen={setIsLogDialogOpen}
                technicians={technicians}
                projectId={projectId}
                onLogAdded={(newLog) => setTimesheets(currentLogs => [newLog, ...currentLogs])}
            />
        </div>
    );
}
