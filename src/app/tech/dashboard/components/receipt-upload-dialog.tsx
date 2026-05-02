'use client';

import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Receipt, Upload, Loader2, Sparkles, Check, X, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

type ReceiptUploadDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    workOrders: WorkOrder[];
    projects: Project[];
};

export function ReceiptUploadDialog({ isOpen, setIsOpen, workOrders, projects }: ReceiptUploadDialogProps) {
    const [step, setStep] = useState<'upload' | 'extracting' | 'review'>('upload');
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [extractedData, setExtractedData] = useState({
        merchant: '',
        date: '',
        amount: '',
        relatedId: ''
    });
    const { toast } = useToast();

    const handleFileSelect = () => {
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
    };

    const simulateExtraction = () => {
        setExtractedData({
            merchant: 'Home Depot #4210',
            date: new Date().toISOString().split('T')[0],
            amount: '84.52',
            relatedId: ''
        });
        setStep('review');
    };

    const handleSave = () => {
        toast({
            title: "Receipt Processed",
            description: "Expense record created and attached successfully.",
        });
        resetAndClose();
    };

    const resetAndClose = () => {
        setStep('upload');
        setExtractionProgress(0);
        setExtractedData({ merchant: '', date: '', amount: '', relatedId: '' });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <Receipt className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Upload Receipt</DialogTitle>
                    </div>
                    <DialogDescription>Attach field expenses to assignments or active projects.</DialogDescription>
                </DialogHeader>

                <div className="py-6">
                    {step === 'upload' && (
                        <div 
                            className="border-2 border-dashed border-border-main rounded-lg p-10 text-center hover:border-brand-red hover:bg-brand-red-dim/5 transition-all cursor-pointer group"
                            onClick={handleFileSelect}
                        >
                            <div className="flex justify-center mb-4">
                                <div className="p-4 bg-bg-secondary rounded-full group-hover:bg-brand-red group-hover:text-white transition-colors">
                                    <Camera size={32} />
                                </div>
                            </div>
                            <p className="text-sm font-bold uppercase tracking-widest mb-1">Snap or Select Image</p>
                            <p className="text-xs text-text-muted">JPG, PNG or PDF (Max 5MB)</p>
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
                                    <p className="text-sm font-bold uppercase tracking-widest">Intelligent Extraction Active</p>
                                </div>
                                <p className="text-xs text-text-muted">Parsing merchant data and financial metadata...</p>
                            </div>
                            <Progress value={extractionProgress} className="h-1 bg-bg-secondary" />
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-4">
                            <div className="p-3 bg-green-dim/10 border border-green-border rounded flex items-center gap-2 mb-4">
                                <Check size={16} className="text-text-green" />
                                <p className="text-[10px] font-bold text-text-green uppercase tracking-widest">Extraction Complete</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Merchant</Label>
                                    <Input 
                                        value={extractedData.merchant} 
                                        onChange={(e) => setExtractedData({...extractedData, merchant: e.target.value})}
                                        className="h-9 text-xs bg-bg-primary border-border-sub"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Amount ($)</Label>
                                    <Input 
                                        value={extractedData.amount} 
                                        onChange={(e) => setExtractedData({...extractedData, amount: e.target.value})}
                                        className="h-9 text-xs bg-bg-primary border-border-sub font-mono"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Date</Label>
                                <Input 
                                    type="date"
                                    value={extractedData.date} 
                                    onChange={(e) => setExtractedData({...extractedData, date: e.target.value})}
                                    className="h-9 text-xs bg-bg-primary border-border-sub"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Attach To</Label>
                                <Select onValueChange={(val) => setExtractedData({...extractedData, relatedId: val})}>
                                    <SelectTrigger className="h-9 text-xs bg-bg-primary border-border-sub">
                                        <SelectValue placeholder="Select Assignment or Project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel className="text-[10px] uppercase tracking-widest text-text-muted">Work Orders</SelectLabel>
                                            {workOrders.map(wo => (
                                                <SelectItem key={wo.id} value={wo.id} className="text-xs">
                                                    {wo.id.toUpperCase()} - {wo.description}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                        <SelectGroup>
                                            <SelectLabel className="text-[10px] uppercase tracking-widest text-text-muted">Projects</SelectLabel>
                                            {projects.map(p => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border-default pt-4">
                    <Button variant="outline" onClick={resetAndClose}>
                        <X size={16} className="mr-2" /> Cancel
                    </Button>
                    {step === 'review' && (
                        <Button onClick={handleSave} className="bg-brand-red hover:bg-brand-red-hover">
                            <Check size={16} className="mr-2" /> Save Expense
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
