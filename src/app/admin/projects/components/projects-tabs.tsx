
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectsClient } from "./projects-client";
import type { Project, Technician } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

type SortOption = 'name' | 'date' | 'progress' | 'client';

type ProjectsTabsProps = {
    projects: Project[];
    technicians: Technician[];
    dateRange?: DateRange;
    setDateRange: (range: DateRange | undefined) => void;
    sortBy?: SortOption;
};

export function ProjectsTabs({ projects, technicians, dateRange, setDateRange, sortBy }: ProjectsTabsProps) {
    const activeProjects = projects.filter(p => p.status === 'active');
    const onHoldProjects = projects.filter(p => p.status === 'on-hold');
    const completedProjects = projects.filter(p => p.status === 'completed');

    return (
        <Tabs defaultValue="active" className="w-full">
            <div className="flex items-center justify-between gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
                <TabsList className="tabs !mb-0">
                  <TabsTrigger value="active" className="tab">
                    Active Projects <span className="tab-count">({activeProjects.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="on-hold" className="tab">
                    On Hold <span className="tab-count">({onHoldProjects.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="tab">
                    Completed <span className="tab-count">({completedProjects.length})</span>
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("h-8 px-4 border-border-main bg-bg-secondary text-[10px] font-bold uppercase tracking-widest", dateRange?.from && "border-brand-red text-brand-red")}>
                                <CalendarIcon size={12} className="mr-2 text-brand-red" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</>
                                    ) : (
                                        format(dateRange.from, "MM-dd-yyyy")
                                    )
                                ) : (
                                    "Select Date"
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={1}
                            />
                        </PopoverContent>
                    </Popover>
                    {dateRange?.from && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setDateRange(undefined)} className="h-8 w-8 text-text-muted hover:text-brand-red">
                            <X size={14} />
                        </Button>
                    )}
                </div>
            </div>
            
            <TabsContent value="active" className="mt-0">
              <ProjectsClient projects={activeProjects} technicians={technicians} sortBy={sortBy} />
            </TabsContent>
            <TabsContent value="on-hold" className="mt-0">
              <ProjectsClient projects={onHoldProjects} technicians={technicians} sortBy={sortBy} />
            </TabsContent>
            <TabsContent value="completed" className="mt-0">
              <ProjectsClient projects={completedProjects} technicians={technicians} sortBy={sortBy} />
            </TabsContent>
      </Tabs>
    );
}
