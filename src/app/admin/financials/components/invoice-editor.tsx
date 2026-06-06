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
import { Trash2, Plus, FileText, Wrench, FolderKanban, Coins, Clock, ShieldAlert, DollarSign } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

type InvoiceEditorProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    invoice: Invoice | null;
    clients: Technician[];
    projects: Project[];
    workOrders: WorkOrder[];
    onSave: (invoice: Invoice) => void;
};

const defaultLineItem: Omit<InvoiceLineItem, 'id'> = {
    description: '',
    quantity: 1,
    unitPrice: 0,
    category: 'labor',
};

const premadeLineItems = [
    { group: 'Labor & Services', items: [
        { id: 'labor_fiber', description: 'Fiber Optic Labor ($150/hr)', unitPrice: 150, category: 'labor' },
        { id: 'labor_install', description: 'Installation Labor ($120/hr)', unitPrice: 120, category: 'labor' },
        { id: 'labor_diag', description: 'Diagnostics & Audit ($100/hr)', unitPrice: 100, category: 'labor' },
        { id: 'labor_smart', description: 'Smart Hands ($85/hr)', unitPrice: 85, category: 'labor' },
        { id: 'service_call', description: 'Service Dispatch Fee', unitPrice: 75, category: 'labor' },
    ]},
    { group: 'Cabling & Wiring (Taxable)', items: [
        { id: 'cat6_plenum', description: 'CAT6 Plenum Cable (1000ft)', unitPrice: 450, category: 'material' },
        { id: 'cat6_riser', description: 'CAT6 Riser Cable (1000ft)', unitPrice: 320, category: 'material' },
        { id: 'fiber_patch', description: 'LC-LC Duplex Fiber Patch (3m)', unitPrice: 24, category: 'material' },
    ]},
    { group: 'Network & Infrastructure (Taxable)', items: [
        { id: 'poe_8', description: '8-Port Managed PoE Switch', unitPrice: 195, category: 'material' },
        { id: 'ap_ac', description: 'Enterprise Wireless Access Point', unitPrice: 245, category: 'material' },
        { id: 'rack_6u', description: '6U Wall Mount Rack Enclosure', unitPrice: 180, category: 'material' },
    ]}
];

