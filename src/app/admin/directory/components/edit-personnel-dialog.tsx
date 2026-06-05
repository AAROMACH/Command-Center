'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { AppRole, Technician } from '@/lib/types';
import { ROLE_DATA } from '@/lib/constants/roles';
import { 
  User, 
  ChevronRight, 
  Lock, 
  Info,
  CircleCheck,
  Users,
  Save,
  MapPin,
  SearchCode,
  DollarSign
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { technicians } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type EditPersonnelDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  person: Technician;
  onSave: (updatedPerson: Technician) => void;
};

export function EditPersonnelDialog({ isOpen, setIsOpen, person, onSave }: EditPersonnelDialogProps) {
  const [formData, setFormData] = useState<Technician>(person);
  const [isNewCompany, setIsNewCompany] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
        setFormData(person);
        setIsNewCompany(false);
    }
  }, [person, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

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
            setFormData(prev => ({ ...prev, address: place.formatted_address }));
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
    if (!formData.address || !window.google || !window.google.maps || !window.google.maps.places) return;
    
    try {
      const service = new window.google.maps.places.PlacesService(document.createElement('div'));
      const request = {
        query: formData.address,
        fields: ['formatted_address', 'geometry'],
      };

      service.findPlaceFromQuery(request, (results: any, status: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
          const place = results[0];
          setFormData(prev => ({ ...prev, address: place.formatted_address }));
          toast({
            title: "Registry Coordinates Verified",
            description: `Personnel base address updated to verified record: ${place.formatted_address}`,
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

  const existingCompanies = useMemo(() => {
    const companies = new Set<string>();
    technicians.forEach(t => {
        if (t.clientCompany) companies.add(t.clientCompany);
    });
    return Array.from(companies).sort();
  }, []);

  const handleSave = () => {
    if (!formData.name || !formData.email || (formData.roles || []).length === 0) {
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please provide name, email, and at least one role."
        });
        return;
    }

    const updatedData = {
        ...formData,
        role: (formData.roles || [])[0].replace(/_/g, ' ').toUpperCase()
    };

    onSave(updatedData);
    setIsOpen(false);
  };

  const toggleRole = (role: AppRole) => {
    const currentRoles = formData.roles || [];
    const newRoles = currentRoles.includes(role) 
        ? currentRoles.filter(r => r !== role) 
        : [...currentRoles, role];
    
    setFormData(prev => ({
        ...prev,
        roles: newRoles
    }));
  };

  const currentPermissions = useMemo(() => {
    const roles = formData.roles || [];
    const allOptions = [...ROLE_DATA.admin, ...ROLE_DATA.tech, ...ROLE_DATA.client];
    const perms = new Set<string>();
    roles.forEach(roleId => {
        const option = allOptions.find(o => o.id === roleId);
        option?.permissions.forEach(p => perms.add(p));
    });
    return Array.from(perms);
  }, [formData.roles]);

  const isClientRole = formData.roles?.includes('client');
  const isFieldTech = formData.roles?.some(r => r.includes('tech') || r.includes('lead'));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="sm:max-w-[900px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.pac-container')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="page-title text-xl text-left">Personnel Profile Update</DialogTitle>
          <DialogDescription className="text-left">
            Modify credentials and adjust permissions for <span className="text-text-primary font-bold">{person.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-10">
          <section className="space-y-4">
             <div className="flex items-center gap-2 text-brand-red mb-4">
                <Users size={16} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Identity Credentials</h3>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-left">
                    <Label htmlFor="fullName" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Full Legal Name</Label>
                    <Input id="fullName" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-bg-primary h-9 text-xs font-bold uppercase" />
                </div>
                <div className="space-y-2 text-left">
                    <Label htmlFor="email" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Email</Label>
                    <Input id="email" type="email" value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-left">
                    <Label htmlFor="phone" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Phone Number</Label>
                    <Input id="phone" type="tel" value={formData.phone || ''} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="bg-bg-primary h-9 text-xs" />
                </div>
                <div className="space-y-2 text-left">
                    <Label htmlFor="address" className="text-[10px] uppercase font-bold tracking-widest text-text-muted">Home Base Address</Label>
                    <div className="relative group">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                        <Input 
                            ref={addressInputRef}
                            id="address" 
                            placeholder="Full address or coordinates..."
                            value={formData.address || ''} 
                            onChange={(e) => setFormData({...formData, address: e.target.value})} 
                            className="bg-bg-primary pl-9 pr-10 h-9 text-xs focus:border-brand-red transition-all" 
                        />
                        {formData.address && (
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
          </section>

          <section className="space-y-6">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-brand-red mb-2">
                    <Lock size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Authorization Grid</h3>
                </div>
                {isFieldTech && (
                    <div className="space-y-1 text-right">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Project Base Rate ($/hr)</Label>
                        <div className="relative w-32 ml-auto">
                            <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-green" />
                            <Input 
                                type="number" 
                                value={formData.hourlyRate || ''} 
                                onChange={e => setFormData({...formData, hourlyRate: parseFloat(e.target.value) || 0})}
                                className="bg-bg-primary h-9 pl-8 text-xs font-mono font-bold text-text-green text-right"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                )}
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(Object.keys(ROLE_DATA) as Array<keyof typeof ROLE_DATA>).map((category) => (
                    <div key={category} className="space-y-4">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-text-muted border-b border-border-sub pb-1 capitalize text-left">{category}</h4>
                        <div className="space-y-2">
                            {ROLE_DATA[category].map(role => {
                                const isSelected = (formData.roles || []).includes(role.id);
                                return (
                                    <div 
                                        key={role.id} 
                                        onClick={() => toggleRole(role.id)}
                                        className={`p-2.5 rounded border transition-all cursor-pointer flex items-center gap-3 ${
                                            isSelected ? 'bg-brand-red-dim border-brand-red' : 'bg-bg-primary border-border-sub hover:border-text-muted'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded ${isSelected ? 'bg-brand-red text-white' : 'bg-bg-tertiary text-text-muted'}`}>
                                            <role.icon size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? 'text-white' : 'text-text-primary'}`}>{role.label}</p>
                                        </div>
                                        <Checkbox checked={isSelected} className="h-3 w-3" />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
             </div>
          </section>

          {(formData.roles || []).length > 0 && (
             <section className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                 <div className="p-5 rounded-lg border border-border-sub bg-bg-primary/50 space-y-6">
                    <div className="flex items-center justify-between border-b border-border-sub pb-4">
                        <div className="flex items-center gap-2 text-text-green">
                            <CircleCheck size={16} />
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Authorized Permissions</h3>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {formData.roles?.map(r => (
                                <Badge key={r} variant="secondary" className="text-[8px] uppercase">{r.replace(/_/g, ' ')}</Badge>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4">
                        {currentPermissions.map((perm, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px] font-semibold text-text-secondary text-left">
                                <div className="h-1 w-1 rounded-full bg-text-green" />
                                {perm}
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-border-sub space-y-6">
                        {isClientRole && (
                            <div className="space-y-2 text-left">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="company" className="text-[10px] uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
                                        <Info size={12}/> Associated Organization / Client Entity
                                    </Label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setIsNewCompany(!isNewCompany);
                                            setFormData(prev => ({ ...prev, clientCompany: '' }));
                                        }}
                                        className="text-[9px] font-black text-brand-red uppercase tracking-tighter hover:underline"
                                    >
                                        {isNewCompany ? "Select Existing" : "Create New Entity"}
                                    </button>
                                </div>
                                {isNewCompany ? (
                                    <Input 
                                        id="company" 
                                        placeholder="Enter new company name..." 
                                        value={formData.clientCompany || ''} 
                                        onChange={(e) => setFormData({...formData, clientCompany: e.target.value})} 
                                        className="bg-bg-primary h-9 text-xs border-border-sub uppercase font-bold" 
                                    />
                                ) : (
                                    <Select 
                                        value={formData.clientCompany || ''} 
                                        onValueChange={(val) => setFormData({...formData, clientCompany: val})}
                                    >
                                        <SelectTrigger className="bg-bg-primary h-9 text-xs border-border-sub">
                                            <SelectValue placeholder="Select organization from registry..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {existingCompanies.map(c => (
                                                <SelectItem key={c} value={c} className="text-xs uppercase font-bold">{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}
                    </div>
                 </div>
             </section>
          )}
        </div>

        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default mt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="px-8 font-bold text-[10px] uppercase tracking-widest">Cancel Updates</Button>
          <Button onClick={handleSave} className="px-10 font-bold text-[10px] uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover group">
            <Save size={14} className="mr-2" />
            Commit Updates
            <ChevronRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
