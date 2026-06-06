'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Invoice, InvoiceLineItem, Technician, Project, WorkOrder } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, FileText, Hammer, Package, DollarSign, Zap } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type InvoiceEditorProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    invoice: Invoice | null;
    clients: Technician[];
    projects: Project[];
    workOrders: WorkOrder[];
    onSave: (invoice: Invoice) => void;
};

const premadeLineItems = [
    { group: 'Labor & Services (Tax Exempt)', items: [
        { id: 'labor_fiber', description: 'Fiber Optic Labor ($150/hr)', unitPrice: 150, category: 'labor' },
        { id: 'labor_install', description: 'Installation Labor ($120/hr)', unitPrice: 120, category: 'labor' },
        { id: 'labor_diag', description: 'Troubleshooting ($100/hr)', unitPrice: 100, category: 'labor' },
        { id: 'labor_smart', description: 'Smart Hands ($85/hr)', unitPrice: 85, category: 'labor' },
        { id: 'service_call', description: 'Service Dispatch Fee', unitPrice: 75, category: 'labor' },
    ]},
    { group: 'Cabling & Wiring (8% Tax)', items: [
        { id: 'cat6_plenum', description: 'CAT6 Plenum Cable (1000ft)', unitPrice: 450, category: 'material' },
        { id: 'cat6_riser', description: 'CAT6 Riser Cable (1000ft)', unitPrice: 320, category: 'material' },
        { id: 'fiber_patch', description: 'LC-LC Duplex Fiber Patch (3m)', unitPrice: 24, category: 'material' },
    ]},
    { group: 'Network & Infrastructure (8% Tax)', items: [
        { id: 'poe_8', description: '8-Port Managed PoE Switch', unitPrice: 195, category: 'material' },
        { id: 'ap_ac', description: 'Enterprise Wireless Access Point', unitPrice: 245, category: 'material' },
        { id: 'rack_6u', description: '6U Wall Mount Rack Enclosure', unitPrice: 180, category: 'material' },
    ]}
];

