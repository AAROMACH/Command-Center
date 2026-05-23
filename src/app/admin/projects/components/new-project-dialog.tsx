'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Building2, MapPin, Calendar, Briefcase, Check, Phone, User } from 'lucide-react';
import type { Project } from '@/lib/types';

declare global {
  interface Window {
    google: any;
  }
}

type NewProjectDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (project: Project) => void;
};

export function NewProjectDialog({ isOpen, setIsOpen, onSave }: NewProjectDialogProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    name: '',
    client: '',
    location: '',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    estimatedDuration: '4 weeks',
    scope: '',
    projectBudget: 0,
    estimatedHours: 0,
    onsiteContactName: '',
    onsiteContactPhone: '',
  });

  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const scriptId = 'google-maps-places-script';
    const initAutocomplete = () => {
      if (!addressInputRef.current || !window.google) return;
      try {
        const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["formatted_address", "geometry"],
          types: ["address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            setFormData(prev => ({ ...prev, location: place.formatted_address }));
          }
        });
      } catch (e) {
        console.warn("Places Autocomplete terminal restricted or API not activated.");
      }
    };

    if (!window.google && !document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyCZ3jd1i_QKskjeq2kJSjGV0n7Z4uQYzH0&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      document.head.appendChild(script);
    } else if (window.google) {
      initAutocomplete();
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!formData.name || !formData.client || !formData.location) return;

    const newProject: Project = {
      ...formData as Project,
      id: `proj-${Date.now().toString().slice(-4)}`,
      assignedTechnicianIds: [],
      team: [],
      phases: [],
      siteHazardNotes: [],
      actualBudget: 0,
      actualHours: 0,
    };

    onSave(newProject);
    setIsOpen(false);
    setFormData({
      name: '',
      client: '',
      location: '',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      estimatedDuration: '4 weeks',
      scope: '',
      projectBudget: 0,
      estimatedHours: 0,
      onsiteContactName: '',
      onsiteContactPhone: '',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Initialize Project Folder</DialogTitle>
          </div>
          <DialogDescription>Create a new high-fidelity project entry in the operational registry.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 text-left">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Project Name</Label>
              <Input 
                placeholder="e.g., Downtown Fiber Overhaul" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="bg-bg-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client Entity</Label>
              <Input 
                placeholder="Organization Name" 
                value={formData.client}
                onChange={e => setFormData({...formData, client: e.target.value})}
                className="bg-bg-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Operational Site Address</Label>
            <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input 
                    ref={addressInputRef}
                    placeholder="Full Address" 
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                    className="bg-bg-primary pl-10"
                />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">On-Site Contact Name</Label>
              <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <Input 
                    placeholder="Contact Name" 
                    value={formData.onsiteContactName}
                    onChange={e => setFormData({...formData, onsiteContactName: e.target.value})}
                    className="bg-bg-primary pl-10"
                  />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">On-Site Contact Phone</Label>
              <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <Input 
                    placeholder="Phone Number" 
                    value={formData.onsiteContactPhone}
                    onChange={e => setFormData({...formData, onsiteContactPhone: e.target.value})}
                    className="bg-bg-primary pl-10"
                  />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Date</Label>
              <Input 
                type="date"
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="bg-bg-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Estimated Duration</Label>
              <Input 
                placeholder="e.g., 6 months" 
                value={formData.estimatedDuration}
                onChange={e => setFormData({...formData, estimatedDuration: e.target.value})}
                className="bg-bg-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Scope of Work Briefing</Label>
            <Textarea 
                placeholder="Define primary objectives and technical requirements..." 
                value={formData.scope}
                onChange={e => setFormData({...formData, scope: e.target.value})}
                className="bg-bg-primary h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Project Budget ($)</Label>
              <Input 
                type="number"
                value={formData.projectBudget}
                onChange={e => setFormData({...formData, projectBudget: parseFloat(e.target.value) || 0})}
                className="bg-bg-primary font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Allocated Hours</Label>
              <Input 
                type="number"
                value={formData.estimatedHours}
                onChange={e => setFormData({...formData, estimatedHours: parseFloat(e.target.value) || 0})}
                className="bg-bg-primary font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-brand-red hover:bg-brand-red-hover px-10">
            <Check size={16} className="mr-2" />
            Initialize Registry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
