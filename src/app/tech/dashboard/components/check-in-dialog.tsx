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
  AlertCircle,
  Building2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, reverseGeocode } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type CheckInDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    workOrders: WorkOrder[];
    projects: Project[];
};

type GeoLocation = {
    lat: number;
    lng: number;
    city?: string;
};

export function CheckInDialog({ isOpen, setIsOpen, workOrders, projects }: CheckInDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const { toast } = useToast();

    // Simulated distance for prototyping logic
    const [simulatedDistance, setSimulatedDistance] = useState(0.4); 

    /**
     * System-wide Session Monitor.
     * Ensures only one assignment can be "In Progress" at any time.
     */
    const hasActiveSession = useMemo(() => {
        return workOrders.some(wo => wo.status === 'in-progress');
    }, [workOrders]);

    useEffect(() => {
        if (isOpen) {
            setIsLocating(true);
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
                        setUserLocation({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            city
                        });
                        setIsLocating(false);
                        setSimulatedDistance(Math.random() > 0.7 ? 1.4 : 0.4);
                    },
                    (error) => {
                        console.error("Geolocation error:", error);
                        setIsLocating(false);
                        toast({
                            variant: "destructive",
                            title: "Location unavailable",
                            description: "We couldn't get your location. Make sure location services are turned on.",
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
                title: "Check-in flagged",
                description: `You appear to be in ${userLocation.city}, ${simulatedDistance} mi from the site. Your check-in was saved and flagged for review.`,
            });
        } else {
            toast({
                title: "Checked in",
                description: `Location confirmed in ${userLocation.city}. You're now on site.`,
            });
        }
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl text-left">
                <DialogHeader className="p-6 pb-2 text-left">
                    <div className="flex items-center gap-2 mb-1 text-left">
                        <Navigation className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-semibold text-text-primary text-left">Check in</DialogTitle>
                    </div>
                    <DialogDescription className="text-[12px] text-text-muted text-left">Confirm you&apos;re on site for a job or project.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                    {/* Session Guard Warning */}
                    {hasActiveSession && (
                        <div className="p-4 rounded-xl border border-border-alert bg-brand-red/5 flex items-start gap-3 shadow-sm text-left">
                            <AlertCircle size={20} className="text-text-red shrink-0 mt-0.5" />
                            <div className="space-y-1 text-left">
                                <p className="text-[13px] font-semibold text-text-red text-left">You&apos;re checked in to another job</p>
                                <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                                    <span className="text-text-red font-semibold">Check out</span> of that job before checking in to a new one.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Identified Location */}
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-2 text-left">
                                <LocateFixed size={12} className={userLocation ? "text-text-green" : "text-text-red"}/>
                                Your location
                            </h3>
                            {isLocating ? (
                                <div className="flex items-center gap-1.5 text-[12px] font-medium text-accent-gold">
                                    <Loader2 size={12} className="animate-spin" /> Finding you…
                                </div>
                            ) : (
                                <Badge 
                                    variant={selectedId && !isOutOfRange ? "active" : "outline"} 
                                    className={cn("text-[10px] h-5 uppercase tracking-wider px-2", !selectedId || isOutOfRange ? "bg-bg-tertiary text-text-muted border-border-sub" : "")}
                                >
                                    {selectedId && !isOutOfRange ? "On site" : "Location found"}
                                </Badge>
                            )}
                        </div>
                        {userLocation ? (
                            <div className="flex items-center gap-3 text-left">
                                <div className="p-2 bg-bg-secondary rounded border border-border-sub text-brand-red">
                                    <MapPin size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[14px] font-semibold text-text-primary text-left">{userLocation.city}</p>
                                    <p className="text-[12px] text-text-muted text-left">From your phone&apos;s GPS</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-[12px] text-text-muted py-1 text-left">
                                Waiting for your location…
                            </div>
                        )}
                    </div>

                    <div className="space-y-2 text-left">
                        <Label className="text-[12px] font-semibold text-text-muted text-left">Job or project</Label>
                        <div className="relative text-left">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input 
                                placeholder="Search by job ID or location" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-11 sm:h-10 pl-9 text-base sm:text-[13px] bg-bg-primary border-border-sub focus:border-brand-red"
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
                                            <div className="flex items-center gap-3 text-left">
                                                <div className={cn("p-2 rounded", isSelected ? "bg-white/20" : "bg-bg-tertiary")}>
                                                    <item.icon size={16} className={isSelected ? "text-white" : "text-text-muted"} />
                                                </div>
                                                <div className="text-left">
                                                    <p className={cn("text-[13px] font-semibold", isSelected ? "text-white" : "text-text-primary")}>{item.name}</p>
                                                    <div className="flex items-center gap-1 mt-0.5 text-left">
                                                        <MapPin size={10} className={isSelected ? "text-white/60" : "text-text-muted"} />
                                                        <p className={cn("text-[12px]", isSelected ? "text-white/80" : "text-text-muted")}>{item.location}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            {isSelected && <Check size={16} />}
                                        </button>
                                    )
                                }) : (
                                    <div className="text-center py-12">
                                        <p className="text-[12px] text-text-muted text-center">No matching jobs</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    {selectedItem && MAPS_API_KEY && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 text-left">
                             <div className={cn(
                                 "p-3 rounded-lg border flex items-center justify-between transition-colors",
                                 isOutOfRange 
                                    ? "bg-brand-red-dim/10 border-brand-red/30" 
                                    : "bg-bg-secondary/50 border-border-sub"
                             )}>
                                <div className="space-y-1 text-left">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted text-left">Distance check</p>
                                    {isOutOfRange ? (
                                        <p className="text-[12px] font-semibold text-text-red flex items-center gap-1.5 text-left">
                                            <AlertCircle size={12}/> Too far from site ({simulatedDistance} mi)
                                        </p>
                                    ) : (
                                        <p className="text-[12px] font-semibold text-text-green flex items-center gap-1.5 text-left">
                                            <ShieldCheck size={12}/> On site
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                     <p className="text-[10px] uppercase font-semibold text-text-muted tracking-wider">Job location</p>
                                     <p className="text-[12px] font-medium text-text-primary truncate max-w-[150px]">{selectedItem.location}</p>
                                </div>
                             </div>

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
                                    <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[10px] font-semibold uppercase text-white tracking-wider">
                                        <Navigation size={10} className="text-brand-red" /> Job location
                                    </div>
                                </div>
                             </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border-default p-6 bg-bg-secondary/30">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 flex-1">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleCheckIn} 
                        className={cn(
                            "h-10 flex-1 shadow-sm transition-all",
                            isOutOfRange ? "bg-accent-gold hover:bg-accent-gold/80" : "bg-brand-red hover:bg-brand-red-hover",
                            hasActiveSession && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                        disabled={!selectedId || !userLocation || hasActiveSession}
                    >
                        <Play size={14} className="mr-2 fill-current" /> 
                        {hasActiveSession ? "Already checked in" : isOutOfRange ? "Check in anyway" : "Check in"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}