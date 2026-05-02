'use client';

import { useState, useMemo, useRef } from 'react';
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
  Receipt, 
  Loader2, 
  Sparkles, 
  Check, 
  X, 
  Camera, 
  Search,
  FileText,
  Briefcase,
  Upload
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type ReceiptUploadDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    workOrders: WorkOrder[];
    projects: Project[];
};

export function ReceiptUploadDialog({ isOpen, setIsOpen, workOrders, projects }: ReceiptUploadDialogProps) {
    const [step, setStep] = useState<'upload' | 'extracting' | 'review'>('upload');
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [extractedData, setExtractedData] = useState({
        merchant: '',
        date: '',
        amount: '',
        relatedId: '',
        relatedName: ''
    });
    const { toast } = useToast();

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setStep('extracting');
            let progress = 0;
            const interval = setInterval(() => {
                progress += 15;
                setExtractionProgress(progress);
                if (progress >= 100) {
                    clearInterval(interval);
                    simulateExtraction();
                }
            }, 300);
        }
    };

    const handleManualEntry = () => {
        setExtractedData({
            merchant: '',
            date: new Date().toISOString().split('T')[0],
            amount: '',
            relatedId: '',
            relatedName: ''
        });
        setStep('review');
    };

    const simulateExtraction = () => {
        setExtractedData({
            merchant: 'Home Depot #4210',
            date: new Date().toISOString().split('T')[0],
            amount: '84.52',
            relatedId: '',
            relatedName: ''
        });
        setStep('review');
    };

    const handleSave = () => {
        if (!extractedData.merchant || !extractedData.amount || !extractedData.relatedId) {
            toast({
                variant: "destructive",
                title: "Incomplete Data",
                description: "Please ensure all fields including the assignment/project are selected.",
            });
            return;
        }
        toast({
            title: "Receipt Processed",
            description: "Expense record created and attached successfully.",
        });
        resetAndClose();
    };

    const resetAndClose = () => {
        setStep('upload');
        setExtractionProgress(0);
        setSearchQuery("");
        setExtractedData({ merchant: '', date: '', amount: '', relatedId: '', relatedName: '' });
        setIsOpen(false);
    };

    const searchableItems = useMemo(() => {
        const woItems = workOrders.map(wo => ({
            id: wo.id,
            name: `${wo.id.toUpperCase()} - ${wo.description}`,
            type: 'Assignment' as const,
            icon: FileText
        }));
        const projItems = projects.map(p => ({
            id: p.id,
            name: p.name,
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
            item.type.toLowerCase().includes(lowerQuery)
        );
    }, [searchQuery, searchableItems]);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <Receipt className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Receipt Console</DialogTitle>
                    </div>
                    <DialogDescription>Attach field expenses via AI extraction or manual terminal entry.</DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleFileChange}
                            />
                            <div 
                                className="border-2 border-dashed border-border-main rounded-lg p-12 text-center hover:border-brand-red hover:bg-brand-red-dim/5 transition-all cursor-pointer group"
                                onClick={handleFileClick}
                            >
                                <div className="flex justify-center mb-4">
                                    <div className="p-5 bg-bg-secondary rounded-full group-hover:bg-brand-red group-hover:text-white transition-colors">
                                        <Camera size={40} />
                                    </div>
                                </div>
                                <p className="text-sm font-bold uppercase tracking-widest mb-1 text-text-primary">Upload Receipt</p>
                                <p className="text-xs text-text-muted">Digital photo required for AI extraction</p>
                            </div>
                            
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border-sub" /></div>
                                <div className="relative flex justify-center text-[10px] uppercase font-bold text-text-muted"><span className="bg-bg-elevated px-2">OR</span></div>
                            </div>

                            <Button 
                                variant="outline" 
                                className="w-full h-11 text-[10px] uppercase font-bold tracking-[0.2em]"
                                onClick={handleManualEntry}
                            >
                                Manual Terminal Entry
                            </Button>
                        </div>
                    )}

                    {step === 'extracting' && (
                        <div className="text-center py-10 space-y-6">
                            <div className="flex justify-center">
                                <Loader2 size={48} className="animate-spin text-brand-red" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-center gap-2 text-accent-gold">
                                    <Sparkles size={16} />
                                    <p className="text-sm font-bold uppercase tracking-widest">AI Extraction in Progress</p>
                                </div>
                                <p className="text-xs text-text-muted font-mono">Parsing merchant metadata and financial signatures...</p>
                            </div>
                            <div className="px-10">
                                <Progress value={extractionProgress} className="h-1 bg-bg-secondary" />
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Merchant / Vendor</Label>
                                    <Input 
                                        placeholder="e.g. Home Depot"
                                        value={extractedData.merchant} 
                                        onChange={(e) => setExtractedData({...extractedData, merchant: e.target.value})}
                                        className="h-10 text-xs bg-bg-primary border-border-sub focus:border-brand-red"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Amount ($)</Label>
                                    <Input 
                                        placeholder="0.00"
                                        value={extractedData.amount} 
                                        onChange={(e) => setExtractedData({...extractedData, amount: e.target.value})}
                                        className="h-10 text-xs bg-bg-primary border-border-sub font-mono focus:border-brand-red text-text-green"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Transaction Date</Label>
                                <Input 
                                    type="date"
                                    value={extractedData.date} 
                                    onChange={(e) => setExtractedData({...extractedData, date: e.target.value})}
                                    className="h-10 text-xs bg-bg-primary border-border-sub focus:border-brand-red"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Search Assignment or Project</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                    <Input 
                                        placeholder="Search across your assignments..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-10 pl-9 text-xs bg-bg-primary border-border-sub focus:border-brand-red"
                                    />
                                </div>
                                
                                <div className="border border-border-sub rounded-md overflow-hidden bg-bg-primary mt-2">
                                    <ScrollArea className="h-[140px]">
                                        <div className="p-1 space-y-1">
                                            {filteredItems.length > 0 ? filteredItems.map(item => {
                                                const isSelected = extractedData.relatedId === item.id;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => setExtractedData({...extractedData, relatedId: item.id, relatedName: item.name})}
                                                        className={cn(
                                                            "w-full flex items-center justify-between p-2 rounded text-left transition-colors",
                                                            isSelected ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-secondary"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <item.icon size={14} className={isSelected ? "text-white" : "text-text-muted"} />
                                                            <div>
                                                                <p className={cn("text-[11px] font-bold uppercase", isSelected ? "text-white" : "text-text-primary")}>{item.name}</p>
                                                                <p className={cn("text-[9px] uppercase tracking-widest", isSelected ? "text-white/80" : "text-text-muted")}>{item.type}</p>
                                                            </div>
                                                        </div>
                                                        {isSelected && <Check size={14} />}
                                                    </button>
                                                )
                                            }) : (
                                                <div className="text-center py-8 text-[10px] text-text-muted uppercase font-bold">No matches found</div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border-default pt-4">
                    <Button variant="outline" onClick={resetAndClose} className="h-10">
                        <X size={16} className="mr-2" /> Cancel
                    </Button>
                    {step === 'review' && (
                        <Button 
                            onClick={handleSave} 
                            className="h-10 bg-brand-red hover:bg-brand-red-hover px-8"
                            disabled={!extractedData.relatedId}
                        >
                            <Upload size={16} className="mr-2" /> Sync Record
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
