'use client';

import type { TimesheetLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Search, Plus, Check, Circle, Camera, Calendar as CalendarIcon, ChevronsUpDown } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, parse } from 'date-fns';
import { cn } from '@/lib/utils';

const TimesheetCard = ({ log, tech, viewBy }: { log: TimesheetLog; tech?: Technician; viewBy: 'tech' | 'date' }) => {
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
                <div className="ts-log-section">
                    <div className="ts-log-label">Daily Work Log</div>
                    <p className="ts-log-summary">{log.logSummary}</p>
                    <div className="ts-log-tasks">
                        {log.completedTasks.map(task => <div key={task} className="ts-task-pill done"><Check size={11}/> {task}</div>)}
                        {log.inProgressTasks.map(task => <div key={task} className="ts-task-pill progress"><Circle size={11} fill="currentColor"/> {task}</div>)}
                    </div>

                    <div className="mt-4">
                        <div className="ts-log-label">Site Photos</div>
                        <div className="ts-photos">
                            {log.photos.map((photoUrl, index) => (
                                <div key={index} className="ts-photo">
                                    <Image src={photoUrl} alt={`Site photo ${index + 1}`} width={60} height={60} className="object-cover w-full h-full rounded-[inherit]" />
                                </div>
                            ))}
                            <button className="ts-photo !border-dashed">
                                <Plus size={24}/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
};


export function TimesheetsTab({ timesheets, technicians }: TimesheetsTabProps) {
    const [viewBy, setViewBy] = useState<'tech' | 'date'>('date');
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [search, setSearch] = useState('');

    const getTechnician = (id: string) => technicians.find(t => t.id === id);

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
    }, [timesheets, date, search]);

    const groupedData = useMemo(() => {
        if (viewBy === 'tech') {
            const byTech = filteredTimesheets.reduce((acc, log) => {
                (acc[log.technicianId] = acc[log.technicianId] || []).push(log);
                return acc;
            }, {} as Record<string, TimesheetLog[]>);
            
            return Object.entries(byTech).map(([techId, logs]) => ({
                id: techId,
                title: getTechnician(techId)?.name || 'Unknown',
                logs,
            }));
        } else {
            const byDate = filteredTimesheets.reduce((acc, log) => {
                (acc[log.date] = acc[log.date] || []).push(log);
                return acc;
            }, {} as Record<string, TimesheetLog[]>);

            return Object.entries(byDate).map(([date, logs]) => ({
                id: date,
                title: date,
                logs,
            })).sort((a,b) => new Date(b.id).getTime() - new Date(a.id).getTime());
        }
    }, [filteredTimesheets, viewBy]);

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
                    <Button variant="outline" size="sm">Export CSV</Button>
                </div>
            </div>
            
            {groupedData.length > 0 ? (
                 <Accordion type="multiple" defaultValue={groupedData.map(g => g.id)} className="w-full space-y-2">
                    {groupedData.map(group => (
                        <AccordionItem key={group.id} value={group.id} className="accordion-item">
                            <AccordionTrigger className="accordion-trigger">
                                <div className="flex items-center gap-3">
                                    {viewBy === 'tech' && getTechnician(group.id) && <Avatar className="h-6 w-6"><AvatarImage src={getTechnician(group.id)?.avatarUrl}/></Avatar>}
                                    {group.title}
                                </div>
                                <span className="text-xs text-text-muted">{group.logs.length} log(s)</span>
                            </AccordionTrigger>
                            <AccordionContent className="accordion-content">
                                <div className="space-y-2">
                                {group.logs.map(log => (
                                    <TimesheetCard key={log.id} log={log} tech={getTechnician(log.technicianId)} viewBy={viewBy} />
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
        </div>
    );
}
