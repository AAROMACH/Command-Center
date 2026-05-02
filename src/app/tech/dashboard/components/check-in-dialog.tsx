'use client';

import { useState, useMemo } from 'react';
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
  X,
  MapPin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type CheckInDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    workOrders: WorkOrder[];
    projects: Project[];
};

export function CheckInDialog({ isOpen, setIsOpen, workOrders, projects }: CheckInDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { toast } = useToast();

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

    const handleCheckIn = () => {
        if (!selectedId) return;
        
        toast({
            title: "Check In Successful",
            description: "On-site session initiated. GPS monitoring active.",
        });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default max-h-[85vh] overflow-hidden flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Play className="text-text-green h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Check In Terminal</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Identify the specific mission for immediate on-site reporting.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Search Missions</Label>
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
                        <ScrollArea className="h-[250px]">
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
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No active missions matching search</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="border-t border-border-default p-6 bg-bg-secondary/30">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 flex-1 uppercase font-bold text-[10px] tracking-widest">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleCheckIn} 
                        className="h-10 bg-brand-red hover:bg-brand-red-hover flex-1 uppercase font-bold text-[10px] tracking-widest"
                        disabled={!selectedId}
                    >
                        <Play size={14} className="mr-2 fill-current" /> Confirm Check In
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
