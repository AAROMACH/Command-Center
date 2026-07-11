'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { isClient } from '@/lib/permissions';
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
import { ClipboardList, MapPin, Check, X, Camera, FileText, Plus, Trash2, SquarePlus, Building2, Navigation, Upload, Search, Users, SearchCode } from 'lucide-react';
import type { ServiceRequest, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");
  
  const addressInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    // Defensive Protocol: Handle referer or activation failures from Google Maps
    window.gm_authFailure = () => {
      console.warn("Google Maps API Handshake Restricted.");
      toast({
        variant: "destructive",
        title: "Registry Security Error",
        description: "Google Maps API referer or activation restriction active. Please authorize this workstation URL in your Cloud Console.",
      });
    };

    const scriptId = 'google-maps-places-script';
    
    const initAutocomplete = () => {
      if (!addressInputRef.current || !window.google || !window.google.maps || !window.google.maps.places) return;
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

    if (MAPS_API_KEY && !window.google && !document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      document.head.appendChild(script);
    } else if (window.google) {
      initAutocomplete();
    }
  }, [isOpen, toast]);

  const resolveAddress = () => {
    if (!formData.location || !window.google || !window.google.maps || !window.google.maps.places) return;
    
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

  const clients = useMemo(() => {
    return technicians.filter(t => 
        isClient(t) || t.clientCompany
    );
  }, []);

  const selectedClient = useMemo(() => {
    return clients.find(c => (c.clientCompany || c.name) === formData.clientName);
  }, [formData.clientName, clients]);

  const filteredRegistry = useMemo(() => {
    return clients.filter(c => 
        (c.clientCompany || '').toLowerCase().includes(registrySearch.toLowerCase()) ||
        (c.name || '').toLowerCase().includes(registrySearch.toLowerCase()) ||
        c.id.toLowerCase().includes(registrySearch.toLowerCase())
    );
  }, [registrySearch, clients]);

  const selectClientFromRegistry = (client: Technician) => {
    const name = client.clientCompany || client.name;
    setFormData(prev => ({
        ...prev,
        clientName: name,
        location: '' 
    }));
    setIsRegistryOpen(false);
    toast({
        title: "Registry Match Selected",
        description: `${name} has been linked to this service request.`,
    });
  };

  const selectSiteFromRegistry = (site: { name: string, location: string }) => {
    setFormData(prev => ({ ...prev, location: site.location }));
    setIsSiteRegistryOpen(false);
    toast({
        title: "Site Coordinates Applied",
        description: `Deployment target set to ${site.name}.`,
    });
  };

  const handleSave = async () => {
    if (!formData.clientName || !formData.location || !formData.description) {
      toast({
        variant: "destructive",
        title: "Incomplete Request",
        description: "Please populate all critical fields.",
      });
      return;
    }

    try {
      const id = await createDocId(ID_PREFIXES.CLIENT_REQUEST);
      const newRequest: ServiceRequest = {
        ...formData as ServiceRequest,
        id,
        submittedDate: new Date().toISOString().split('T')[0],
        imageUrls: images,
        documentUrls: docs,
      };
      onSave(newRequest);
      setIsOpen(false);
      handleReset();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
    }
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
    setRegistrySearch("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'doc') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'image') {
      if (images.length >= 3) {
        toast({ variant: "destructive", title: "Buffer Full", description: "Maximum 3 site images authorized." });
        return;
      }
      const url = URL.createObjectURL(file);
      setImages([...images, url]);
      toast({ title: "Visual Asset Buffered", description: `${file.name} ready for intake.` });
    } else {
      if (docs.length >= 2) {
        toast({ variant: "destructive", title: "Buffer Full", description: "Maximum 2 technical documents authorized." });
        return;
      }
      setDocs([...docs, file.name]);
      toast({ title: "Technical Asset Buffered", description: `${file.name} ready for intake.` });
    }
    
    e.target.value = "";
  };

  const removeAttachment = (type: 'image' | 'doc', index: number) => {
    if (type === 'image') {
      const urlToRemove = images[index];
      URL.revokeObjectURL(urlToRemove);
      setImages(images.filter((_, i) => i !== index));
    } else {
      setDocs(docs.filter((_, i) => i !== index));
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
        <DialogContent 
          className="sm:max-w-[600px] bg-bg-elevated border-border-default max-h-[95vh] overflow-y-auto p-0 shadow-2xl text-left"
          onPointerDownOutside={(e) => {
            if (e.target instanceof Element && e.target.closest('.pac-container')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="p-6 pb-2 text-left">
            <div className="flex items-center gap-2 mb-1 text-left">
              <ClipboardList className="text-brand-red h-5 w-5" />
              <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
            </div>
            <DialogDescription className="text-left text-xs uppercase font-bold text-text-muted">Initialize a new client request in the intake funnel.</DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-6 text-left">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
                <div className="space-y-1.5">
                  <Input 
                    placeholder="Name or Organization"
                    value={formData.clientName}
                    onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                    className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase"
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[9px] uppercase font-bold tracking-widest text-brand-red hover:bg-brand-red/10 p-0 flex items-center gap-1.5"
                    onClick={() => setIsRegistryOpen(true)}
                  >
                    <Search size={12}/> Search Registry
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
                <div className="space-y-1.5">
                    <div className="relative group">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input 
                        ref={addressInputRef}
                        placeholder="Full Address"
                        value={formData.location}
                        onChange={(e) => setFormData({...formData, location: e.target.value})}
                        className="bg-bg-primary h-10 text-xs pl-10 pr-10 border-border-sub focus:border-brand-red transition-all"
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
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        disabled={!selectedClient?.managedSites || selectedClient.managedSites.length === 0}
                        className={cn(
                            "h-6 text-[9px] uppercase font-bold tracking-widest p-0 flex items-center gap-1.5",
                            (!selectedClient?.managedSites || selectedClient.managedSites.length === 0) 
                                ? "text-text-muted opacity-50 cursor-not-allowed" 
                                : "text-accent-gold hover:bg-accent-gold/10"
                        )}
                        onClick={() => setIsSiteRegistryOpen(true)}
                    >
                        <MapPin size={12}/> {selectedClient?.managedSites ? 'Select Managed Site' : 'No Sites Found'}
                    </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
                <Select value={formData.requestType} onValueChange={(val: any) => setFormData({...formData, requestType: val})}>
                  <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
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
                className="bg-bg-primary border-border-sub h-24 text-xs font-medium uppercase leading-relaxed"
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Camera size={14} className="text-brand-red" />
                    Site Evidence (Max 3)
                  </Label>
                  <span className="text-[9px] font-mono text-text-muted">{images.length}/3</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative aspect-video rounded-lg border border-border-sub overflow-hidden group bg-bg-primary">
                      <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
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
                    <>
                      <input 
                        type="file" 
                        className="hidden" 
                        ref={imageInputRef} 
                        accept="image/*" 
                        onChange={(e) => handleFileChange(e, 'image')} 
                      />
                      <button 
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="aspect-video rounded border-2 border-dashed border-border-sub flex flex-col items-center justify-center gap-1 text-text-muted hover:text-brand-red transition-all"
                      >
                        <Plus size={16} />
                        <span className="text-[8px] font-bold uppercase">Add Photo</span>
                      </button>
                    </>
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
                  {docs.map((docName, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-bg-primary border border-border-sub">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText size={12} className="text-text-muted" />
                        <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight">{docName}</span>
                      </div>
                      <button type="button" onClick={() => removeAttachment('doc', i)} className="text-text-muted hover:text-text-red">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {docs.length < 2 && (
                    <>
                      <input 
                        type="file" 
                        className="hidden" 
                        ref={docInputRef} 
                        onChange={(e) => handleFileChange(e, 'doc')} 
                      />
                      <button 
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="w-full py-3 rounded border-2 border-dashed border-border-sub hover:border-accent-gold hover:bg-accent-gold-dim/5 transition-all flex items-center justify-center gap-2 text-text-muted hover:text-accent-gold"
                      >
                        <Upload size={14} />
                        <span className="text-[9px] font-bold uppercase">Attach SOW / Blueprint</span>
                      </button>
                    </>
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
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted mb-2 text-center md:text-left">Authorize Deployment Path:</p>
              <div className="grid grid-cols-1">
                <Button type="button" onClick={handleSave} className="h-11 text-[10px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover shadow-lg">
                  <SquarePlus size={14} className="mr-2" /> Create request
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLIENT REGISTRY POPUP */}
      <Dialog open={isRegistryOpen} onOpenChange={setIsRegistryOpen}>
          <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
              <DialogHeader className="p-6 pb-2 text-left">
                  <div className="flex items-center gap-2 mb-1">
                      <Users className="text-brand-red h-5 w-5" />
                      <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Client Registry</DialogTitle>
                  </div>
                  <DialogDescription className="text-xs text-left">Select existing client to link to this service request.</DialogDescription>
              </DialogHeader>
              <div className="px-6 py-2">
                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <Input 
                          placeholder="Filter registry by name or ID..." 
                          value={registrySearch}
                          onChange={(e) => setRegistrySearch(e.target.value)}
                          className="bg-bg-primary h-10 pl-10 text-xs font-bold uppercase"
                      />
                  </div>
              </div>
              <ScrollArea className="flex-1 px-6 py-4">
                  <div className="space-y-1">
                      {filteredRegistry.map(client => (
                          <button
                              key={client.id}
                              type="button"
                              onClick={() => selectClientFromRegistry(client)}
                              className="w-full flex items-center gap-3 p-3 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim border border-transparent hover:border-border-sub"
                          >
                              <div className="p-1.5 bg-bg-secondary rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors">
                                  <Building2 size={16} />
                              </div>
                              <div className="flex-1 overflow-hidden">
                                  <p className="text-xs font-bold text-text-primary uppercase truncate">{client.clientCompany || client.name}</p>
                                  {client.businessType && (
                                      <p className="text-[8px] text-accent-gold uppercase font-black tracking-tighter leading-none mt-0.5">{client.businessType}</p>
                                  )}
                                  <p className="text-[9px] text-text-muted uppercase tracking-widest">ID: {client.id.toUpperCase()}</p>
                              </div>
                              <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                      ))}
                      {filteredRegistry.length === 0 && (
                          <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No registry matches found</p>
                          </div>
                      )}
                  </div>
              </ScrollArea>
              <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                  <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-9" onClick={() => setIsRegistryOpen(false)}>Close Registry</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* SITE REGISTRY POPUP */}
      <Dialog open={isSiteRegistryOpen} onOpenChange={setIsSiteRegistryOpen}>
          <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
              <DialogHeader className="p-6 pb-2 text-left">
                  <div className="flex items-center gap-2 mb-1">
                      <Navigation className="text-accent-gold h-5 w-5" />
                      <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Site Registry</DialogTitle>
                  </div>
                  <DialogDescription className="text-xs text-left">Select verified coordinates for <span className="text-text-primary font-bold">{formData.clientName}</span>.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 px-6 py-4">
                  <div className="space-y-1">
                      {selectedClient?.managedSites?.map(site => (
                          <button
                              key={site.id}
                              type="button"
                              onClick={() => selectSiteFromRegistry(site)}
                              className="w-full p-4 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim border border-transparent hover:border-border-sub"
                          >
                              <div className="flex justify-between items-start gap-3">
                                  <div className="space-y-0.5 text-left">
                                      <p className="text-xs font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
                                      <p className="text-[10px] text-text-muted flex items-center gap-1.5">
                                          <MapPin size={10} className="text-brand-red shrink-0" />
                                          <span className="truncate">{site.location}</span>
                                      </p>
                                  </div>
                                  <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                               </div>
                          </button>
                      ))}
                      {(!selectedClient?.managedSites || selectedClient.managedSites.length === 0) && (
                          <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No verified sites on record for this client</p>
                          </div>
                      )}
                  </div>
              </ScrollArea>
              <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                  <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-10" onClick={() => setIsSiteRegistryOpen(false)}>Close Terminal</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
