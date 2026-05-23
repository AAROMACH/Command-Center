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
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, MapPin, Check, X, Camera, FileText, Plus, Trash2, Wrench, Briefcase, SearchCode } from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCZ3jd1i_QKskjeq2kJSjGV0n7Z4uQYzH0";

type NewRequestDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (request: ServiceRequest) => void;
};

export function NewRequestDialog({ isOpen, setIsOpen, onSave }: NewRequestDialogProps) {
  const [formData, setFormData] = useState<Partial<ServiceRequest>>({
    priority: 'medium',
    requestType: 'Installation',
    status: 'new',
    clientName: '',
    location: '',
    description: ''
  });

  const [images, setImages] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    window.gm_authFailure = () => {
      console.warn("Google Maps API Handshake Restricted.");
      toast({
        variant: "destructive",
        title: "Registry Security Error",
        description: "Google Maps API referer restriction active. Please authorize this workstation URL in your Cloud Console.",
      });
    };

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
        console.warn("Places Autocomplete Terminal Restricted.");
      }
    };

    if (!window.google && !document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      script.onerror = () => {
        console.error("Registry script load failure.");
      };
      document.head.appendChild(script);
    } else if (window.google) {
      initAutocomplete();
    }
  }, [isOpen, toast]);

  const resolveAddress = () => {
    if (!formData.location || !window.google) return;
    
    try {
      const service = new window.google.maps.places.PlacesService(document.createElement('div'));
      const request = {
        query: formData.location,
        fields: ['formatted_address', 'geometry'],
      };

      service.findPlaceFromQuery(request, (results: any, status: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
          const place = results[0];
          setFormData(prev => ({ ...prev, location: place.formatted_address }));
          toast({
            title: "Coordinate Match Verified",
            description: `Registry updated to verified site: ${place.formatted_address}`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Resolution Failed",
            description: "No verified coordinates found. Verify referer permissions in console.",
          });
        }
      });
    } catch (e) {
      console.error("Places Service Protocol Error:", e);
    }
  };

  const handleSave = () => {
    if (!formData.clientName || !formData.location || !formData.description) {
      toast({
        variant: "destructive",
        title: "Incomplete Request",
        description: "Please populate all critical fields.",
      });
      return;
    }

    const newRequest: ServiceRequest = {
      ...formData as ServiceRequest,
      id: `req-${Date.now().toString().slice(-4)}`,
      submittedDate: new Date().toISOString().split('T')[0],
      imageUrls: images,
      documentUrls: docs,
    };

    onSave(newRequest);
    setIsOpen(false);
    handleReset();
  };

  const handleReset = () => {
    setFormData({
      priority: 'medium',
      requestType: 'Installation',
      status: 'new',
      clientName: '',
      location: '',
      description: ''
    });
    setImages([]);
    setDocs([]);
  };

  const simulateUpload = (type: 'image' | 'doc') => {
    if (type === 'image') {
      if (images.length >= 3) {
        toast({ variant: "destructive", title: "Limit Reached", description: "Maximum 3 images allowed." });
        return;
      }
      setImages([...images, `https://picsum.photos/seed/${Date.now()}/400/300`]);
    } else {
      if (docs.length >= 2) {
        toast({ variant: "destructive", title: "Limit Reached", description: "Maximum 2 documents allowed." });
        return;
      }
      setDocs([...docs, `Document_${docs.length + 1}.pdf`]);
    }
    toast({ title: "File Attached", description: `${type === 'image' ? 'Image' : 'Document'} uploaded to intake buffer.` });
  };

  const removeAttachment = (type: 'image' | 'doc', index: number) => {
    if (type === 'image') {
      setImages(images.filter((_, i) => i !== index));
    } else {
      setDocs(docs.filter((_, i) => i !== index));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default max-h-[95vh] overflow-y-auto p-0 shadow-2xl text-left">
        <DialogHeader className="p-6 pb-2 text-left">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="text-brand-red h-5 w-5" />
            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
          </div>
          <DialogDescription className="text-xs uppercase font-bold text-text-muted">Initialize a new client request in the intake funnel.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-6 text-left">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
              <Input 
                placeholder="Name or Organization"
                value={formData.clientName}
                onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                className="bg-bg-primary border-border-sub h-10 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
              <div className="relative group">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input 
                    ref={addressInputRef}
                    placeholder="Full Address"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="bg-bg-primary h-10 text-xs pl-10 pr-10 border-border-sub"
                />
                {formData.location && (
                    <button 
                        onClick={resolveAddress}
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-red transition-colors"
                        title="Verify Coordinates"
                    >
                        <SearchCode size={14} />
                    </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
              <Select value={formData.requestType} onValueChange={(val: any) => setFormData({...formData, requestType: val})}>
                <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Installation" className="text-xs font-bold uppercase">Installation</SelectItem>
                  <SelectItem value="Troubleshooting" className="text-xs font-bold uppercase">Troubleshooting</SelectItem>
                  <SelectItem value="Maintenance" className="text-xs font-bold uppercase">Maintenance</SelectItem>
                  <SelectItem value="Survey" className="text-xs font-bold uppercase">Survey</SelectItem>
                  <SelectItem value="Repair" className="text-xs font-bold uppercase">Repair</SelectItem>
                  <SelectItem value="Decommission" className="text-xs font-bold uppercase">Decommission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority</Label>
              <Select value={formData.priority} onValueChange={(val: any) => setFormData({...formData, priority: val})}>
                <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low" className="text-xs font-bold uppercase">Low (Standard)</SelectItem>
                  <SelectItem value="medium" className="text-xs font-bold uppercase">Medium (Nominal)</SelectItem>
                  <SelectItem value="high" className="text-xs font-bold uppercase">High (4h Target)</SelectItem>
                  <SelectItem value="critical" className="text-xs font-bold uppercase">Critical (Emergency)</SelectItem>
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
              className="bg-bg-primary border-border-sub h-24 text-xs font-medium uppercase"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <Camera size={14} className="text-brand-red" />
                  Site Images (Max 3)
                </Label>
                <span className="text-[9px] font-mono text-text-muted">{images.length}/3</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <div key={i} className="relative aspect-video rounded border border-border-sub overflow-hidden group bg-bg-primary">
                    <img src={img} alt={`Upload ${i}`} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeAttachment('image', i)}
                      className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button 
                    type="button"
                    onClick={() => simulateUpload('image')}
                    className="aspect-video rounded border-2 border-dashed border-border-sub hover:border-brand-red hover:bg-brand-red-dim/5 transition-all flex flex-col items-center justify-center gap-1 text-text-muted hover:text-brand-red"
                  >
                    <Plus size={16} />
                    <span className="text-[8px] font-bold uppercase">Add Photo</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <FileText size={14} className="text-accent-gold" />
                  Technical Docs (Max 2)
                </Label>
                <span className="text-[9px] font-mono text-text-muted">{docs.length}/2</span>
              </div>
              <div className="space-y-2">
                {docs.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-bg-primary border border-border-sub">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText size={12} className="text-text-muted" />
                      <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight">{doc}</span>
                    </div>
                    <button type="button" onClick={() => removeAttachment('doc', i)} className="text-text-muted hover:text-text-red">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {docs.length < 2 && (
                  <button 
                    type="button"
                    onClick={() => simulateUpload('doc')}
                    className="w-full py-3 rounded border-2 border-dashed border-border-sub hover:border-accent-gold hover:bg-accent-gold-dim/5 transition-all flex items-center justify-center gap-2 text-text-muted hover:text-accent-gold"
                  >
                    <Plus size={14} />
                    <span className="text-[9px] font-bold uppercase">Attach SOW / Blueprint</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 flex flex-row items-end gap-4">
          <Button variant="outline" type="button" onClick={() => setIsOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest shrink-0">
            <X size={14} className="mr-2"/> Cancel Intake
          </Button>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-2 text-center md:text-left">Convert to a(n):</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={handleSave} className="h-11 text-[10px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover">
                <Wrench size={14} className="mr-2" /> Assignment
              </Button>
              <Button type="button" onClick={handleSave} variant="outline" className="h-11 text-[10px] uppercase font-bold tracking-widest border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                <Briefcase size={14} className="mr-2" /> Project
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