export function InvoiceEditor({ isOpen, setIsOpen, invoice, clients, projects, workOrders, onSave }: InvoiceEditorProps) {
    const [invoiceData, setInvoiceData] = useState<Partial<Invoice>>({});
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen) {
            if (invoice) {
                setInvoiceData({
                    ...invoice,
                    issueDate: format(parseISO(invoice.issueDate), 'yyyy-MM-dd'),
                    dueDate: format(parseISO(invoice.dueDate), 'yyyy-MM-dd'),
                });
            } else {
                setInvoiceData({
                    invoiceNumber: `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`,
                    issueDate: format(new Date(), 'yyyy-MM-dd'),
                    dueDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
                    lineItems: [],
                    status: 'draft',
                });
            }
        }
    }, [invoice, isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setInvoiceData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSelectChange = (name: string, value: string) => {
        let update: Partial<Invoice> = {};

        if (name === 'clientId') {
            const client = clients.find(c => c.id === value);
            update.clientId = value;
            update.clientName = client?.clientCompany || client?.name || '';
        } else if (name === 'relatedId') {
            if (value.startsWith('proj-')) {
                update.projectId = value;
                update.workOrderId = null as any;
            } else if (value.startsWith('wo-')) {
                update.workOrderId = value;
                update.projectId = null as any;
            } else {
                 update.workOrderId = null as any;
                 update.projectId = null as any;
            }
        } else {
            update = { [name]: value };
        }

        setInvoiceData(prev => ({ ...prev, ...update }));
    };

    const handleLineItemChange = (id: string, field: keyof InvoiceLineItem, value: any) => {
        const updatedLineItems = (invoiceData.lineItems || []).map(item => 
            item.id === id ? { ...item, [field]: value } : item
        );
        setInvoiceData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const handlePremadeItemSelect = (id: string, itemId: string) => {
        const allItems = premadeLineItems.flatMap(g => g.items);
        const premade = allItems.find(p => p.id === itemId);
        if (!premade) return;

        const updatedLineItems = (invoiceData.lineItems || []).map(item => 
            item.id === id ? {
                ...item,
                description: premade.description,
                unitPrice: premade.unitPrice,
                category: premade.category as 'labor' | 'material',
            } : item
        );
        setInvoiceData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const addLineItem = (category: 'labor' | 'material') => {
        const newItem: InvoiceLineItem = { 
            id: `li-${Date.now()}`,
            description: '',
            quantity: 1,
            unitPrice: 0,
            category,
            isEmergencyProtocol: false
        };
        setInvoiceData(prev => ({ 
            ...prev, 
            lineItems: [...(prev.lineItems || []), newItem] 
        }));
    };

    const removeLineItem = (id: string) => {
        const newLineItems = (invoiceData.lineItems || []).filter(item => item.id !== id);
        setInvoiceData(prev => ({ ...prev, lineItems: newLineItems }));
    };

    const laborItems = useMemo(() => 
        (invoiceData.lineItems || []).filter(item => item.category === 'labor')
    , [invoiceData.lineItems]);

    const materialItems = useMemo(() => 
        (invoiceData.lineItems || []).filter(item => item.category === 'material')
    , [invoiceData.lineItems]);

    const { subtotal, laborSubtotal, materialsSubtotal, tax, total } = useMemo(() => {
        const items = invoiceData.lineItems || [];

        let labor = 0;
        let materials = 0;

        items.forEach(item => {
            const baseTotal = item.quantity * item.unitPrice;
            if (item.category === 'labor') {
                const effectiveTotal = item.isEmergencyProtocol ? baseTotal * 1.5 : baseTotal;
                labor += effectiveTotal;
            } else {
                materials += baseTotal;
            }
        });

        const taxRate = 0.08; // 8% Regional Material Tax
        const taxAmount = materials * taxRate;
        
        return { 
            subtotal: labor + materials, 
            laborSubtotal: labor,
            materialsSubtotal: materials,
            tax: taxAmount, 
            total: labor + materials + taxAmount 
        };
    }, [invoiceData.lineItems]);

    const isAnyMultiplierActive = useMemo(() => 
        (invoiceData.lineItems || []).some(item => item.category === 'labor' && item.isEmergencyProtocol)
    , [invoiceData.lineItems]);

    const handleSave = () => {
        if (!invoiceData.clientId) {
            toast({ variant: 'destructive', title: 'Registry Error', description: 'Target client selection required for authorization.' });
            return;
        }

        // Tactical sanitization: removing undefined keys to prevent Firestore write failure
        const cleanedData = JSON.parse(JSON.stringify(invoiceData));

        const finalInvoice: Invoice = {
            ...cleanedData,
            subtotal,
            tax,
            total,
        } as Invoice;

        onSave(finalInvoice);
    };

    const LineItemRow = ({ item }: { item: InvoiceLineItem }) => {
        const isLabor = item.category === 'labor';

        return (
            <div key={item.id} className="grid grid-cols-[1.2fr,2fr,60px,100px,60px,40px] gap-2 items-center p-2 rounded-lg border border-border-sub bg-bg-primary">
                <Select onValueChange={(val) => handlePremadeItemSelect(item.id, val)}>
                    <SelectTrigger className="h-8 bg-bg-secondary text-[10px] uppercase font-bold"><SelectValue placeholder="Preset..."/></SelectTrigger>
                    <SelectContent>
                        {premadeLineItems.map(group => (
                            <SelectGroup key={group.group}>
                                <SelectLabel className="text-[8px] font-black uppercase text-brand-red tracking-widest px-2 py-1.5">{group.group}</SelectLabel>
                                {group.items.filter(pi => pi.category === item.category).map(pi => (
                                    <SelectItem key={pi.id} value={pi.id} className="text-[10px] uppercase font-bold">{pi.description}</SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
                <div className="space-y-1 text-left">
                    <Input placeholder="Description..." value={item.description} onChange={e => handleLineItemChange(item.id, 'description', e.target.value)} className="h-8 text-xs bg-bg-secondary" />
                </div>
                <Input type="number" placeholder="0" value={item.quantity} onChange={e => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-bg-secondary text-center" />
                <div className="relative">
                    <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                    <Input 
                        type="number" 
                        placeholder="0.00" 
                        value={isLabor && item.isEmergencyProtocol ? (item.unitPrice * 1.5).toFixed(2) : item.unitPrice} 
                        onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            const baseVal = isLabor && item.isEmergencyProtocol ? val / 1.5 : val;
                            handleLineItemChange(item.id, 'unitPrice', baseVal);
                        }} 
                        className={cn(
                            "h-8 text-xs bg-bg-secondary text-center font-mono pl-6",
                            isLabor && item.isEmergencyProtocol && "text-text-green font-bold"
                        )} 
                    />
                </div>
                {isLabor ? (
                    <div className="flex flex-col items-center gap-1">
                        <Label className="text-[6px] font-black uppercase text-text-muted text-center leading-none">Emergency Protocol (1.5x)</Label>
                        <Switch 
                            checked={!!item.isEmergencyProtocol} 
                            onCheckedChange={(val) => handleLineItemChange(item.id, 'isEmergencyProtocol', val)}
                            className="scale-50 h-4"
                        />
                    </div>
                ) : <div />}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red" onClick={() => removeLineItem(item.id)}><Trash2 size={14}/></Button>
            </div>
        );
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-[1000px] w-full bg-bg-elevated border-border-default overflow-y-auto">
                <SheetHeader className="pb-4 border-b border-border-sub">
                    <SheetTitle className="flex items-center gap-2 text-lg uppercase font-bold tracking-widest text-left">
                        <FileText size={20} className="text-brand-red"/>
                        {invoice ? 'Audit Invoice Registry' : 'Initialize Client Settlement'}
                    </SheetTitle>
                    <SheetDescription className="text-xs uppercase font-bold text-text-muted tracking-widest text-left">
                        {invoice ? `Registry Ref: ${invoice.invoiceNumber}` : 'Populate parameters for strategic billing.'}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="py-6 space-y-8 text-left">
                    <div className="p-4 rounded-lg border border-border-sub bg-bg-primary/50 space-y-6 text-left">
                        <div className="grid grid-cols-2 gap-6">
                             <div className="space-y-2 text-left">
                                <Label htmlFor="clientId" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Client Entity</Label>
                                <Select value={invoiceData.clientId} onValueChange={(val) => handleSelectChange('clientId', val)}>
                                    <SelectTrigger id="clientId" className="h-10 bg-bg-secondary"><SelectValue placeholder="Select target client..." /></SelectTrigger>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.clientCompany || c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label htmlFor="relatedId" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Related Mission (Proj/WO)</Label>
                                <Select value={invoiceData.projectId || invoiceData.workOrderId} onValueChange={(val) => handleSelectChange('relatedId', val)}>
                                    <SelectTrigger id="relatedId" className="h-10 bg-bg-secondary"><SelectValue placeholder="Link mission registry..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectLabel className="px-2 py-1.5 text-[9px] font-black uppercase text-text-muted tracking-widest">Active Projects</SelectLabel>
                                            {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs uppercase font-bold">{p.name}</SelectItem>)}
                                        </SelectGroup>
                                         <SelectGroup>
                                            <SelectLabel className="px-2 py-1.5 text-[9px] font-black uppercase text-text-muted tracking-widest">Assignments Pool</SelectLabel>
                                            {workOrders.map(wo => <SelectItem key={wo.id} value={wo.id} className="text-xs uppercase font-bold">{wo.id.toUpperCase()} - {wo.description}</SelectItem>)}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                         <div className="grid grid-cols-3 gap-6">
                             <div className="space-y-2 text-left">
                                <Label htmlFor="invoiceNumber" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Invoice ID</Label>
                                <Input id="invoiceNumber" name="invoiceNumber" value={invoiceData.invoiceNumber || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary font-mono text-xs uppercase font-bold" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label htmlFor="issueDate" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Issue Date</Label>
                                <Input id="issueDate" name="issueDate" type="date" value={invoiceData.issueDate || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary text-xs" />
                            </div>
                             <div className="space-y-2 text-left">
                                <Label htmlFor="dueDate" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Due Date</Label>
                                <Input id="dueDate" name="dueDate" type="date" value={invoiceData.dueDate || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary text-xs" />
                            </div>
                         </div>
                    </div>
                    
                    <div className="space-y-10">
                        {/* LABOR REGISTRY */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                    <Hammer size={14} className="text-brand-red" />
                                    Labor Registry (Tax Exempt)
                                </h3>
                                <Badge variant="outline" className="text-[9px] font-mono text-text-muted h-5">{laborItems.length} Entries</Badge>
                            </div>
                            <div className="space-y-2">
                                <div className="grid grid-cols-[1.2fr,2fr,60px,100px,60px,40px] gap-2 items-center text-[9px] font-black uppercase tracking-widest text-text-muted px-2">
                                    <span>Preset</span>
                                    <span>Description</span>
                                    <span className="text-center">Hrs</span>
                                    <span className="text-center">Rate ($/hr)</span>
                                    <span className="text-center">Emergency</span>
                                </div>
                                {laborItems.map((item) => (
                                    <LineItemRow key={item.id} item={item} />
                                ))}
                            </div>
                            <Button variant="dashed" size="sm" className="w-full h-10 border-brand-red/20 text-brand-red hover:bg-brand-red/5" onClick={() => addLineItem('labor')}>
                                <Plus size={16} className="mr-2"/> Add Labor Row
                            </Button>
                        </div>

                        {/* MATERIAL REGISTRY */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                    <Package size={14} className="text-accent-gold" />
                                    Material Registry (8% Tax)
                                </h3>
                                <Badge variant="outline" className="text-[9px] font-mono text-text-muted h-5">{materialItems.length} Entries</Badge>
                            </div>
                            <div className="space-y-2">
                                <div className="grid grid-cols-[1.2fr,2fr,60px,100px,60px,40px] gap-2 items-center text-[9px] font-black uppercase tracking-widest text-text-muted px-2">
                                    <span>Preset</span>
                                    <span>Part / Asset Identification</span>
                                    <span className="text-center">QTY</span>
                                    <span className="text-center">Unit ($)</span>
                                </div>
                                {materialItems.map((item) => (
                                    <LineItemRow key={item.id} item={item} />
                                ))}
                            </div>
                            <Button variant="dashed" size="sm" className="w-full h-10 border-accent-gold/20 text-accent-gold hover:bg-accent-gold/5" onClick={() => addLineItem('material')}>
                                <Plus size={16} className="mr-2"/> Add Material Row
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-4 text-left">
                         <div className="space-y-2 text-left">
                            <Label htmlFor="notes" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Tactical Audit Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Terms, wiring standards, or payment protocol..." value={invoiceData.notes || ''} onChange={handleInputChange} className="min-h-[150px] bg-bg-primary text-xs leading-relaxed"/>
                        </div>
                        <div className="p-6 rounded-lg bg-bg-secondary border border-border-sub space-y-3 shadow-inner text-left">
                            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                <span className="text-text-muted">
                                    Labor Subtotal {isAnyMultiplierActive ? "(Multiplier Applied)" : ""}
                                </span>
                                <span className="font-mono text-text-primary">${laborSubtotal.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                <span className="text-text-muted">Materials Subtotal</span>
                                <span className="font-mono text-text-primary">${materialsSubtotal.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-accent-gold">
                                <span className="flex items-center gap-1.5"><Zap size={10}/> Material Tax (8.0%)</span>
                                <span className="font-mono">${tax.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center border-t border-dashed border-border-sub pt-4 mt-4">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-text-primary">Final Settlement</span>
                                <span className="text-2xl font-mono font-bold text-text-green">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center pt-6 border-t border-border-sub mt-4 sticky bottom-0 bg-bg-elevated py-4">
                    <div>
                        <Select value={invoiceData.status} onValueChange={(val) => handleSelectChange('status', val)}>
                            <SelectTrigger className="w-[160px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="draft">DRAFT</SelectItem>
                                <SelectItem value="sent">TRANSMITTED</SelectItem>
                                <SelectItem value="paid">SETTLED</SelectItem>
                                <SelectItem value="overdue">EXPIRED</SelectItem>
                                <SelectItem value="void">NULLIFIED</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Discard</Button>
                        <Button onClick={handleSave} className="h-10 px-12 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">Commit Invoice</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
