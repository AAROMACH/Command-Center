import Image from "next/image";
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  CircleUser,
  CreditCard,
  DollarSign,
  Menu,
  Package2,
  Search,
  Users,
  Wrench,
  Clock,
  AlertTriangle
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { workOrders, technicians } from "@/lib/data"

const chartData = [
  { status: "Completed", count: 120 },
  { status: "In-Progress", count: 45 },
  { status: "Unassigned", count: 12 },
  { status: "On Hold", count: 8 },
]

const chartConfig = {
  count: {
    label: "Work Orders",
  },
  completed: {
    label: "Completed",
    color: "hsl(var(--chart-2))",
  },
  "in-progress": {
    label: "In-Progress",
    color: "hsl(var(--chart-4))",
  },
  unassigned: {
    label: "Unassigned",
    color: "hsl(var(--chart-1))",
  },
  "on-hold": {
    label: "On Hold",
    color: "hsl(var(--muted-foreground))",
  },
}

export default function Dashboard() {
    const activeWorkOrders = workOrders.filter(wo => wo.status === 'in-progress' || wo.status === 'assigned').length;
    const techniciansOnline = technicians.length;
    const pendingApprovals = 5; // mock
    const newServiceRequests = workOrders.filter(wo => wo.status === 'unassigned').length;

    const recentAssignments = workOrders
      .filter(wo => wo.status === 'assigned' || wo.status === 'in-progress')
      .slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headline text-2xl font-bold tracking-tight">
          Admin Dashboard
      </h1>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Work Orders
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeWorkOrders}</div>
            <p className="text-xs text-muted-foreground">
              +12.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Technicians Online
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{techniciansOnline}</div>
            <p className="text-xs text-muted-foreground">
              +5 since last hour
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{pendingApprovals}</div>
            <p className="text-xs text-muted-foreground">
              Manifests & reimbursements
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/50 bg-primary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              New Service Requests
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{newServiceRequests}</div>
            <p className="text-xs text-primary/80">
              Require immediate assignment
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
         <Card>
          <CardHeader>
            <CardTitle>Recent Assignments</CardTitle>
            <CardDescription>
              A view of recently assigned and in-progress tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Priority</TableHead>
                  <TableHead className="text-right">Work Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAssignments.map(order => {
                    const tech = technicians.find(t => t.id === order.assignedTechnicianId);
                    return (
                        <TableRow key={order.id}>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Avatar className="hidden h-9 w-9 sm:flex">
                                        <AvatarImage asChild src={tech?.avatarUrl || ''} alt="Avatar">
                                            <Image src={tech?.avatarUrl || ''} alt={tech?.name || 'Technician'} width={36} height={36} />
                                        </AvatarImage>
                                        <AvatarFallback>{tech?.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="font-medium">{tech?.name}</div>
                                </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                                <Badge className="text-xs" variant={order.status === 'in-progress' ? "secondary" : "outline"}>
                                {order.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                                 <Badge variant={order.priority === 'high' || order.priority === 'critical' ? 'destructive' : 'default'} className="capitalize">{order.priority}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{order.id.toUpperCase()}</TableCell>
                        </TableRow>
                    )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Work Order Overview</CardTitle>
            <CardDescription>January - June 2024</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                    <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="count" radius={4} fill="var(--color-count, hsl(var(--primary)))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
