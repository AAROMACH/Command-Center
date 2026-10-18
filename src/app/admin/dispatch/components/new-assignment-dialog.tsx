'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect, useRef } from 'react';
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
import { Wrench, MapPin, Building2, Check, UserCheck, Search, Users, Navigation, DollarSign, SearchCode, X } from 'lucide-react';
import type { WorkOrder, Technician } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PAY_TYPE_LABELS, ID_PREFIXES } from '@/lib/constants';
import { createDocId } from '@/lib/generateId';
import { SLA_DEFAULTS } from '@/lib/sla';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type NewAssignmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (order: WorkOrder) => void;
};

export function NewAssignmentDialog({ isOpen, setIsOpen, onSave }: NewAssignmentDialogProps) {
  const [formData, setFormData] = useState<Partial<WorkOrder>>({
    title: '',
    description: '',
    priority: 'medium',
    status: 'unassigned',
    projectType: 'Installation',
    requiredSkills: [],
    pay: 0,
    payType: 'fixed',
    scheduleDate: new Date().toISOString().split('T')[0],
    scheduleTime: '09:00 AM',
    clientName: '',
    location: '',
    blendedFixedPay: 0,
    blendedIncludedHours: 0,
    blendedHourlyRate: 0,
    isAcknowledged: false
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
      console.warn("Google Maps could not load.");
      toast({
        variant: "destructive",
        title: "Google Maps unavailable",
        description: "Address lookup is off on this site. Type the address manually.",
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
        console.warn("Places autocomplete unavailable.");
      }
    };

    if (MAPS_API_KEY && !window.google && !document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = initAutocomplete;
      script.onerror = () => {
        console.error("Maps script failed to load.");
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
            title: "Address verified",
            description: `Location set to ${place.formatted_address}`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Address not found",
            description: "Google could not find that address. Check it and try again.",
          });
        }
      });
    } catch (e) {
      console.error("Places lookup failed:", e);
    }
  };

  // Live client entities from the app (the users collection, same source the
  // CRM/Clients and Sites pages use) — not a static seed list — so the picker
  // reflects the client entities that actually exist in this workspace.
  const [allUsers, setAllUsers] = useState<Technician[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSharedSnapshot('users', snap => {
      setAllUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => unsub();
  }, [isOpen]);

  // Only current client entities are assignable: exclude self-registered
  // clients still awaiting approval or that were denied (approvalStatus), and
  // clients that were deactivated/removed (accountStatus 'inactive'). Legacy
  // admin-created clients with no approvalStatus set are treated as approved.
  const clients = useMemo(() => {
    return allUsers.filter(t =>
      (isClient(t) || t.clientCompany)
      && t.approvalStatus !== 'pending'
      && t.approvalStatus !== 'denied'
      && t.accountStatus !== 'inactive'
    );
  }, [allUsers]);

  const selectedClient = useMemo(() => {
    return clients.find(c => (c.clientCompany || c.name) === formData.clientName);
  }, [formData.clientName, clients]);

  const filteredRegistry = useMemo(() => {
    return clients.filter(c => 
        (c.clientCompany || '').toLowerCase().includes(registrySearch.toLowerCase()) ||
        c.name.toLowerCase().includes(registrySearch.toLowerCase()) ||
        c.id.toLowerCase().includes(registrySearch.toLowerCase())
    );
  }, [registrySearch, clients]);

  const handleSave = async () => {
    if (!formData.title || !formData.description || !formData.location || !formData.clientName) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Fill in the required fields first.",
      });
      return;
    }

    try {
      const id = await createDocId(ID_PREFIXES.WORK_ORDER);
      const newOrder: WorkOrder = {
        ...formData as WorkOrder,
        id,
        isAcknowledged: false,
        source: 'Manual',
      };
      onSave(newOrder);
      setIsOpen(false);
      handleReset();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const handleReset = () => {
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        status: 'unassigned',
        projectType: 'Installation',
        requiredSkills: [],
        pay: 0,
        payType: 'fixed',
        scheduleDate: new Date().toISOString().split('T')[0],
        scheduleTime: '09:00 AM',
        clientName: '',
        location: '',
        blendedFixedPay: 0,
        blendedIncludedHours: 0,
        blendedHourlyRate: 0,
        isAcknowledged: false
      });
      setRegistrySearch("");
  };

  const selectClientFromRegistry = (client: Technician) => {
    const name = client.clientCompany || client.name;
    setFormData(prev => ({
        ...prev,
        clientName: name,
        location: '' 
    }));
    setIsRegistryOpen(false);
    toast({
        title: "Client selected",
        description: `${name} is linked to this job.`,
    });
  };

  const selectSiteFromRegistry = (site: { name: string, location: string }) => {
    setFormData(prev => ({ ...prev, location: site.location }));
    setIsSiteRegistryOpen(false);
    toast({
        title: "Site selected",
        description: `Location set to ${site.name}.`,
    });
  };

  return (
    <>
        <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
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
                <Wrench className="text-brand-red h-5 w-5" />
                <DialogTitle className="text-lg font-bold text-text-primary">New job</DialogTitle>
              </div>
              <DialogDescription className="text-left text-xs font-bold text-text-muted">Enter the details for a new field job.</DialogDescription>
            </DialogHeader>

            <div className="px-6 py-4 space-y-6 text-left">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Job title</Label>
                  <Input 
                    placeholder="e.g. Network closet cabling" 
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="bg-bg-primary border-border-sub h-10 text-xs font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Scope of work</Label>
                  <Textarea 
                    placeholder="What needs to be done…" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="bg-bg-primary border-border-sub h-24 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Client</Label>
                    <div className="space-y-1.5">
                        <Input 
                            placeholder="Client name…" 
                            value={formData.clientName}
                            onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                            className="bg-bg-primary h-10 text-xs font-bold tracking-wide focus:border-brand-red transition-all"
                        />
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[10px] uppercase font-bold tracking-wider text-brand-red hover:bg-brand-red/10 p-0 flex items-center gap-1.5"
                            onClick={() => setIsRegistryOpen(true)}
                        >
                            <Search size={12}/> Find client
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Location</Label>
                    <div className="space-y-1.5">
                        <div className="relative group">
                            <Input 
                                ref={addressInputRef}
                                placeholder="Full address…" 
                                value={formData.location}
                                onChange={(e) => setFormData({...formData, location: e.target.value})}
                                className="bg-bg-primary h-10 text-xs focus:border-brand-red transition-all pr-10"
                            />
                            {formData.location && (
                                <button 
                                    onClick={resolveAddress}
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-red transition-colors"
                                    title="Verify address"
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
                                "h-6 text-[10px] uppercase font-bold tracking-wider p-0 flex items-center gap-1.5",
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Pay type</Label>
                  <Select value={formData.payType} onValueChange={(val: any) => setFormData({...formData, payType: val})}>
                    <SelectTrigger className="bg-bg-primary h-10 text-xs font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed" className="text-xs font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                      <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                      <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.payType !== 'blended' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Labor rate ($)</Label>
                    <Input 
                      type="number"
                      placeholder="0.00"
                      value={formData.pay || ''}
                      onChange={(e) => setFormData({...formData, pay: parseFloat(e.target.value) || 0})}
                      className="bg-bg-primary h-10 font-mono text-text-green text-sm"
                    />
                  </div>
                )}
              </div>

              {formData.payType === 'blended' && (
                <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Fixed base ($)</Label>
                        <div className="relative">
                            <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                            <Input 
                                type="number"
                                placeholder="0.00"
                                value={formData.blendedFixedPay || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setFormData({...formData, blendedFixedPay: val, pay: val});
                                }}
                                className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Incl. hours</Label>
                        <Input 
                            type="number"
                            placeholder="0"
                            value={formData.blendedIncludedHours || ''}
                            onChange={(e) => setFormData({...formData, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                            className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Then ($/hr)</Label>
                        <div className="relative">
                            <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                            <Input 
                                type="number"
                                placeholder="0.00"
                                value={formData.blendedHourlyRate || ''}
                                onChange={(e) => setFormData({...formData, blendedHourlyRate: parseFloat(e.target.value) || 0})}
                                className="bg-bg-primary h-9 font-mono text-text-green text-[11px]"
                            />
                        </div>
                    </div>
                    <p className="col-span-3 text-[10px] text-text-muted uppercase font-bold ">Fixed amount for the included hours, then the hourly rate applies.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date</Label>
                  <Input 
                    type="date"
                    value={formData.scheduleDate}
                    onChange={(e) => setFormData({...formData, scheduleDate: e.target.value})}
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Start time</Label>
                  <Input 
                    placeholder="e.g. 09:00 AM"
                    value={formData.scheduleTime}
                    onChange={(e) => setFormData({...formData, scheduleTime: e.target.value})}
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Priority</Label>
                  <Select value={formData.priority} onValueChange={(val: any) => {
                    const defaults = SLA_DEFAULTS[val] || SLA_DEFAULTS.medium;
                    setFormData({...formData, priority: val, slaResponseTarget: defaults.responseMinutes, slaResolutionTarget: defaults.resolutionHours});
                  }}>
                    <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low" className="text-xs font-bold">Low</SelectItem>
                      <SelectItem value="medium" className="text-xs font-bold">Medium</SelectItem>
                      <SelectItem value="high" className="text-xs font-bold">High</SelectItem>
                      <SelectItem value="critical" className="text-xs font-bold">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Service category</Label>
                  <Select value={formData.projectType} onValueChange={(val: any) => setFormData({...formData, projectType: val})}>
                    <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Installation" className="text-xs font-bold">Installation</SelectItem>
                      <SelectItem value="Troubleshooting" className="text-xs font-bold">Troubleshooting</SelectItem>
                      <SelectItem value="Maintenance" className="text-xs font-bold">Maintenance</SelectItem>
                      <SelectItem value="Survey" className="text-xs font-bold">Survey</SelectItem>
                      <SelectItem value="Repair" className="text-xs font-bold">Repair</SelectItem>
                      <SelectItem value="Decommission" className="text-xs font-bold">Decommission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">SLA response target (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.slaResponseTarget ?? (SLA_DEFAULTS[formData.priority || 'medium']?.responseMinutes)}
                    onChange={(e) => setFormData({...formData, slaResponseTarget: parseInt(e.target.value) || 0})}
                    className="bg-bg-primary h-10 text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">SLA resolution target (hr)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.slaResolutionTarget ?? (SLA_DEFAULTS[formData.priority || 'medium']?.resolutionHours)}
                    onChange={(e) => setFormData({...formData, slaResolutionTarget: parseInt(e.target.value) || 0})}
                    className="bg-bg-primary h-10 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-wider">Cancel</Button>
              <Button onClick={handleSave} className="h-10 px-10 uppercase font-bold text-[10px] tracking-wider bg-brand-red hover:bg-brand-red-hover">
                Create Dispatch Entry
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
                        <DialogTitle className="text-lg font-bold text-text-primary text-left">Select client</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Pick an existing client for this job.</DialogDescription>
                </DialogHeader>
                <div className="px-6 py-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                        <Input 
                            placeholder="Search clients by name or ID…" 
                            value={registrySearch}
                            onChange={(e) => setRegistrySearch(e.target.value)}
                            className="bg-bg-primary h-10 pl-10 text-xs font-bold"
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
                                    <p className="text-xs font-bold text-text-primary truncate">{client.clientCompany || client.name}</p>
                                    {client.businessType && (
                                        <p className="text-[10px] text-accent-gold uppercase font-bold leading-none mt-0.5">{client.businessType}</p>
                                    )}
                                    <p className="text-[10px] text-text-muted uppercase tracking-wider">ID: {client.id.toUpperCase()}</p>
                                </div>
                                <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                        {filteredRegistry.length === 0 && (
                            <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider ">No matching clients</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                    <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-wider h-9" onClick={() => setIsRegistryOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* SITE REGISTRY POPUP */}
        <Dialog open={isSiteRegistryOpen} onOpenChange={setIsSiteRegistryOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
                <DialogHeader className="p-6 pb-2 text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <Navigation className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-bold text-text-primary">Select site</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Pick a saved site for <span className="text-text-primary font-bold">{formData.clientName}</span>.</DialogDescription>
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
                                        <p className="text-xs font-bold text-text-primary tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
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
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider ">No saved sites for this client</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                    <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-wider h-9" onClick={() => setIsSiteRegistryOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}
