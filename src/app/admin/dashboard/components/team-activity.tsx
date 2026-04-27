import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { technicians } from "@/lib/data";

const activities = [
    { techId: 'tech-001', action: 'completed job #WO-102', time: '15m ago' },
    { techId: 'tech-002', action: 'checked in at 321 Elm St', time: '2h ago' },
    { techId: 'tech-004', action: 'submitted weekly manifest', time: '4h ago' },
    { techId: 'tech-003', action: 'is en-route to 123 Main St', time: '5h ago' },
    { techId: 'tech-005', action: 'requested parts for #WO-106', time: '8h ago' },
];

export function TeamActivity() {
    // A real implementation would fetch this data
    return (
         <Card className="h-full">
            <CardHeader>
                <CardTitle>Technical Team Activity</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {activities.map((activity, index) => {
                        const tech = technicians.find(t => t.id === activity.techId);
                        if (!tech) return null;
                        return (
                            <div key={index} className="flex items-center gap-4">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage asChild src={tech.avatarUrl} alt={tech.name}>
                                        <Image src={tech.avatarUrl} alt={tech.name} width={36} height={36} />
                                    </AvatarImage>
                                    <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="body-text">
                                        <span className="font-bold text-text-primary">{tech.name}</span> {activity.action}
                                    </p>
                                </div>
                                <p className="text-xs text-text-muted flex-shrink-0">{activity.time}</p>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
