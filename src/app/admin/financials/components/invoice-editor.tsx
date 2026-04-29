
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Invoice, InvoiceLineItem, Technician, Project, WorkOrder } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from '@/components/ui/select';
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
    { id: 'labor_std', description: 'Standard Labor', unitPrice: 95 },
    { id: 'labor_ot', description: 'Overtime Labor', unitPrice: 145 },
    { id: 'labor_crit', description: 'Critical/Emergency Labor', unitPrice: 195 },
    { id: 'service_call', description: 'Standard Service Call Fee', unitPrice: 75 },
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
            update.clientName = client?.name || '';
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
        const premade = premadeLineItems.find(p => p.id === itemId);
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
            <SheetContent className="sm:max-w-4xl w-full">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <FileText size={20} className="text-brand-red"/>
                        {invoice ? 'Edit Invoice' : 'Create New Invoice'}
                    </SheetTitle>
                    <SheetDescription>
                        {invoice ? `Editing Invoice #${invoice.invoiceNumber}` : 'Fill out the details to create a new invoice.'}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="py-6 space-y-6 max-h-[calc(100vh-150px)] overflow-y-auto pr-4">
                    {/* Header Fields */}
                    <div className="p-4 rounded-lg border bg-bg-primary">
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="clientId">Client</Label>
                                <Select value={invoiceData.clientId} onValueChange={(val) => handleSelectChange('clientId', val)}>
                                    <SelectTrigger id="clientId"><SelectValue placeholder="Select a client" /></SelectTrigger>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.clientCompany})</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="relatedId">Related Project / Work Order</Label>
                                <Select value={invoiceData.projectId || invoiceData.workOrderId} onValueChange={(val) => handleSelectChange('relatedId', val)}>
                                    <SelectTrigger id="relatedId"><SelectValue placeholder="Optional" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <Label className="px-2 py-1.5 text-xs font-semibold">Projects</Label>
                                            {projects.map(p => <SelectItem key={p.id} value={p.id}><div className="flex items-center gap-2"><FolderKanban size={14}/> {p.name}</div></SelectItem>)}
                                        </SelectGroup>
                                         <SelectGroup>
                                            <Label className="px-2 py-1.5 text-xs font-semibold">Work Orders</Label>
                                            {workOrders.map(wo => <SelectItem key={wo.id} value={wo.id}><div className="flex items-center gap-2"><Wrench size={14}/> {wo.description}</div></SelectItem>)}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                         <div className="grid grid-cols-3 gap-4 mt-4">
                             <div className="space-y-2">
                                <Label htmlFor="invoiceNumber">Invoice #</Label>
                                <Input id="invoiceNumber" name="invoiceNumber" value={invoiceData.invoiceNumber || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="issueDate">Issue Date</Label>
                                <Input id="issueDate" name="issueDate" type="date" value={invoiceData.issueDate || ''} onChange={handleInputChange} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="dueDate">Due Date</Label>
                                <Input id="dueDate" name="dueDate" type="date" value={invoiceData.dueDate || ''} onChange={handleInputChange} />
                            </div>
                         </div>
                    </div>
                    
                    {/* Line Items */}
                    <div className="p-4 rounded-lg border bg-bg-primary">
                         <Label className="font-bold text-text-primary">Line Items</Label>
                        <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-[1.5fr,2fr,100px,120px,40px] gap-2 items-center text-xs font-semibold text-text-muted px-1">
                                <span>Common Items</span>
                                <span>Description</span>
                                <span>Quantity</span>
                                <span>Unit Price</span>
                            </div>
                            {invoiceData.lineItems?.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-[1.5fr,2fr,100px,120px,40px] gap-2 items-center">
                                    <Select onValueChange={(val) => handlePremadeItemSelect(index, val)}>
                                        <SelectTrigger><SelectValue placeholder="Select item..."/></SelectTrigger>
                                        <SelectContent>
                                            {premadeLineItems.map(pi => (
                                                <SelectItem key={pi.id} value={pi.id}>{pi.description}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input placeholder="Service or material description" value={item.description} onChange={e => handleLineItemChange(index, 'description', e.target.value)} />
                                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={e => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} />
                                    <Input type="number" placeholder="Unit Price" value={item.unitPrice} onChange={e => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)} />
                                    <Button variant="ghost" size="icon" onClick={() => removeLineItem(index)}><Trash2 className="h-4 w-4 text-text-muted"/></Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" className="mt-4" onClick={addLineItem}><Plus size={14} className="mr-2"/> Add Custom Line Item</Button>
                    </div>

                    {/* Totals & Notes */}
                    <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <Label htmlFor="notes">Notes for Client</Label>
                            <Textarea id="notes" name="notes" placeholder="e.g., Terms and Conditions, payment instructions" value={invoiceData.notes || ''} onChange={handleInputChange}/>
                        </div>
                        <div className="p-4 rounded-lg border bg-bg-primary space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Subtotal</span>
                                <span className="font-mono text-text-primary">${subtotal.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Tax (8%)</span>
                                <span className="font-mono text-text-primary">${tax.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between text-lg font-bold border-t border-dashed border-border-default pt-2 mt-2">
                                <span className="text-text-primary">Total</span>
                                <span className="font-mono text-text-green">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t">
                    <div>
                        <Select value={invoiceData.status} onValueChange={(val) => handleSelectChange('status', val)}>
                            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Set Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="void">Void</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save Invoice</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

    