
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
import { Plus, Wrench } from 'lucide-react';
import type { WorkOrder } from '@/lib/types';

type NewAssignmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (order: WorkOrder) => void;
};

export function NewAssignmentDialog({ isOpen, setIsOpen, onSave }: NewAssignmentDialogProps) {
  const [formData, setFormData] = useState<Partial<WorkOrder>>({
    priority: 'medium',
    status: 'unassigned',
    projectType: 'Maintenance',
    requiredSkills: [],
    pay: 0,
    scheduleDate: new Date().toISOString().split('T')[0],
    scheduleTime: '09:00 AM EST'
  });
  
  const { toast } = useToast();

  const handleSave = () => {
    if (!formData.description || !formData.location || !formData.clientName) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please populate all mission-critical fields.",
      });
      return;
    }

    const newOrder: WorkOrder = {
      ...formData as WorkOrder,
      id: `wo-${Date.now().toString().slice(-6)}`,
      isAcknowledged: false,
    };

    onSave(newOrder);
    setIsOpen(false);
    setFormData({
      priority: 'medium',
      status: 'unassigned',
      projectType: 'Maintenance',
      requiredSkills: [],
      pay: 0,
      scheduleDate: new Date().toISOString().split('T')[0],
      scheduleTime: '09:00 AM EST'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Engagement</DialogTitle>
          </div>
          <DialogDescription>Manual registration of a new tactical field assignment.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Job Title / Description</Label>
            <Textarea 
              placeholder="Primary objective and tactical summary..." 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="bg-bg-primary border-border-sub h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
              <Input 
                placeholder="Client Name" 
                value={formData.clientName}
                onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                className="bg-bg-primary h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
              <Input 
                placeholder="Full address or coordinates" 
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="bg-bg-primary h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Schedule Date</Label>
              <Input 
                type="date"
                value={formData.scheduleDate}
                onChange={(e) => setFormData({...formData, scheduleDate: e.target.value})}
                className="bg-bg-primary h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
              <Input 
                placeholder="e.g. 10:00 AM EST"
                value={formData.scheduleTime}
                onChange={(e) => setFormData({...formData, scheduleTime: e.target.value})}
                className="bg-bg-primary h-10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Settlement Pay ($)</Label>
              <Input 
                type="number"
                placeholder="0.00"
                value={formData.pay || ''}
                onChange={(e) => setFormData({...formData, pay: parseFloat(e.target.value) || 0})}
                className="bg-bg-primary h-10 font-mono text-text-green"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Mission Priority</Label>
              <Select value={formData.priority} onValueChange={(val: any) => setFormData({...formData, priority: val})}>
                <SelectTrigger className="bg-bg-primary h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
              <Select value={formData.projectType} onValueChange={(val: any) => setFormData({...formData, projectType: val})}>
                <SelectTrigger className="bg-bg-primary h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Repair">Repair</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="Installation">Installation</SelectItem>
                  <SelectItem value="Inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8">Abort</Button>
          <Button onClick={handleSave} className="h-10 px-10">
            <Plus size={16} className="mr-2" />
            Commit Engagement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
