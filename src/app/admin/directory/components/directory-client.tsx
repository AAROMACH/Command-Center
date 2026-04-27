'use client';
import { useState } from 'react';
import type { Technician } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, Mail, MessageSquare, MapPin } from 'lucide-react';
import Image from 'next/image';

type DirectoryClientProps = {
    technicians: Technician[];
};

export function DirectoryClient({ technicians }: DirectoryClientProps) {
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {technicians.map(tech => (
                <Card key={tech.id} className="flex flex-col">
                    <CardContent className="p-6 flex flex-col flex-1">
                       <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border-2 border-border-default">
                                    <AvatarImage src={tech.avatarUrl} />
                                    <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary">{tech.name}</h3>
                                    <p className="text-sm text-text-secondary">{tech.role}</p>
                                </div>
                            </div>
                            <Badge variant={tech.reliabilityScore > 90 ? 'active' : tech.reliabilityScore > 80 ? 'onhold' : 'destructive'} className="text-xs">
                                {tech.reliabilityScore}%
                            </Badge>
                       </div>

                       <div className="mb-4">
                           <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
                                <MapPin size={14} className="text-text-muted"/> {tech.currentLocation}
                           </div>
                           <div className="flex items-center gap-2 text-sm text-text-secondary">
                                <Mail size={14} className="text-text-muted"/> {tech.email}
                           </div>
                       </div>
                        
                        <div className="mb-4">
                             <h4 className="field-label !mb-2">Skills</h4>
                             <div className="flex flex-wrap gap-1.5">
                                {tech.skills.map(skill => (
                                    <Badge key={skill} variant="secondary" className="bg-bg-tertiary text-text-secondary border-border-subtle font-normal">{skill}</Badge>
                                ))}
                            </div>
                        </div>

                        <div className="mt-auto flex gap-2">
                             <Button variant="outline" size="sm" className="flex-1">
                                <Phone size={14} className="mr-2"/> Call
                            </Button>
                             <Button variant="outline" size="sm" className="flex-1">
                                <MessageSquare size={14} className="mr-2"/> Message
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
