'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Wrench, MapPin, Building2, Check, UserCheck, Search, Users, Navigation } from 'lucide-react';
import type { WorkOrder, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type NewAssignmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (order: WorkOrder) => void;
};

export function NewAssignmentDialog({ isOpen, setIsOpen, onSave }: NewAssignmentDialogProps) {
  const [formData, setFormData] = useState<Partial<WorkOrder>>({
    priority: 'medium',
    status: 'unassigned',
    projectType: 'Low Voltage Maintenance',
    requiredSkills: [],
    pay: 0,
    payType: 'fixed',
    scheduleDate: new Date().toISOString().split('T')[0],
    scheduleTime: '09:00 AM EST',
    clientName: '',
    location: ''
  });
  
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");

  const { toast } = useToast();

  const clients = useMemo(() => {
    return technicians.filter(t => 
        t.roles?.includes('client') || 
        t.role.toLowerCase().includes('client') || 
        t.clientCompany
    );
  }, []);

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

  const handleSave = () => {
    if (!formData.description || !formData.location || !formData.clientName) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please populate all field-critical parameters.",
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
    handleReset();
  };

  const handleReset = () => {
      setFormData({
        priority: 'medium',
        status: 'unassigned',
        projectType: 'Low Voltage Maintenance',
        requiredSkills: [],
        pay: 0,
        payType: 'fixed',
        scheduleDate: new Date().toISOString().split('T')[0],
        scheduleTime: '09:00 AM EST',
        clientName: '',
        location: ''
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
        title: "Registry Match Selected",
        description: `${name} has been linked to this dispatch entry.`,
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

  return (
    <>
        <Dialog open={isOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsOpen(open); }}>
          <DialogContent className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="text-brand-red h-5 w-5" />
                <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service job</DialogTitle>
              </div>
              <DialogDescription>Manual entry of a new low voltage field job.</DialogDescription>
            </DialogHeader>

            <div className="px-6 py-4 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Job Title / Description</Label>
                <Textarea 
                  placeholder="Primary objective and low voltage requirements..." 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="bg-bg-primary border-border-sub h-20 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
                    <div className="space-y-1.5">
                        <Input 
                            placeholder="Type client name..." 
                            value={formData.clientName}
                            onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                            className="bg-bg-primary h-10 text-xs font-bold uppercase tracking-wide focus:border-brand-red transition-all"
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
                        <Input 
                            placeholder="Full address or coordinates..." 
                            value={formData.location}
                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                            className="bg-bg-primary h-10 text-xs focus:border-brand-red transition-all"
                        />
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
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Settlement Pay ($)</Label>
                  <Input 
                    type="number"
                    placeholder="0.00"
                    value={formData.pay || ''}
                    onChange={(e) => setFormData({...formData, pay: parseFloat(e.target.value) || 0})}
                    className="bg-bg-primary h-10 font-mono text-text-green text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                  <Select value={formData.payType} onValueChange={(val: any) => setFormData({...formData, payType: val})}>
                    <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Rate</SelectItem>
                      <SelectItem value="hourly">Hourly Logic</SelectItem>
                      <SelectItem value="blended">Blended / Complex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Schedule Date</Label>
                  <Input 
                    type="date"
                    value={formData.scheduleDate}
                    onChange={(e) => setFormData({...formData, scheduleDate: e.target.value})}
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
                  <Input 
                    placeholder="e.g. 10:00 AM EST"
                    value={formData.scheduleTime}
                    onChange={(e) => setFormData({...formData, scheduleTime: e.target.value})}
                    className="bg-bg-primary h-10 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority</Label>
                  <Select value={formData.priority} onValueChange={(val: any) => setFormData({...formData, priority: val})}>
                    <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
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
                    <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Infrastructure Repair">Repair</SelectItem>
                      <SelectItem value="Low Voltage Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Network Installation">Installation</SelectItem>
                      <SelectItem value="Site Audit">Inspection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
              <Button onClick={handleSave} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
                Create Dispatch Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CLIENT REGISTRY POPUP */}
        <Dialog open={isRegistryOpen} onOpenChange={setIsRegistryOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Stakeholder Registry</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Select existing client to link to this assignment.</DialogDescription>
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
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Navigation className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Site Registry</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Select verified coordinates for <span className="text-text-primary font-bold">{formData.clientName}</span>.</DialogDescription>
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
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
                                        <p className="text-[10px] text-text-muted flex items-center gap-1.5">
                                            <MapPin size={10} className="text-brand-red" />
                                            {site.location}
                                        </p>
                                    </div>
                                    <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                                </div>
                            </button>
                        ))}
                        {(!selectedClient?.managedSites || selectedClient.managedSites.length === 0) && (
                            <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No verified sites on record for this stakeholder</p>
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
