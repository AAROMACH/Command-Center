'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import type { Asset, AssetCategory, Technician } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Package, Plus, Search, Car, Wrench, Laptop, Archive, Shield,
    User, MapPin, Calendar, AlertTriangle, ChevronRight, X, Edit2, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInDays } from 'date-fns';

const CATEGORY_META: Record<AssetCategory | 'all', { label: string; icon: React.ElementType; sub: string[] }> = {
    all: { label: 'All Assets', icon: Package, sub: [] },
    vehicle: { label: 'Vehicles', icon: Car, sub: ['Company Vehicle', 'Van', 'Truck', 'Trailer'] },
    tool: { label: 'Tools', icon: Wrench, sub: ['Hand Tool', 'Power Tool', 'Specialty Equipment', 'Calibration Tool'] },
    electronic: { label: 'Electronics', icon: Laptop, sub: ['Tablet', 'Phone', 'Laptop', 'Scanner', 'Hotspot'] },
    inventory: { label: 'Inventory', icon: Archive, sub: ['Consumable', 'Cable', 'Fiber', 'Connector', 'Camera', 'Networking Equipment'] },
    safety: { label: 'Safety', icon: Shield, sub: ['PPE', 'Harness', 'First Aid', 'Safety Gear'] },
};

const CONDITION_COLORS: Record<string, string> = {
    excellent: 'text-text-green border-text-green/30 bg-text-green/10',
    good: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    fair: 'text-text-amber border-text-amber/30 bg-text-amber/10',
    poor: 'text-text-red border-text-red/30 bg-text-red/10',
    'out-of-service': 'text-text-muted border-border-sub bg-bg-tertiary',
};

const STATUS_VARIANT: Record<string, any> = {
    available: 'active',
    assigned: 'scheduled',
    maintenance: 'onhold',
    retired: 'completed',
};

const emptyForm = {
    name: '', category: '' as AssetCategory | '', subCategory: '', condition: '' as Asset['condition'] | '',
    status: 'available' as Asset['status'], serialNumber: '', vin: '', licensePlate: '',
    vendor: '', purchaseDate: '', purchasePrice: '', warrantyExpiry: '',
    lastMaintenanceDate: '', nextMaintenanceDate: '', assignedUserId: '', notes: '',
};