export function InvoiceEditor({ isOpen, setIsOpen, invoice, clients, projects, workOrders, onSave }: InvoiceEditorProps) {
    const [invoiceData, setInvoiceData] = useState<Partial<Invoice>>({});

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
                    lineItems: [{ ...defaultLineItem, id: `li-${Date.now()}` }],
                    status: 'draft',
                    isAfterHours: false,
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
                update.workOrderId = undefined;
            } else if (value.startsWith('wo-')) {
                update.workOrderId = value;
                update.projectId = undefined;
            } else {
                 update.workOrderId = undefined;
                 update.projectId = undefined;
            }
        } else {
            update = { [name]: value };
        }

        setInvoiceData(prev => ({ ...prev, ...update }));
    };

    const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
        const updatedLineItems = [...(invoiceData.lineItems || [])];
        (updatedLineItems[index] as any)[field] = value;
        setInvoiceData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const handlePremadeItemSelect = (index: number, itemId: string) => {
        const allItems = premadeLineItems.flatMap(g => g.items);
        const premade = allItems.find(p => p.id === itemId);
        if (!premade) return;

        const updatedLineItems = [...(invoiceData.lineItems || [])];
        updatedLineItems[index] = {
            ...updatedLineItems[index],
            description: premade.description,
            unitPrice: premade.unitPrice,
            category: premade.category as 'labor' | 'material',
        };
        setInvoiceData(prev => ({ ...prev, lineItems: updatedLineItems }));
    };

    const addLineItem = () => {
        const newLineItems = [...(invoiceData.lineItems || []), { ...defaultLineItem, id: `li-${Date.now()}` }];
        setInvoiceData(prev => ({ ...prev, lineItems: newLineItems }));
    };

    const removeLineItem = (index: number) => {
        const newLineItems = [...(invoiceData.lineItems || [])];
        newLineItems.splice(index, 1);
        setInvoiceData(prev => ({ ...prev, lineItems: newLineItems }));
    };

    const hasLabor = useMemo(() => {
        return (invoiceData.lineItems || []).some(item => item.category === 'labor');
    }, [invoiceData.lineItems]);

    // Financial Calculation Protocol
    const { subtotal, laborSubtotal, materialsSubtotal, tax, total } = useMemo(() => {
        const items = invoiceData.lineItems || [];
        const isAH = !!invoiceData.isAfterHours;

        let labor = 0;
        let materials = 0;

        items.forEach(item => {
            const baseTotal = item.quantity * item.unitPrice;
            if (item.category === 'labor') {
                labor += isAH ? baseTotal * 1.5 : baseTotal;
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
    }, [invoiceData.lineItems, invoiceData.isAfterHours]);

    const handleSave = () => {
        if (!invoiceData.clientId) {
            alert('Please select a client.');
            return;
        }
        const finalInvoice: Invoice = {
            ...invoiceData,
            subtotal,
            tax,
            total,
        } as Invoice;

        onSave(finalInvoice);
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-4xl w-full bg-bg-elevated border-border-default overflow-y-auto">
                <SheetHeader className="pb-4 border-b border-border-sub">
                    <SheetTitle className="flex items-center gap-2 text-lg uppercase font-bold tracking-widest text-left">
                        <FileText size={20} className="text-brand-red"/>
                        {invoice ? 'Modify Invoice Registry' : 'Initialize New Invoice'}
                    </SheetTitle>
                    <SheetDescription className="text-xs uppercase font-bold text-text-muted tracking-widest text-left">
                        {invoice ? `Audit of Registry #${invoice.invoiceNumber}` : 'Populate parameters for client settlement.'}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="py-6 space-y-8">
                    <div className="p-4 rounded-lg border border-border-sub bg-bg-primary/50 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                             <div className="space-y-2 text-left">
                                <Label htmlFor="clientId" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Client Entity</Label>
                                <Select value={invoiceData.clientId} onValueChange={(val) => handleSelectChange('clientId', val)}>
                                    <SelectTrigger id="clientId" className="h-10 bg-bg-secondary"><SelectValue placeholder="Select target client..." /></SelectTrigger>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.clientCompany || c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label htmlFor="relatedId" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Reference Object (Proj/WO)</Label>
                                <Select value={invoiceData.projectId || invoiceData.workOrderId} onValueChange={(val) => handleSelectChange('relatedId', val)}>
                                    <SelectTrigger id="relatedId" className="h-10 bg-bg-secondary"><SelectValue placeholder="Link to existing mission..." /></SelectTrigger>
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
                                <Label htmlFor="invoiceNumber" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Invoice Identifier</Label>
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

                    {/* After Hours Protocol Toggle */}
                    <div className={cn(
                        "p-4 rounded-xl border flex items-center justify-between transition-all",
                        invoiceData.isAfterHours ? "bg-brand-red-dim border-brand-red shadow-lg" : "bg-bg-secondary border-border-sub"
                    )}>
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-2.5 rounded-lg border",
                                invoiceData.isAfterHours ? "bg-brand-red text-white" : "bg-bg-primary text-text-muted border-border-sub"
                            )}>
                                <Clock size={20} />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold uppercase tracking-wider text-text-primary">After Hours Protocol (1.5x Labor)</p>
                                <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                                    {hasLabor ? "Applies multiplier to all labor line items." : "Protocol Locked: Add labor items to enable."}
                                </p>
                            </div>
                        </div>
                        <Switch 
                            disabled={!hasLabor}
                            checked={!!invoiceData.isAfterHours}
                            onCheckedChange={(val) => setInvoiceData(prev => ({ ...prev, isAfterHours: val }))}
                        />
                    </div>
                    
                    <div className="space-y-3">
                         <div className="flex items-center justify-between px-1">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Line Itemized Ledger</h3>
                            <span className="text-[9px] font-mono text-text-muted">{invoiceData.lineItems?.length || 0} Entries</span>
                         </div>
                        <div className="space-y-2">
                            <div className="grid grid-cols-[1.5fr,2fr,80px,80px,120px,40px] gap-2 items-center text-[9px] font-black uppercase tracking-widest text-text-muted px-2">
                                <span>Type</span>
                                <span>Description / Tech Spec</span>
                                <span className="text-center">QTY</span>
                                <span className="text-center">Category</span>
                                <span className="text-center">Unit ($)</span>
                            </div>
                            {invoiceData.lineItems?.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-[1.5fr,2fr,80px,80px,120px,40px] gap-2 items-center p-2 rounded-lg border border-border-sub bg-bg-primary">
                                    <Select onValueChange={(val) => handlePremadeItemSelect(index, val)}>
                                        <SelectTrigger className="h-8 bg-bg-secondary text-[10px] uppercase font-bold"><SelectValue placeholder="Select Item..."/></SelectTrigger>
                                        <SelectContent>
                                            {premadeLineItems.map(group => (
                                                <SelectGroup key={group.group}>
                                                    <SelectLabel className="text-[8px] font-black uppercase text-brand-red tracking-widest px-2 py-1.5">{group.group}</SelectLabel>
                                                    {group.items.map(pi => (
                                                        <SelectItem key={pi.id} value={pi.id} className="text-[10px] uppercase font-bold">{pi.description}</SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input placeholder="Service description..." value={item.description} onChange={e => handleLineItemChange(index, 'description', e.target.value)} className="h-8 text-xs bg-bg-secondary" />
                                    <Input type="number" placeholder="0" value={item.quantity} onChange={e => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-bg-secondary text-center" />
                                    <div className="flex justify-center">
                                        <Badge variant={item.category === 'labor' ? 'active' : 'onhold'} className="text-[8px] h-5 uppercase">
                                            {item.category}
                                        </Badge>
                                    </div>
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input type="number" placeholder="0.00" value={item.unitPrice} onChange={e => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-bg-secondary text-center font-mono pl-6" />
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red" onClick={() => removeLineItem(index)}><Trash2 size={14}/></Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="dashed" size="sm" className="w-full mt-2 h-10 border-brand-red/20 text-brand-red hover:bg-brand-red/5" onClick={addLineItem}><Plus size={16} className="mr-2"/> Add Custom Line Item</Button>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-4">
                         <div className="space-y-2 text-left">
                            <Label htmlFor="notes" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Internal / Client Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Terms and conditions, wiring standards, or payment protocol..." value={invoiceData.notes || ''} onChange={handleInputChange} className="min-h-[150px] bg-bg-primary text-xs leading-relaxed"/>
                        </div>
                        <div className="p-6 rounded-lg bg-bg-secondary border border-border-sub space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                <span className="text-text-muted">Labor Subtotal (Tax Exempt)</span>
                                <span className="font-mono text-text-primary">${laborSubtotal.toFixed(2)}</span>
                            </div>
                            {invoiceData.isAfterHours && (
                                <div className="flex justify-between items-center text-[9px] font-black uppercase text-brand-red bg-brand-red-dim/50 px-2 py-1 rounded">
                                    <span>After Hours Multiplier Applied</span>
                                    <span>1.5X ACTIVE</span>
                                </div>
                            )}
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                <span className="text-text-muted">Materials Subtotal</span>
                                <span className="font-mono text-text-primary">${materialsSubtotal.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-accent-gold">
                                <span className="flex items-center gap-1.5"><Coins size={10}/> Regional Tax (8% on Materials)</span>
                                <span className="font-mono">${tax.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center border-t border-dashed border-border-sub pt-4 mt-4">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-text-primary">Total Settlement</span>
                                <span className="text-2xl font-mono font-bold text-text-green">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center pt-6 border-t border-border-sub mt-4 sticky bottom-0 bg-bg-elevated py-4">
                    <div>
                        <Select value={invoiceData.status} onValueChange={(val) => handleSelectChange('status', val)}>
                            <SelectTrigger className="w-[160px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest"><SelectValue placeholder="Set Registry Status" /></SelectTrigger>
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
                        <Button onClick={handleSave} className="h-10 px-12 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover">Commit Registry Entry</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}