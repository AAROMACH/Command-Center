'use client';

import type { TimesheetLog, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Search, Plus, Check, Circle, Camera } from 'lucide-react';
import React from 'react';

type TimesheetsTabProps = {
    timesheets: TimesheetLog[];
    technicians: Technician[];
};


export function TimesheetsTab({ timesheets, technicians }: TimesheetsTabProps) {
    const getTechnician = (id: string) => technicians.find(t => t.id === id);

    if (timesheets.length === 0) {
        return (
            <div className="empty-state">
                More timesheets appear here as techs log work daily
            </div>
        );
    }
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-text-secondary">{timesheets.length} technician · {timesheets.length} day logged</div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">Export CSV</Button>
                    <div className="search-wrap">
                        <Search />
                        <Input className="search-input !w-[200px]" placeholder="Filter by tech or date..." />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {timesheets.map(log => {
                    const tech = getTechnician(log.technicianId);
                    return (
                        <div key={log.id} className="ts-card">
                            <header className="ts-card-header">
                                <Avatar className="ts-tech-avatar">
                                    {tech && <AvatarImage src={tech.avatarUrl} alt={tech.name}/>}
                                    <AvatarFallback>{tech ? tech.name.split(' ').map(n => n[0]).join('') : '?'}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="ts-tech-name">{tech?.name || 'Unknown Technician'}</div>
                                    <div className="ts-tech-date">{log.date}</div>
                                </div>
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
                })}
            </div>
             <div className="empty-state bg-bg-secondary border border-border-default rounded-lg mt-3">
              More timesheets appear here as techs log work daily
            </div>
        </div>
    );
}
