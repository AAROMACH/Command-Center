'use client';

import { useState, useMemo, useEffect } from 'react';
import type { WorkOrder, Project } from '@/lib/types';
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
import { 
  Play,
  Search,
  FileText,
  Briefcase,
  Check,
  MapPin,
  Navigation,
  Loader2,
  ShieldCheck,
  LocateFixed,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCZ3jd1i_QKskjeq2kJSjGV0n7Z4uQYzH0";

type CheckInDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    workOrders: WorkOrder[];
    projects: Project[];
};

type GeoLocation = {
    lat: number;
    lng: number;
    accuracy?: number;
};

export function CheckInDialog({ isOpen, setIsOpen, workOrders, projects }: CheckInDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const { toast } = useToast();

    // Simulated distance for prototyping logic
    const [simulatedDistance, setSimulatedDistance] = useState(0.4); 

    useEffect(() => {
        if (isOpen) {
            setIsLocating(true);
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        });
                        setIsLocating(false);
                        setSimulatedDistance(Math.random() > 0.7 ? 1.4 : 0.4);
                    },
                    (error) => {
                        console.error("Geolocation error:", error);
                        setIsLocating(false);
                        toast({
                            variant: "destructive",
                            title: "GPS Error",
                            description: "Unable to retrieve live coordinates. Please ensure location services are enabled.",
                        });
                    },
                    { enableHighAccuracy: true }
                );
            }
        } else {
            setSelectedId(null);
            setSearchQuery("");
        }
    }, [isOpen, toast]);

    const searchableItems = useMemo(() => {
        const woItems = workOrders.map(wo => ({
            id: wo.id,
            name: `${wo.id.toUpperCase()} - ${wo.description}`,
            location: wo.location,
            type: 'Assignment' as const,
            icon: FileText
        }));
        const projItems = projects.map(p => ({
            id: p.id,
            name: p.name,
            location: p.location,
            type: 'Project' as const,
            icon: Briefcase
        }));
        return [...woItems, ...projItems];
    }, [workOrders, projects]);

    const filteredItems = useMemo(() => {
        if (!searchQuery) return searchableItems;
        const lowerQuery = searchQuery.toLowerCase();
        return searchableItems.filter(item => 
            item.name.toLowerCase().includes(lowerQuery) || 
            item.type.toLowerCase().includes(lowerQuery) ||
            item.location.toLowerCase().includes(lowerQuery)
        );
    }, [searchQuery, searchableItems]);

    const selectedItem = useMemo(() => 
        searchableItems.find(i => i.id === selectedId),
    [selectedId, searchableItems]);

    const isOutOfRange = simulatedDistance > 1.0;

    const handleCheckIn = () => {
        if (!selectedId || !userLocation) return;
        
        if (isOutOfRange) {
            toast({
                variant: "destructive",
                title: "Check In Flagged",
                description: `Location flagged: You are ${simulatedDistance}mi from site. Entry recorded with range discrepancy.`,
            });
        } else {
            toast({
                title: "Check In Successful",
                description: "On-site session initiated. GPS monitoring active at coordinates.",
            });
        }
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Navigation className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Check In Terminal</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">GPS-verified on-site reporting for assignments and projects.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                    {/* Live GPS Status */}
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                <LocateFixed size={12} className={userLocation ? "text-text-green" : "text-text-red"}/>
                                Coordinates
                            </h3>
                            {isLocating ? (
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-accent-gold uppercase animate-pulse">
                                    <Loader2 size={10} className="animate-spin" /> Retrieving GPS...
                                </div>
                            ) : (
                                <Badge 
                                    variant={selectedId && !isOutOfRange ? "active" : "outline"} 
                                    className={cn("text-[9px] h-5 uppercase tracking-widest px-2", !selectedId || isOutOfRange ? "bg-bg-tertiary text-text-muted border-border-sub" : "")}
                                >
                                    {selectedId && !isOutOfRange ? "On Site" : "GPS Locked"}
                                </Badge>
                            )}
                        </div>
                        {userLocation ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-0.5">
                                    <p className="text-[9px] uppercase font-bold text-text-muted">Latitude</p>
                                    <p className="text-xs font-mono font-bold text-text-primary">{userLocation.lat.toFixed(6)}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[9px] uppercase font-bold text-text-muted">Longitude</p>
                                    <p className="text-xs font-mono font-bold text-text-primary">{userLocation.lng.toFixed(6)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-[10px] text-text-red uppercase font-bold tracking-widest italic py-1">
                                Awaiting location sensor input...
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Select job Registry</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input 
                                placeholder="Search by ID, Title, or Location..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-10 pl-9 text-xs bg-bg-primary border-border-sub focus:border-brand-red"
                            />
                        </div>
                    </div>

                    <div className="border border-border-sub rounded-md overflow-hidden bg-bg-primary">
                        <ScrollArea className={cn("transition-all duration-300", selectedId ? "h-[100px]" : "h-[200px]")}>
                            <div className="p-1 space-y-1">
                                {filteredItems.length > 0 ? filteredItems.map(item => {
                                    const isSelected = selectedId === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedId(item.id)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-3 rounded text-left transition-colors",
                                                isSelected ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-secondary"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn("p-2 rounded", isSelected ? "bg-white/20" : "bg-bg-tertiary")}>
                                                    <item.icon size={16} className={isSelected ? "text-white" : "text-text-muted"} />
                                                </div>
                                                <div>
                                                    <p className={cn("text-[11px] font-bold uppercase", isSelected ? "text-white" : "text-text-primary")}>{item.name}</p>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <MapPin size={10} className={isSelected ? "text-white/60" : "text-text-muted"} />
                                                        <p className={cn("text-[9px] uppercase tracking-widest", isSelected ? "text-white/80" : "text-text-muted")}>{item.location}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            {isSelected && <Check size={16} />}
                                        </button>
                                    )
                                }) : (
                                    <div className="text-center py-12">
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No matches found</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    {selectedItem && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className={cn(
                                 "p-3 rounded-lg border flex items-center justify-between transition-colors",
                                 isOutOfRange 
                                    ? "bg-brand-red-dim/10 border-brand-red/30" 
                                    : "bg-bg-secondary/50 border-border-sub"
                             )}>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-text-muted">Verification Status</p>
                                    {isOutOfRange ? (
                                        <p className="text-[10px] font-bold text-text-red uppercase flex items-center gap-1.5">
                                            <AlertCircle size={12}/> Flagged: Out of Range ({simulatedDistance}mi)
                                        </p>
                                    ) : (
                                        <p className="text-[10px] font-bold text-text-green uppercase flex items-center gap-1.5">
                                            <ShieldCheck size={12}/> Proximity Verified (On Site)
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                     <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest">Target Location</p>
                                     <p className="text-[10px] font-bold text-text-primary uppercase truncate max-w-[150px]">{selectedItem.location}</p>
                                </div>
                             </div>

                             {isOutOfRange && (
                                <div className="p-2.5 rounded bg-brand-red-dim/20 border border-brand-red/20 text-center">
                                    <p className="text-[9px] text-text-red font-bold uppercase tracking-wider">
                                        Note: Checking in while flagged will notify operations for manual review.
                                    </p>
                                </div>
                             )}

                             {/* Location Preview */}
                             <div className="relative aspect-video w-full bg-bg-primary rounded-lg overflow-hidden border border-border-sub">
                                <iframe 
                                    src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encodeURIComponent(selectedItem.location)}`} 
                                    width="100%" 
                                    height="100%" 
                                    style={{ border: 0, filter: 'grayscale(0.8) invert(1)' }} 
                                    allowFullScreen={true} 
                                    loading="lazy"
                                    className="absolute top-0 left-0"
                                ></iframe>
                                <div className="absolute top-2 left-2 z-10">
                                    <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[9px] font-bold uppercase text-white tracking-widest">
                                        <Navigation size={10} className="animate-pulse text-brand-red" /> Live Site Feed
                                    </div>
                                </div>
                             </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border-default p-6 bg-bg-secondary/30">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 flex-1 uppercase font-bold text-[10px] tracking-widest">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleCheckIn} 
                        className={cn(
                            "h-10 flex-1 uppercase font-bold text-[10px] tracking-widest",
                            isOutOfRange ? "bg-accent-gold hover:bg-accent-gold/80" : "bg-brand-red hover:bg-brand-red-hover"
                        )}
                        disabled={!selectedId || !userLocation}
                    >
                        <Play size={14} className="mr-2 fill-current" /> 
                        {isOutOfRange ? "Override & Confirm" : "Confirm Check In"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
