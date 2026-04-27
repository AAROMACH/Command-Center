'use client';
import type { Technician } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Mail, Phone, ExternalLink } from 'lucide-react';
import { useState } from 'react';

type DirectoryClientProps = {
    technicians: Technician[];
};

export function DirectoryClient({ technicians: allTechnicians }: DirectoryClientProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredTechnicians = allTechnicians.filter((tech) =>
        tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tech.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return (
        <>
            <div className="flex justify-between items-center">
                <Tabs defaultValue="technicians" className="w-full">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="technicians" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TECHNICIANS</TabsTrigger>
                        <TabsTrigger value="staff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">STAFF</TabsTrigger>
                        <TabsTrigger value="clients" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">CLIENTS</TabsTrigger>
                        <TabsTrigger value="timeoff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TIME OFF</TabsTrigger>
                        <TabsTrigger value="map" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">MAP</TabsTrigger>
                    </TabsList>
                </Tabs>
                 <div className="search-wrap">
                    <Search />
                    <input 
                        className="search-input" 
                        placeholder="Search directory..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="mt-6 bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
                <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                    <div>TECHNICIAN</div>
                    <div>CONTACT INFORMATION</div>
                    <div>STATUS</div>
                    <div className="text-right">ACTIONS</div>
                </div>
                <Tabs defaultValue="technicians" className="w-full">
                    <TabsContent value="technicians">
                        {filteredTechnicians.map(tech => (
                            <div key={tech.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 border-t border-border-subtle">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-bold text-text-primary">{tech.name}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{tech.email}</div>
                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1"><Phone size={14} className="text-text-muted"/>{tech.phone}</div>
                                </div>
                                <div>
                                    <Badge variant="active">ACTIVE</Badge>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" className="!uppercase !text-xs">COMMS</Button>
                                    <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                        <ExternalLink size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                         {filteredTechnicians.length === 0 && (
                            <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                        )}
                    </TabsContent>
                    <TabsContent value="staff">
                         <div className="text-center p-12 text-text-muted">Staff directory coming soon.</div>
                    </TabsContent>
                     <TabsContent value="clients">
                         <div className="text-center p-12 text-text-muted">Clients directory coming soon.</div>
                    </TabsContent>
                     <TabsContent value="timeoff">
                         <div className="text-center p-12 text-text-muted">Time off requests coming soon.</div>
                    </TabsContent>
                     <TabsContent value="map">
                         <div className="text-center p-12 text-text-muted">Map view coming soon.</div>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}