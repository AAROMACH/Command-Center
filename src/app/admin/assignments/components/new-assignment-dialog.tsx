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
import { Wrench, MapPin, Building2, Check, ChevronDown, UserCheck } from 'lucide-react';
import type { WorkOrder, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    scheduleDate: '',
    scheduleTime: '09:00 AM EST',
    clientName: '',
    location: ''
  });

  useEffect(() => {
      if (isOpen && !formData.scheduleDate) {
          setFormData(prev => ({
              ...prev,
              scheduleDate: new Date().toISOString().split('T')[0]
          }));
      }
  }, [isOpen, formData.scheduleDate]);
  
  const [isClientPopoverOpen, setIsClientPopoverOpen] = useState(false);
  const [isSitePopoverOpen, setIsSitePopoverOpen] = useState(false);

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

  const filteredClients = useMemo(() => {
    if (!formData.clientName) return clients;
    return clients.filter(c => 
        (c.clientCompany || '').toLowerCase().includes((formData.clientName || '').toLowerCase()) ||
        c.name.toLowerCase().includes((formData.clientName || '').toLowerCase())
    );
  }, [formData.clientName, clients]);

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
  };

  const selectClient = (client: Technician) => {
    const name = client.clientCompany || client.name;
    setFormData(prev => ({
        ...prev,
        clientName: name,
        location: '' 
    }));
    setIsClientPopoverOpen(false);
    toast({
        title: "Client Selected",
        description: `${name} has been set as the primary job entity.`,
    });
  };

  const selectSite = (site: { name: string, location: string }) => {
    setFormData(prev => ({ ...prev, location: site.location }));
    setIsSitePopoverOpen(false);
    toast({
        title: "Site Selected",
        description: `Deployment target set to ${site.name}.`,
    });
  };

  return (
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
                <div className="relative">
                    <Popover open={isClientPopoverOpen} onOpenChange={setIsClientPopoverOpen}>
                        <PopoverTrigger asChild>
                            <div className="relative w-full">
                                <Input 
                                    placeholder="Type name or search registry..." 
                                    value={formData.clientName}
                                    onChange={(e) => {
                                        setFormData({...formData, clientName: e.target.value});
                                        if (!isClientPopoverOpen) setIsClientPopoverOpen(true);
                                    }}
                                    onFocus={() => setIsClientPopoverOpen(true)}
                                    className="bg-bg-primary h-10 pr-10 text-xs font-bold uppercase tracking-wide focus:border-brand-red transition-all"
                                />
                                <button 
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                                    onClick={() => setIsClientPopoverOpen(!isClientPopoverOpen)}
                                >
                                    <ChevronDown size={14} />
                                </button>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent 
                            className="w-[300px] p-0 bg-bg-elevated border-border-main shadow-2xl z-[60]" 
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                            <div className="p-2 border-b border-border-sub bg-bg-tertiary">
                                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted px-1">Registry Matches</p>
                            </div>
                            <ScrollArea className="h-[200px]">
                                <div className="p-1">
                                    {filteredClients.map(client => (
                                        <button
                                            key={client.id}
                                            type="button"
                                            onClick={() => selectClient(client)}
                                            className="w-full flex items-center gap-3 p-2 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim"
                                        >
                                            <div className="p-1.5 bg-bg-secondary rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors">
                                                <Building2 size={12} />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-xs font-bold text-text-primary uppercase truncate">{client.clientCompany || client.name}</p>
                                                {client.businessType && (
                                                    <p className="text-[8px] text-accent-gold uppercase font-black tracking-tighter leading-none mt-0.5">{client.businessType}</p>
                                                )}
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest">ID: {client.id}</p>
                                            </div>
                                            {formData.clientName === (client.clientCompany || client.name) && <Check size={14} className="text-text-green shrink-0" />}
                                        </button>
                                    ))}
                                    {filteredClients.length === 0 && (
                                        <div className="p-4 text-center">
                                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No registry matches</p>
                                            <p className="text-[9px] text-text-muted mt-1 uppercase tracking-tight">System will record as new entity</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
                <div className="relative">
                    <Popover open={isSitePopoverOpen} onOpenChange={setIsSitePopoverOpen}>
                        <PopoverTrigger asChild>
                            <div className="relative w-full">
                                <Input 
                                    placeholder="Full address or coordinates..." 
                                    value={formData.location}
                                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                                    onFocus={() => {
                                        if (selectedClient?.managedSites && selectedClient.managedSites.length > 0) {
                                            setIsSitePopoverOpen(true);
                                        }
                                    }}
                                    className="bg-bg-primary h-10 pr-10 text-xs focus:border-brand-red transition-all"
                                />
                                {selectedClient?.managedSites && selectedClient.managedSites.length > 0 && (
                                    <button 
                                        type="button"
                                        className={cn("absolute right-3 top-1/2 -translate-y-1/2 transition-colors", formData.location ? "text-text-green" : "text-text-muted hover:text-text-primary")}
                                        onClick={() => setIsSitePopoverOpen(!isSitePopoverOpen)}
                                    >
                                        <MapPin size={16} />
                                    </button>
                                )}
                            </div>
                        </PopoverTrigger>
                        {selectedClient?.managedSites && selectedClient.managedSites.length > 0 && (
                            <PopoverContent className="w-[300px] p-0 bg-bg-elevated border-border-main shadow-2xl z-[60]" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                <div className="p-3 border-b border-border-sub bg-bg-tertiary flex items-center justify-between">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-gold">Verified Client Sites</p>
                                    <UserCheck size={10} className="text-accent-gold" />
                                </div>
                                <ScrollArea className="h-[180px]">
                                    <div className="p-1">
                                        {selectedClient.managedSites.map(site => (
                                            <button
                                                key={site.id}
                                                type="button"
                                                onClick={() => selectSite(site)}
                                                className="w-full p-2.5 rounded hover:bg-bg-tertiary transition-colors text-left border border-transparent hover:border-border-sub group active:bg-brand-red-dim"
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
                                                    {formData.location === site.location && <Check size={12} className="text-text-green shrink-0" />}
                                                </div>
                                                <p className="text-[10px] text-text-muted mt-0.5 truncate">{site.location}</p>
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </PopoverContent>
                        )}
                    </Popover>
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
          <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Abort</Button>
          <Button onClick={handleSave} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">
            Create Dispatch Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
