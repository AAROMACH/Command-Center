'use client';
import { cn } from "@/lib/utils";

type StatCardProps = {
    label: string;
    value: string;
    delta: string;
    deltaType: 'positive' | 'negative' | 'neutral';
}

export function StatCard({ label, value, delta, deltaType }: StatCardProps) {
    return (
        <div className="bg-bg-secondary p-6">
            <div className="flex justify-between items-center mb-2">
                <p className="stat-label">{label}</p>
                <p className={cn("stat-delta", {
                    'stat-delta-positive': deltaType === 'positive',
                    'stat-delta-negative': deltaType === 'negative',
                    'stat-delta-neutral': deltaType === 'neutral',
                })}>
                    {delta}
                </p>
            </div>
            <p className="stat-value">{value}</p>
        </div>
    )
}
