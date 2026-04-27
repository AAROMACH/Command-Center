import { LayoutDashboard } from 'lucide-react';
import { workOrders, technicians, projects } from '@/lib/data';
import { StatCard } from './components/stat-card';
import { WorkloadChart } from './components/workload-chart';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
    const activeAssignments = workOrders.filter(wo => ['assigned', 'in-progress'].includes(wo.status)).length;
    const unassignedJobs = workOrders.filter(wo => wo.status === 'unassigned').length;
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const totalTechnicians = technicians.length;
    
    const highPriorityJobs = workOrders.filter(wo => wo.status === 'unassigned' && (wo.priority === 'high' || wo.priority === 'critical'));

    const workloadData = technicians.map(tech => ({
        name: tech.name,
        assigned: workOrders.filter(wo => wo.assignedTechnicianId === tech.id && wo.status !== 'completed').length
    }));


    return (
        <div>
            <header className="page-header">
                <div>
                  <p className="page-eyebrow flex items-center gap-2">
                    <LayoutDashboard size={12} />
                    Command Center
                  </p>
                  <h1 className="page-title">Dashboard</h1>
                  <p className="page-subtitle">A high-level overview of all field service operations.</p>
                </div>
            </header>

             <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
                <StatCard label="Active Assignments" value={activeAssignments.toString()} delta={`${unassignedJobs} unassigned`} deltaType={unassignedJobs > 0 ? 'warning' : 'neutral'} icon="Wrench" />
                <StatCard label="Active Projects" value={activeProjects.toString()} delta={`${activeProjects} ongoing`} deltaType='neutral' icon="FolderKanban" />
                <StatCard label="Total Technicians" value={totalTechnicians.toString()} delta={`${technicians.filter(t => t.currentWorkload === 0).length} available`} deltaType='neutral' icon="Users" />
                <StatCard label="Critical Alerts" value="1" delta={`3 technicians offline`} deltaType='negative' icon="AlertTriangle" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>High Priority Queue</CardTitle>
                            <CardDescription>Unassigned jobs that require immediate attention.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="table-wrap !border-none !rounded-none p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Work Order</TableHead>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Location</TableHead>
                                            <TableHead>Priority</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {highPriorityJobs.map(job => (
                                            <TableRow key={job.id}>
                                                <TableCell>
                                                    <div className="cell-id !mb-0">{job.id.toUpperCase()}</div>
                                                    <div className="text-sm text-text-secondary">{job.description}</div>
                                                </TableCell>
                                                <TableCell>{job.clientName}</TableCell>
                                                <TableCell>{job.location}</TableCell>
                                                <TableCell><Badge variant={job.priority === 'critical' ? 'high' : 'medium'}>{job.priority}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="default" size="sm">Assign</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                         {highPriorityJobs.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center h-24">
                                                    No high-priority jobs in the queue.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                    </Card>
                </div>
                <div>
                     <Card>
                        <CardHeader>
                            <CardTitle>Technician Workload</CardTitle>
                            <CardDescription>Current open assignments per technician.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WorkloadChart data={workloadData} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
