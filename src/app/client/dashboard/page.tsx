'use client';

import { useState, useEffect, useMemo } from 'react';
import { projects, serviceRequests, technicians } from '@/lib/data';
import type { Project, ServiceRequest, Technician } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    LayoutDashboard, 
    Briefcase, 
    ClipboardList, 
    Plus, 
    ArrowUpRight,
    MapPin,
    Calendar,
    ChevronRight
} from 'lucide-react';
import Link from 'next/link';

export default function ClientDashboardPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const myProjects = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return projects.filter(p => p.client === currentUser.clientCompany);
    }, [currentUser]);

    const myRequests = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return serviceRequests.filter(r => r.clientName === currentUser.clientCompany);
    }, [currentUser]);

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        Client Portal
                    </p>
                    <h1 className="page-title">Welcome, {currentUser?.name}</h1>
                    <p className="page-subtitle">Real-time status for {currentUser?.clientCompany} deployments.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="default">
                        <Plus size={14} className="mr-2"/>
                        Submit Service Request
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Briefcase size={12} className="text-brand-red"/> Active Projects
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">{myProjects.filter(p => p.status === 'active').length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <ClipboardList size={12} className="text-accent-gold"/> Pending Requests
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">{myRequests.filter(r => r.status === 'new').length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <ArrowUpRight size={12} className="text-text-green"/> Completed (MTD)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">
                            {myProjects.filter(p => p.status === 'completed').length + myRequests.filter(r => r.status === 'closed').length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Deployment Progress</CardTitle>
                        <CardDescription>Status tracking for your strategic initiatives.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border-sub">
                            {myProjects.map(project => (
                                <div key={project.id} className="p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors group cursor-pointer">
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{project.name}</p>
                                        <div className="flex items-center gap-3 text-[10px] text-text-muted font-bold">
                                            <span className="flex items-center gap-1"><MapPin size={10}/> {project.location}</span>
                                            <span className="flex items-center gap-1"><Calendar size={10}/> Started {project.startDate}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge variant={project.status === 'active' ? 'active' : 'completed'}>
                                            {project.status.toUpperCase()}
                                        </Badge>
                                        <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all"/>
                                    </div>
                                </div>
                            ))}
                            {myProjects.length === 0 && (
                                <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No active projects found.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recent Service Requests</CardTitle>
                        <CardDescription>Review and track individual service tickets.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border-sub">
                            {myRequests.map(request => (
                                <div key={request.id} className="p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors group cursor-pointer">
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{request.description}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                            <span>ID: {request.id}</span>
                                            <span>•</span>
                                            <span>{request.requestType}</span>
                                        </div>
                                    </div>
                                    <Badge variant={request.status === 'new' ? 'pending' : 'active'} className="normal-case">
                                        {request.status}
                                    </Badge>
                                </div>
                            ))}
                             {myRequests.length === 0 && (
                                <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No requests submitted.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