export default function AssetsPage() {
    const { toast } = useToast();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [activeTab, setActiveTab] = useState<AssetCategory | 'all'>('all');
    const [search, setSearch] = useState('');
    const [conditionFilter, setConditionFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        const unsubA = onSnapshot(collection(db, 'assets'), snap => {
            setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id } as Asset)));
        });
        const unsubT = onSnapshot(collection(db, 'users'), snap => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
                .filter(t => !t.roles?.includes('client')));
        });
        return () => { unsubA(); unsubT(); };
    }, []);

    const filtered = useMemo(() => {
        return assets.filter(a => {
            if (activeTab !== 'all' && a.category !== activeTab) return false;
            if (conditionFilter !== 'all' && a.condition !== conditionFilter) return false;
            if (statusFilter !== 'all' && a.status !== statusFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                return a.name.toLowerCase().includes(q) ||
                    a.serialNumber?.toLowerCase().includes(q) ||
                    a.vin?.toLowerCase().includes(q) ||
                    a.assignedUserName?.toLowerCase().includes(q);
            }
            return true;
        });
    }, [assets, activeTab, conditionFilter, statusFilter, search]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: assets.length };
        assets.forEach(a => { c[a.category] = (c[a.category] || 0) + 1; });
        return c;
    }, [assets]);

    const handleSave = async () => {
        if (!form.name || !form.category || !form.condition) {
            toast({ variant: 'destructive', title: 'Required fields missing', description: 'Name, category, and condition are required.' });
            return;
        }
        setSaving(true);
        try {
            const tech = technicians.find(t => t.id === form.assignedUserId);
            const payload: Omit<Asset, 'id'> = {
                name: form.name,
                category: form.category as AssetCategory,
                subCategory: form.subCategory || undefined,
                condition: form.condition as Asset['condition'],
                status: form.assignedUserId ? 'assigned' : form.status as Asset['status'],
                assignedUserId: form.assignedUserId || undefined,
                assignedUserName: tech?.name || undefined,
                serialNumber: form.serialNumber || undefined,
                vin: form.vin || undefined,
                licensePlate: form.licensePlate || undefined,
                vendor: form.vendor || undefined,
                purchaseDate: form.purchaseDate || undefined,
                purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
                warrantyExpiry: form.warrantyExpiry || undefined,
                lastMaintenanceDate: form.lastMaintenanceDate || undefined,
                nextMaintenanceDate: form.nextMaintenanceDate || undefined,
                notes: form.notes || undefined,
                createdAt: new Date().toISOString(),
            };
            if (editing && selectedAsset) {
                await updateDoc(doc(db, 'assets', selectedAsset.id), payload);
                toast({ title: 'Asset updated' });
            } else {
                await addDoc(collection(db, 'assets'), payload);
                toast({ title: 'Asset added', description: `${form.name} has been recorded.` });
            }
            setForm({ ...emptyForm });
            setIsAddOpen(false);
            setSelectedAsset(null);
            setEditing(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to save asset', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (asset: Asset) => {
        setForm({
            name: asset.name,
            category: asset.category,
            subCategory: asset.subCategory || '',
            condition: asset.condition,
            status: asset.status,
            serialNumber: asset.serialNumber || '',
            vin: asset.vin || '',
            licensePlate: asset.licensePlate || '',
            vendor: asset.vendor || '',
            purchaseDate: asset.purchaseDate || '',
            purchasePrice: asset.purchasePrice?.toString() || '',
            warrantyExpiry: asset.warrantyExpiry || '',
            lastMaintenanceDate: asset.lastMaintenanceDate || '',
            nextMaintenanceDate: asset.nextMaintenanceDate || '',
            assignedUserId: asset.assignedUserId || '',
            notes: asset.notes || '',
        });
        setEditing(true);
        setIsAddOpen(true);
    };

    const maintenanceDue = (asset: Asset) => {
        if (!asset.nextMaintenanceDate) return false;
        try { return differenceInDays(parseISO(asset.nextMaintenanceDate), new Date()) <= 14; }
        catch { return false; }
    };

    const warrantyNearExpiry = (asset: Asset) => {
        if (!asset.warrantyExpiry) return false;
        try { return differenceInDays(parseISO(asset.warrantyExpiry), new Date()) <= 30; }
        catch { return false; }
    };

    const subCategories = form.category ? CATEGORY_META[form.category as AssetCategory]?.sub ?? [] : [];

    return (
        <div className="space-y-5">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Package size={12} />
                        Resource Management
                    </p>
                    <h1 className="page-title">Assets</h1>
                    <p className="page-subtitle">Track vehicles, tools, electronics, inventory, and safety equipment.</p>
                </div>
                <div className="page-header-right">
                    <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={() => { setEditing(false); setForm({ ...emptyForm }); setIsAddOpen(true); }}>
                        <Plus size={12} className="mr-1.5" /> Add Asset
                    </Button>
                </div>
            </header>

            {/* Category tabs */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AssetCategory | 'all')} className="w-full">
                <div className="flex justify-between items-center gap-4 mb-5">
                    <TabsList className="tabs border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-6">
                        {(Object.entries(CATEGORY_META) as [AssetCategory | 'all', typeof CATEGORY_META['all']][]).map(([key, meta]) => (
                            <TabsTrigger key={key} value={key} className="tab-trigger-activity flex items-center gap-2">
                                <meta.icon size={11} />
                                {meta.label}
                                {counts[key] > 0 && <span className="text-[8px] font-bold text-text-muted">({counts[key]})</span>}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* Filter bar */}
                <div className="flex flex-wrap gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl mb-5">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                            placeholder="Search by name, serial, VIN, assigned user..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={conditionFilter} onValueChange={setConditionFilter}>
                        <SelectTrigger className="h-9 w-[140px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                            <SelectValue placeholder="Condition" />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                            {['all', 'excellent', 'good', 'fair', 'poor', 'out-of-service'].map(v => (
                                <SelectItem key={v} value={v} className="text-[10px] font-bold uppercase">{v === 'all' ? 'All Conditions' : v}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-[130px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                            {['all', 'available', 'assigned', 'maintenance', 'retired'].map(v => (
                                <SelectItem key={v} value={v} className="text-[10px] font-bold uppercase">{v === 'all' ? 'All Statuses' : v}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Asset grid — shared across all tabs */}
                {(Object.keys(CATEGORY_META) as (AssetCategory | 'all')[]).map(tab => (
                    <TabsContent key={tab} value={tab} className="m-0">
                        {filtered.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                                <Package size={28} className="text-text-muted mx-auto mb-3" />
                                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                                    {search || conditionFilter !== 'all' || statusFilter !== 'all' ? 'No assets match your filters' : 'No assets tracked yet'}
                                </p>
                                {!search && conditionFilter === 'all' && statusFilter === 'all' && (
                                    <Button size="sm" variant="outline" className="mt-4 text-[10px] font-black uppercase" onClick={() => { setEditing(false); setForm({ ...emptyForm }); setIsAddOpen(true); }}>
                                        <Plus size={11} className="mr-1.5" /> Add First Asset
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filtered.map(asset => {
                                    const CatIcon = CATEGORY_META[asset.category]?.icon || Package;
                                    const needsMaint = maintenanceDue(asset);
                                    const warrantyWarn = warrantyNearExpiry(asset);
                                    const assignedTech = technicians.find(t => t.id === asset.assignedUserId);
                                    return (
                                        <div key={asset.id}
                                            onClick={() => setSelectedAsset(asset)}
                                            className="rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red hover:bg-bg-tertiary transition-all cursor-pointer group overflow-hidden"
                                        >
                                            <div className="bg-bg-tertiary/50 border-b border-border-sub px-4 py-2.5 flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <CatIcon size={12} className="text-brand-red shrink-0" />
                                                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">{CATEGORY_META[asset.category]?.label}</span>
                                                    {asset.subCategory && <span className="text-[8px] text-text-muted">· {asset.subCategory}</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {needsMaint && <span title="Maintenance due soon"><AlertTriangle size={11} className="text-text-amber" /></span>}
                                                    {warrantyWarn && <span title="Warranty expiring soon"><AlertTriangle size={11} className="text-text-red" /></span>}
                                                    <Badge variant={STATUS_VARIANT[asset.status] || 'onhold'} className="text-[7px] uppercase h-4">{asset.status}</Badge>
                                                </div>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <div>
                                                    <p className="text-[14px] font-black uppercase tracking-tight text-text-primary truncate group-hover:text-brand-red transition-colors">{asset.name}</p>
                                                    {asset.serialNumber && <p className="text-[9px] font-mono text-text-muted mt-0.5">S/N: {asset.serialNumber}</p>}
                                                    {asset.vin && <p className="text-[9px] font-mono text-text-muted">VIN: {asset.vin}</p>}
                                                </div>
                                                <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-bold uppercase", CONDITION_COLORS[asset.condition])}>
                                                    <CheckCircle size={9} />
                                                    {asset.condition}
                                                </div>
                                                {assignedTech ? (
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6 border border-border-sub shrink-0">
                                                            <AvatarImage src={assignedTech.avatarUrl} />
                                                            <AvatarFallback className="text-[8px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <p className="text-[10px] font-bold text-text-secondary uppercase truncate">{assignedTech.name}</p>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] text-text-muted uppercase">Unassigned</p>
                                                )}
                                                {asset.nextMaintenanceDate && (
                                                    <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
                                                        <Calendar size={9} className={needsMaint ? 'text-text-amber' : ''} />
                                                        Next maintenance: {asset.nextMaintenanceDate}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="bg-bg-tertiary/20 border-t border-border-sub px-4 py-2 flex items-center justify-between">
                                                <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">View Details</p>
                                                <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>

            {/* Asset Detail Dialog */}
            <Dialog open={!!selectedAsset && !isAddOpen} onOpenChange={open => !open && setSelectedAsset(null)}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg">
                    {selectedAsset && (() => {
                        const CatIcon = CATEGORY_META[selectedAsset.category]?.icon || Package;
                        const assignedTech = technicians.find(t => t.id === selectedAsset.assignedUserId);
                        const fields: [string, string | number | undefined][] = [
                            ['Serial Number', selectedAsset.serialNumber],
                            ['VIN', selectedAsset.vin],
                            ['License Plate', selectedAsset.licensePlate],
                            ['Vendor', selectedAsset.vendor],
                            ['Purchase Date', selectedAsset.purchaseDate],
                            ['Purchase Price', selectedAsset.purchasePrice ? `$${selectedAsset.purchasePrice}` : undefined],
                            ['Warranty Expiry', selectedAsset.warrantyExpiry],
                            ['Last Maintenance', selectedAsset.lastMaintenanceDate],
                            ['Next Maintenance', selectedAsset.nextMaintenanceDate],
                            ['Mileage', selectedAsset.mileage ? `${selectedAsset.mileage.toLocaleString()} mi` : undefined],
                        ];
                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center shrink-0">
                                                <CatIcon size={16} className="text-brand-red" />
                                            </div>
                                            <div>
                                                <DialogTitle className="text-[14px] font-black uppercase">{selectedAsset.name}</DialogTitle>
                                                <p className="text-[9px] text-text-muted uppercase">{CATEGORY_META[selectedAsset.category]?.label}{selectedAsset.subCategory ? ` · ${selectedAsset.subCategory}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <Badge variant={STATUS_VARIANT[selectedAsset.status] || 'onhold'} className="text-[7px] uppercase h-5">{selectedAsset.status}</Badge>
                                            <span className={cn("inline-flex items-center px-2 h-5 rounded text-[7px] font-bold uppercase border", CONDITION_COLORS[selectedAsset.condition])}>{selectedAsset.condition}</span>
                                        </div>
                                    </div>
                                </DialogHeader>
                                <div className="space-y-4 py-1">
                                    {assignedTech && (
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                            <Avatar className="h-8 w-8 border border-border-sub">
                                                <AvatarImage src={assignedTech.avatarUrl} />
                                                <AvatarFallback className="text-[9px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-[10px] font-bold text-text-primary uppercase">{assignedTech.name}</p>
                                                <p className="text-[8px] text-text-muted uppercase">Assigned</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        {fields.filter(([, v]) => v !== undefined).map(([label, value]) => (
                                            <div key={label} className="p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{label}</p>
                                                <p className="text-[10px] font-bold text-text-primary mt-0.5">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {selectedAsset.notes && (
                                        <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Notes</p>
                                            <p className="text-[10px] text-text-secondary">{selectedAsset.notes}</p>
                                        </div>
                                    )}
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedAsset(null)} className="text-[10px] font-black uppercase">Close</Button>
                                    <Button size="sm" onClick={() => { openEdit(selectedAsset); setSelectedAsset(null); }} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                                        <Edit2 size={11} className="mr-1.5" /> Edit Asset
                                    </Button>
                                </DialogFooter>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Add / Edit Asset Dialog */}
            <Dialog open={isAddOpen} onOpenChange={open => { if (!open) { setIsAddOpen(false); setEditing(false); setForm({ ...emptyForm }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest">{editing ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Asset Name *</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Ford Transit 2022" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Category *</Label>
                                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as AssetCategory, subCategory: '' }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(['vehicle', 'tool', 'electronic', 'inventory', 'safety'] as AssetCategory[]).map(c => (
                                            <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">{CATEGORY_META[c].label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Sub-Category</Label>
                                <Select value={form.subCategory} onValueChange={v => setForm(f => ({ ...f, subCategory: v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase" disabled={!form.category}>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {subCategories.map(s => (
                                            <SelectItem key={s} value={s} className="text-[10px] font-bold uppercase">{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Condition *</Label>
                                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v as Asset['condition'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Select condition" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(['excellent', 'good', 'fair', 'poor', 'out-of-service'] as const).map(c => (
                                            <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Assign To</Label>
                                <Select value={form.assignedUserId} onValueChange={v => setForm(f => ({ ...f, assignedUserId: v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="" className="text-[10px] font-bold uppercase">Unassigned</SelectItem>
                                        {technicians.map(t => (
                                            <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Serial Number</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="S/N" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Vendor</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Supplier name" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                            </div>
                        </div>
                        {form.category === 'vehicle' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">VIN</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Vehicle ID number" value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">License Plate</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="ABC-1234" value={form.licensePlate} onChange={e => setForm(f => ({ ...f, licensePlate: e.target.value }))} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Purchase Date</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Purchase Price ($)</Label>
                                <Input type="number" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Warranty Expiry</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={form.warrantyExpiry} onChange={e => setForm(f => ({ ...f, warrantyExpiry: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Next Maintenance</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={form.nextMaintenanceDate} onChange={e => setForm(f => ({ ...f, nextMaintenanceDate: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Notes</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => { setIsAddOpen(false); setEditing(false); setForm({ ...emptyForm }); }} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Asset'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .tab-trigger-activity {
                    @apply px-0 pb-4 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}
