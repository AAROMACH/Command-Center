import {
  LayoutDashboard,
  FolderKanban,
  Users,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { StatCard } from './components/stat-card';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { WorkloadChart } from './components/workload-chart';
import { workOrders, technicians, projects } from '@/lib/data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
    const highPriorityJobs = workOrders.filter(wo => wo.status === 'unassigned' && (wo.priority === 'critical' || wo.priority === 'high'));

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
          <p className="page-subtitle">
            A high-level overview of all field service operations.
          </p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
         <StatCard 
            label="Active Assignments" 
            value={workOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress').length.toString()} 
            delta={`${workOrders.filter(wo => wo.status === 'unassigned').length} unassigned`} 
            deltaType="warning" 
            icon="Wrench"
        />
        <StatCard 
            label="Active Projects" 
            value={projects.filter(p => p.status === 'active').length.toString()} 
            delta="2 ongoing" 
            deltaType="neutral"
            icon="FolderKanban"
        />
        <StatCard 
            label="Total Technicians" 
            value={technicians.length.toString()} 
            delta={`${technicians.filter(t => t.currentWorkload === 0).length} available`}
            deltaType="neutral"
            icon="Users"
        />
        <StatCard 
            label="Critical Alerts" 
            value={highPriorityJobs.length.toString()} 
            delta="Action required" 
            deltaType="negative"
            icon="TriangleAlert"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
                <CardTitle>High Priority Queue</CardTitle>
                <CardDescription>Unassigned jobs that require immediate attention.</CardDescription>
            </CardHeader>
            <CardContent className="table-wrap !border-none !rounded-none p-0">
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
                                <TableCell>
                                    <Badge variant={job.priority === 'critical' || job.priority === 'high' ? 'high' : job.priority === 'medium' ? 'medium' : 'low'}>{job.priority}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="default" size="sm">Assign</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         {highPriorityJobs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">
                                    No critical jobs in the queue. Well done!
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
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
