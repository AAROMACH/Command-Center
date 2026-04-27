import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { StatCard } from "./components/stat-card";
import { TechEfficiencyChart } from "./components/tech-efficiency-chart";
import { TechnicianJobVolumeChart } from "./components/technician-job-volume-chart";

const stats = [
    { label: "Total Tech Jobs", value: "1,482", delta: "+12.1%", deltaType: "positive" as const },
    { label: "Active Technicians", value: "37", delta: "-2", deltaType: "negative" as const },
    { label: "Avg Compliance", value: "98.2%", delta: "+0.5%", deltaType: "positive" as const },
    { label: "Avg Response", value: "24m", delta: "+3m", deltaType: "neutral" as const },
]

export default function DashboardPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Technical Operations Center</p>
          <h1 className="page-title">Operations Overview</h1>
          <p className="page-subtitle">Real-time analysis of field service performance and system status.</p>
        </div>
        <div className="page-header-right">
          <Button variant="outline">Broadcast Alert</Button>
          <Button variant="secondary">Access Financial Hub</Button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
        {stats.map(stat => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} deltaType={stat.deltaType} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <TechnicianJobVolumeChart />
        <TechEfficiencyChart />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Technical Team Activity</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-center h-48 text-center">
                    <p className="section-label">No recent activity logs</p>
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>System Security</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center h-48 text-center gap-4">
                <p className="body-text max-w-xs">Enterprise-wide security protocols are active. All data streams are monitored and verified.</p>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-text-green">
                        <Shield size={16} />
                        <span className="text-sm font-bold">Secure Protocol</span>
                    </div>
                     <div className="inline-flex items-center rounded-sm border border-brand-red px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-brand-red">
                        Encrypted
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  )
}
