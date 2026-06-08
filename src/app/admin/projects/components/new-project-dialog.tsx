'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
import { Building2, MapPin, Calendar, Briefcase, Check, Phone, User, SearchCode, X, Search, Users, Navigation } from 'lucide-react';
import type { Project, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { generateId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");
  const addressInputRef = useRef<HTMLInputElement>(null);
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
      script.onerror = () => {
        console.error("Registry script load failure.");
      };
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
        t.roles?.includes('client') || 
        t.role.toLowerCase().includes('client') || 
        t.clientCompany
    );
  }, []);

  const selectedClient = useMemo(() => {
    return clients.find(c => (c.clientCompany || c.name) === formData.client);
  }, [formData.client, clients]);

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
        client: name,
        location: '' 
    }));
    setIsRegistryOpen(false);
    toast({
        title: "Registry Match Selected",
        description: `${name} has been linked to this project folder.`,
    });
  };

  const selectSiteFromRegistry = (site: { name: string, location: string }) => {
    setFormData(prev => ({ ...prev, location: site.location }));
    setIsSiteRegistryOpen(false);
    toast({
        title: "Site Coordinates Applied",
        description: `Operational target set to ${site.name}.`,
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.client || !formData.location) return;

    const newProject: Project = {
      ...formData as Project,
      id: await generateId(ID_PREFIXES.PROJECT),
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
    <>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent 
            className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl text-left"
            onPointerDownOutside={(e) => {
              if (e.target instanceof Element && e.target.closest('.pac-container')) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader className="p-6 pb-2 text-left">
              <div className="flex items-center gap-2 mb-1 text-left">
                <Building2 className="text-brand-red h-5 w-5" />
                <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Initialize Project Folder</DialogTitle>
              </div>
              <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Create a new high-fidelity project entry in the operational registry.</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-6 py-4 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Project Name</Label>
                  <Input 
                    placeholder="e.g., Downtown Fiber Overhaul" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client Entity</Label>
                  <div className="space-y-1.5">
                    <Input 
                        placeholder="Organization Name" 
                        value={formData.client}
                        onChange={e => setFormData({...formData, client: e.target.value})}
                        className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase tracking-wide focus:border-brand-red transition-all"
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
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Operational Site Address</Label>
                <div className="space-y-1.5">
                    <div className="relative group">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                        <Input 
                            ref={addressInputRef}
                            placeholder="Full Address" 
                            value={formData.location}
                            onChange={e => setFormData({...formData, location: e.target.value})}
                            className="bg-bg-primary pl-10 pr-10 h-10 text-xs border-border-sub focus:border-brand-red transition-all"
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">On-Site Contact Name</Label>
                  <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <Input 
                        placeholder="Contact Name" 
                        value={formData.onsiteContactName}
                        onChange={e => setFormData({...formData, onsiteContactName: e.target.value})}
                        className="bg-bg-primary pl-10 h-10 text-xs"
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
                        className="bg-bg-primary pl-10 h-10 text-xs"
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
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Estimated Duration</Label>
                  <Input 
                    placeholder="e.g., 6 months" 
                    value={formData.estimatedDuration}
                    onChange={e => setFormData({...formData, estimatedDuration: e.target.value})}
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Scope of Work Briefing</Label>
                <Textarea 
                    placeholder="Define primary objectives and technical requirements..." 
                    value={formData.scope}
                    onChange={e => setFormData({...formData, scope: e.target.value})}
                    className="bg-bg-primary h-24 text-xs font-medium uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Project Budget ($)</Label>
                  <Input 
                    type="number"
                    value={formData.projectBudget}
                    onChange={e => setFormData({...formData, projectBudget: parseFloat(e.target.value) || 0})}
                    className="bg-bg-primary font-mono h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Allocated Hours</Label>
                  <Input 
                    type="number"
                    value={formData.estimatedHours}
                    onChange={e => setFormData({...formData, estimatedHours: parseFloat(e.target.value) || 0})}
                    className="bg-bg-primary font-mono h-10 text-sm"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default mt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
              <Button onClick={handleSave} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
                <Check size={16} className="mr-2" />
                Initialize Registry
              </Button>
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
                    <DialogDescription className="text-xs text-left">Select existing client to link to this project folder.</DialogDescription>
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
                <ScrollArea className="flex-1 px-6 py-4 text-left">
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
                    <DialogDescription className="text-xs text-left">Select verified coordinates for <span className="text-text-primary font-bold">{formData.client}</span>.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-6 py-4 text-left">
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
                    <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-9" onClick={() => setIsSiteRegistryOpen(false)}>Close Terminal</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}
