
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Invoice, InvoiceLineItem, Technician, Project, WorkOrder } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Trash2, Plus, FileText, Wrench, FolderKanban } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type InvoiceEditorProps = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
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
};

const premadeLineItems = [
    { group: 'Labor & Services', items: [
        { id: 'labor_std', description: 'Standard Labor ($95/hr)', unitPrice: 95 },
        { id: 'labor_ot', description: 'Overtime Labor ($145/hr)', unitPrice: 145 },
        { id: 'labor_crit', description: 'Emergency Labor ($195/hr)', unitPrice: 195 },
        { id: 'service_call', description: 'Service Call Fee', unitPrice: 75 },
    ]},
    { group: 'Cabling & Wiring', items: [
        { id: 'cat6_plenum', description: 'CAT6 Plenum Cable (1000ft)', unitPrice: 450 },
        { id: 'cat6_riser', description: 'CAT6 Riser Cable (1000ft)', unitPrice: 320 },
        { id: 'fiber_patch', description: 'LC-LC Duplex Fiber Patch (3m)', unitPrice: 24 },
    ]},
    { group: 'Network & Infrastructure', items: [
        { id: 'poe_8', description: '8-Port Managed PoE Switch', unitPrice: 195 },
        { id: 'ap_ac', description: 'Enterprise Wireless Access Point', unitPrice: 245 },
        { id: 'rack_6u', description: '6U Wall Mount Rack Enclosure', unitPrice: 180 },
        { id: 'rack_shelf', description: '1U Cantilever Rack Shelf', unitPrice: 35 },
        { id: 'patch_24', description: '24-Port Patch Panel', unitPrice: 85 },
        { id: 'patch_48', description: '48-Port Patch Panel', unitPrice: 155 },
    ]},
    { group: 'Terminations & Consumables', items: [
        { id: 'cat6_keystone', description: 'CAT6 Shielded Keystone Jack', unitPrice: 7.50 },
        { id: 'rj45_pack', description: 'RJ45 Connectors (Pack of 50)', unitPrice: 25 },
        { id: 'wall_plate', description: 'Single Gang Wall Plate', unitPrice: 1.50 },
        { id: 'velcro', description: 'Velcro Cable Ties (Roll)', unitPrice: 15 },
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

    const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
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

    const { subtotal, tax, total } = useMemo(() => {
        const sub = invoiceData.lineItems?.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0) || 0;
        const taxRate = 0.08; // 8% tax
        const taxAmount = sub * taxRate;
        const totalAmount = sub + taxAmount;
        return { subtotal: sub, tax: taxAmount, total: totalAmount };
    }, [invoiceData.lineItems]);

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
                    <SheetTitle className="flex items-center gap-2 text-lg uppercase font-bold tracking-widest">
                        <FileText size={20} className="text-brand-red"/>
                        {invoice ? 'Modify Invoice Registry' : 'Initialize New Invoice'}
                    </SheetTitle>
                    <SheetDescription className="text-xs uppercase font-bold text-text-muted tracking-widest">
                        {invoice ? `Audit of Registry #${invoice.invoiceNumber}` : 'Populate parameters for client settlement.'}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="py-6 space-y-8">
                    <div className="p-4 rounded-lg border border-border-sub bg-bg-primary/50 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                             <div className="space-y-2">
                                <Label htmlFor="clientId" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Client Entity</Label>
                                <Select value={invoiceData.clientId} onValueChange={(val) => handleSelectChange('clientId', val)}>
                                    <SelectTrigger id="clientId" className="h-10 bg-bg-secondary"><SelectValue placeholder="Select target client..." /></SelectTrigger>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.clientCompany || c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
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
                             <div className="space-y-2">
                                <Label htmlFor="invoiceNumber" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Invoice Identifier</Label>
                                <Input id="invoiceNumber" name="invoiceNumber" value={invoiceData.invoiceNumber || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary font-mono text-xs uppercase font-bold" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="issueDate" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Issue Date</Label>
                                <Input id="issueDate" name="issueDate" type="date" value={invoiceData.issueDate || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary text-xs" />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="dueDate" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Due Date</Label>
                                <Input id="dueDate" name="dueDate" type="date" value={invoiceData.dueDate || ''} onChange={handleInputChange} className="h-10 bg-bg-secondary text-xs" />
                            </div>
                         </div>
                    </div>
                    
                    <div className="space-y-3">
                         <div className="flex items-center justify-between px-1">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Line Itemized Ledger</h3>
                            <span className="text-[9px] font-mono text-text-muted">{invoiceData.lineItems?.length || 0} Entries</span>
                         </div>
                        <div className="space-y-2">
                            <div className="grid grid-cols-[1.5fr,2fr,80px,120px,40px] gap-2 items-center text-[9px] font-black uppercase tracking-widest text-text-muted px-2">
                                <span>Common Materials</span>
                                <span>Description / Tech Spec</span>
                                <span className="text-center">QTY</span>
                                <span className="text-center">Unit ($)</span>
                            </div>
                            {invoiceData.lineItems?.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-[1.5fr,2fr,80px,120px,40px] gap-2 items-center p-2 rounded-lg border border-border-sub bg-bg-primary">
                                    <Select onValueChange={(val) => handlePremadeItemSelect(index, val)}>
                                        <SelectTrigger className="h-8 bg-bg-secondary text-[10px] uppercase font-bold"><SelectValue placeholder="Select Material..."/></SelectTrigger>
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
                                    <Input type="number" placeholder="0.00" value={item.unitPrice} onChange={e => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-bg-secondary text-center font-mono" />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red" onClick={() => removeLineItem(index)}><Trash2 size={14}/></Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="dashed" size="sm" className="w-full mt-2 h-10 border-brand-red/20 text-brand-red hover:bg-brand-red/5" onClick={addLineItem}><Plus size={16} className="mr-2"/> Add Custom Terminal Entry</Button>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-4">
                         <div className="space-y-2">
                            <Label htmlFor="notes" className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Internal / Client Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Terms and conditions, wiring standards, or payment protocol..." value={invoiceData.notes || ''} onChange={handleInputChange} className="min-h-[120px] bg-bg-primary text-xs leading-relaxed"/>
                        </div>
                        <div className="p-6 rounded-lg bg-bg-secondary border border-border-sub space-y-4">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                                <span className="text-text-muted">Net Subtotal</span>
                                <span className="font-mono text-text-primary">${subtotal.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                                <span className="text-text-muted">Regional Tax (8%)</span>
                                <span className="font-mono text-text-primary">${tax.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between items-center border-t border-dashed border-border-sub pt-4 mt-2">
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
