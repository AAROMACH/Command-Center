'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Image from 'next/image';
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
  Upload,
  Eye
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
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
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
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setReceiptImage(reader.result as string);
                setStep('extracting');
                startExtraction();
            };
            reader.readAsDataURL(file);
        }
    };

    const startExtraction = () => {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 15;
            setExtractionProgress(progress);
            if (progress >= 100) {
                clearInterval(interval);
                simulateExtraction();
            }
        }, 300);
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
        setReceiptImage(null);
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
            <DialogContent className="sm:max-w-[550px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
                <DialogHeader className="p-6 pb-2 text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <Receipt className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Receipt Console</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs uppercase font-bold text-text-muted">Photo identification required for all field expense records.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileChange}
                            />
                            <div 
                                className="border-2 border-dashed border-border-main rounded-lg p-16 text-center hover:border-brand-red hover:bg-brand-red-dim/5 transition-all cursor-pointer group"
                                onClick={handleFileClick}
                            >
                                <div className="flex justify-center mb-6">
                                    <div className="p-6 bg-bg-secondary rounded-full group-hover:bg-brand-red group-hover:text-white transition-colors">
                                        <Camera size={48} />
                                    </div>
                                </div>
                                <p className="text-sm font-bold uppercase tracking-widest mb-1 text-text-primary">Identify Receipt Photo</p>
                                <p className="text-xs text-text-muted uppercase font-medium">Digital capture required to initiate terminal entry</p>
                            </div>
                            
                            <div className="p-4 rounded-lg bg-bg-secondary/50 border border-border-sub text-center">
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
                                    Terminal Note: Manual entry is locked until receipt imagery is provided to ensure compliance with audit protocols.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'extracting' && (
                        <div className="text-center py-16 space-y-8">
                            <div className="flex justify-center">
                                <Loader2 size={56} className="animate-spin text-brand-red" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-2 text-accent-gold">
                                    <Sparkles size={18} />
                                    <p className="text-sm font-bold uppercase tracking-widest">AI Vision Processing</p>
                                </div>
                                <p className="text-xs text-text-muted font-mono max-w-[300px] mx-auto uppercase">Parsing high-fidelity merchant metadata and financial signatures...</p>
                            </div>
                            <div className="px-12">
                                <Progress value={extractionProgress} className="h-1 bg-bg-secondary" />
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-6">
                            {/* Receipt Preview */}
                            {receiptImage && (
                                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-border-sub bg-bg-primary">
                                    <div className="absolute top-2 left-2 z-10">
                                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[9px] font-bold uppercase text-white tracking-widest">
                                            <Eye size={10} /> Original Capture
                                        </div>
                                    </div>
                                    <Image 
                                        src={receiptImage} 
                                        alt="Receipt original" 
                                        fill 
                                        className="object-contain"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Merchant / Vendor</Label>
                                    <Input 
                                        placeholder="e.g. Home Depot"
                                        value={extractedData.merchant} 
                                        onChange={(e) => setExtractedData({...extractedData, merchant: e.target.value})}
                                        className="h-10 text-xs bg-bg-primary border-border-sub focus:border-brand-red uppercase font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Amount ($)</Label>
                                    <Input 
                                        placeholder="0.00"
                                        value={extractedData.amount} 
                                        onChange={(e) => setExtractedData({...extractedData, amount: e.target.value})}
                                        className="h-10 text-xs bg-bg-primary border-border-sub font-mono focus:border-brand-red text-text-green font-bold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Transaction Date</Label>
                                <Input 
                                    type="date"
                                    value={extractedData.date} 
                                    onChange={(e) => setExtractedData({...extractedData, date: e.target.value})}
                                    className="h-10 text-xs bg-bg-primary border-border-sub focus:border-brand-red"
                                />
                            </div>

                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Search Assignment or Project</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                    <Input 
                                        placeholder="Search across your assignments..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-10 pl-9 text-xs bg-bg-primary border-border-sub focus:border-brand-red uppercase font-bold"
                                    />
                                </div>
                                
                                <div className="border border-border-sub rounded-md overflow-hidden bg-bg-primary mt-2">
                                    <ScrollArea className="h-[120px]">
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
                                                                <p className={cn("text-[10px] font-bold uppercase", isSelected ? "text-white" : "text-text-primary")}>{item.name}</p>
                                                                <p className={cn("text-[8px] uppercase tracking-widest", isSelected ? "text-white/80" : "text-text-muted")}>{item.type}</p>
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

                <DialogFooter className="border-t border-border-default p-6 bg-bg-secondary/30">
                    <Button variant="outline" onClick={resetAndClose} className="h-10 flex-1 uppercase font-bold text-[10px] tracking-widest">
                        <X size={16} className="mr-2" /> Cancel
                    </Button>
                    {step === 'review' && (
                        <Button 
                            onClick={handleSave} 
                            className="h-10 bg-brand-red hover:bg-brand-red-hover flex-1 uppercase font-bold text-[10px] tracking-widest"
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
