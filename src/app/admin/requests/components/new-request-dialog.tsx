'use client';

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, MapPin, Building2, Check, X } from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';

type NewRequestDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (request: ServiceRequest) => void;
};

export function NewRequestDialog({ isOpen, setIsOpen, onSave }: NewRequestDialogProps) {
  const [formData, setFormData] = useState<Partial<ServiceRequest>>({
    priority: 'medium',
    requestType: 'Repair',
    status: 'new',
    clientName: '',
    location: '',
    description: ''
  });

  const { toast } = useToast();

  const handleSave = () => {
    if (!formData.clientName || !formData.location || !formData.description) {
      toast({
        variant: "destructive",
        title: "Incomplete Request",
        description: "Please populate all mission-critical fields.",
      });
      return;
    }

    const newRequest: ServiceRequest = {
      ...formData as ServiceRequest,
      id: `req-${Date.now().toString().slice(-4)}`,
      submittedDate: new Date().toISOString().split('T')[0],
    };

    onSave(newRequest);
    setIsOpen(false);
    setFormData({
      priority: 'medium',
      requestType: 'Repair',
      status: 'new',
      clientName: '',
      location: '',
      description: ''
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[550px] bg-bg-elevated border-border-default">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
          </div>
          <DialogDescription>Initialize a new stakeholder request in the intake funnel.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Stakeholder</Label>
              <Input 
                placeholder="Name or Organization"
                value={formData.clientName}
                onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                className="bg-bg-primary h-10 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input 
                    placeholder="Full Address"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="bg-bg-primary h-10 text-xs pl-10"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
              <Select value={formData.requestType} onValueChange={(val: any) => setFormData({...formData, requestType: val})}>
                <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="New Install">New Install</SelectItem>
                  <SelectItem value="Repair">Repair / Maintenance</SelectItem>
                  <SelectItem value="Inspection">Compliance Audit</SelectItem>
                  <SelectItem value="Quote">Service Quote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Mission Priority</Label>
              <Select value={formData.priority} onValueChange={(val: any) => setFormData({...formData, priority: val})}>
                <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (Standard)</SelectItem>
                  <SelectItem value="medium">Medium (Nominal)</SelectItem>
                  <SelectItem value="high">High (4h Target)</SelectItem>
                  <SelectItem value="critical">Critical (Emergency)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Scope of Request</Label>
            <Textarea 
              placeholder="Provide detailed job parameters and client requirements..." 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="bg-bg-primary border-border-sub h-24 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default mt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">
            <X size={14} className="mr-2"/> Abort Intake
          </Button>
          <Button onClick={handleSave} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
            <Check size={16} className="mr-2" /> Finalize Submission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
