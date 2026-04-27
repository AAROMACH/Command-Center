
'use client';

import type { Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Wrench, BarChart, Shield, Building } from 'lucide-react';
import Image from 'next/image';

type PersonnelDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  person: Technician | null;
};

export function PersonnelDetailDialog({ isOpen, setIsOpen, person }: PersonnelDetailDialogProps) {
  if (!person) return null;

  const isTechnician = person.role.toLowerCase().includes('tech');
  const isStaff = person.role.toLowerCase() === 'dispatcher' || person.role.toLowerCase() === 'admin';
  const isClient = person.role.toLowerCase().includes('client');


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[525px] bg-bg-elevated border-border-default">
        <DialogHeader className="text-left">
            <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarImage src={person.avatarUrl} asChild>
                        <Image src={person.avatarUrl} alt={person.name} width={64} height={64} />
                    </AvatarImage>
                    <AvatarFallback>{person.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                </Avatar>
                <div>
                    <DialogTitle className="page-title text-2xl">{person.name}</DialogTitle>
                    <DialogDescription className="text-base text-text-muted">{person.role}</DialogDescription>
                </div>
            </div>
        </DialogHeader>
        <div className="py-4 space-y-6">
            <div className="space-y-2">
                <h3 className="field-label">Contact Information</h3>
                <div className="flex items-center gap-2 text-sm text-text-secondary"><Mail size={14}/> {person.email}</div>
                <div className="flex items-center gap-2 text-sm text-text-secondary"><Phone size={14}/> {person.phone}</div>
            </div>

            {isClient && person.clientCompany && (
                <div className="space-y-2">
                    <h3 className="field-label">Company</h3>
                    <div className="flex items-center gap-2 text-sm text-text-primary font-semibold"><Building size={14}/> {person.clientCompany}</div>
                </div>
            )}

            {isTechnician && (
                <>
                    <div className="space-y-2">
                        <h3 className="field-label">Skills</h3>
                        <div className="flex flex-wrap gap-2">
                            {person.skills.map(skill => (
                                <Badge key={skill} variant="secondary">{skill}</Badge>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <h3 className="field-label flex items-center gap-1.5"><BarChart size={14}/> Workload</h3>
                            <p className="text-2xl font-bold text-text-primary">{person.currentWorkload}</p>
                            <p className="text-xs text-text-muted">Active Assignments</p>
                        </div>
                        <div className="space-y-2">
                            <h3 className="field-label flex items-center gap-1.5"><Shield size={14}/> Reliability</h3>
                            <p className="text-2xl font-bold text-text-primary">{person.reliabilityScore}%</p>
                            <p className="text-xs text-text-muted">On-Time Score</p>
                        </div>
                    </div>
                </>
            )}

             {isStaff && (
                <div className="space-y-2">
                    <h3 className="field-label">Permissions</h3>
                    <div className="text-sm text-text-secondary">Full system administrator access.</div>
                </div>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          <Button>Edit Personnel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
