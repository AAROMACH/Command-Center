'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import type { Asset, AssetCategory, Material, AssetAssignment, Technician } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Package, Plus, Search, Car, Wrench, Laptop, Archive, Shield,
    User, MapPin, Calendar, AlertTriangle, ChevronRight, Edit2, CheckCircle,
    DollarSign, Tag, RotateCcw, XCircle, Hammer, History, ArrowRightLeft,
    ShoppingCart, Boxes, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInDays } from 'date-fns';

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_CATS: { value: AssetCategory | 'all'; label: string; icon: React.ElementType }[] = [
    { value: 'all', label: 'All', icon: Package },
    { value: 'tool', label: 'Tools', icon: Wrench },
    { value: 'electronic', label: 'Electronics', icon: Laptop },
    { value: 'safety', label: 'Safety', icon: Shield },
    { value: 'vehicle', label: 'Vehicles', icon: Car },
    { value: 'inventory', label: 'Other', icon: Archive },
];

const ASSET_CAT_SUBS: Record<AssetCategory, string[]> = {
    vehicle: ['Company Vehicle', 'Van', 'Truck', 'Trailer'],
    tool: ['Hand Tool', 'Power Tool', 'Specialty Equipment', 'Network Tester', 'Label Maker', 'Cable Tool', 'Calibration Tool'],
    electronic: ['Tablet', 'Phone', 'Laptop', 'Scanner', 'Hotspot'],
    inventory: ['Consumable', 'Cable', 'Connector', 'Camera', 'Access Point', 'Switch', 'Other'],
    safety: ['PPE', 'Harness', 'First Aid', 'Safety Gear'],
};

const MAT_CATS = ['Cable & Wire', 'Connectors & Jacks', 'Mounting Hardware', 'Networking Equipment', 'Power', 'Safety Equipment', 'Tools & Equipment', 'Cameras & Security', 'Miscellaneous'];

const UNIT_TYPES = ['each', 'box', 'pack', 'foot', 'roll', 'hour', 'set', 'bag', 'bundle'];

const ASSET_STATUSES: Asset['status'][] = ['available', 'assigned', 'checked_out', 'needs_repair', 'lost', 'retired'];

const CONDITION_COLORS: Record<string, string> = {
    excellent: 'text-text-green border-text-green/30 bg-text-green/10',
    good: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    fair: 'text-text-amber border-text-amber/30 bg-text-amber/10',
    poor: 'text-text-red border-text-red/30 bg-text-red/10',
    'out-of-service': 'text-text-muted border-border-sub bg-bg-tertiary',
};

const STATUS_COLORS: Record<string, string> = {
    available: 'text-text-green border-text-green/30 bg-text-green/10',
    assigned: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    checked_out: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
    needs_repair: 'text-text-amber border-text-amber/30 bg-text-amber/10',
    lost: 'text-text-red border-text-red/30 bg-text-red/10',
    retired: 'text-text-muted border-border-sub bg-bg-tertiary',
};

// Strips undefined/null/"" values — Firestore rejects undefined fields
function cleanPayload<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ) as Partial<T>;
}

// ─── Empty forms ──────────────────────────────────────────────────────────────

const EMPTY_ASSET_FORM = {
    name: '', category: '' as AssetCategory | '', brand: '', model: '', subCategory: '',
    condition: '' as Asset['condition'] | '', status: 'available' as Asset['status'],
    serialNumber: '', vin: '', licensePlate: '', vendor: '',
    purchaseDate: '', purchasePrice: '', warrantyExpiry: '',
    lastMaintenanceDate: '', nextMaintenanceDate: '',
    assignedUserId: '', currentLocation: '', notes: '',
};

const EMPTY_MAT_FORM = {
    name: '', category: '', description: '', unitType: 'each' as Material['unitType'],
    standardCost: '', billablePrice: '', markupPercentage: '',
    vendor: '', sku: '', taxable: false as boolean, status: 'active' as Material['status'], notes: '',
};

const EMPTY_ASSIGN_FORM = {
    assignedToUserId: '', expectedReturnAt: '', checkoutCondition: 'good', notes: '',
};

const EMPTY_RETURN_FORM = {
    returnCondition: 'good', notes: '',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AssetsAndMaterialsPage() {
    const { toast } = useToast();

    // Data
    const [assets, setAssets] = useState<Asset[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);

    // UI
    const [mainTab, setMainTab] = useState<'assets' | 'materials'>('assets');
    const [assetCatFilter, setAssetCatFilter] = useState<AssetCategory | 'all'>('all');
    const [matCatFilter, setMatCatFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [conditionFilter, setConditionFilter] = useState('all');
    const [matStatusFilter, setMatStatusFilter] = useState('all');

    // Selected detail
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

    // Dialogs
    const [assetFormOpen, setAssetFormOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(false);
    const [assetForm, setAssetForm] = useState({ ...EMPTY_ASSET_FORM });
    const [assetSaving, setAssetSaving] = useState(false);

    const [matFormOpen, setMatFormOpen] = useState(false);
    const [editingMat, setEditingMat] = useState(false);
    const [matForm, setMatForm] = useState({ ...EMPTY_MAT_FORM });
    const [matSaving, setMatSaving] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignForm, setAssignForm] = useState({ ...EMPTY_ASSIGN_FORM });
    const [assignSaving, setAssignSaving] = useState(false);

    const [returnOpen, setReturnOpen] = useState(false);
    const [returnForm, setReturnForm] = useState({ ...EMPTY_RETURN_FORM });
    const [returnSaving, setReturnSaving] = useState(false);

    useEffect(() => {
        const unsubA = onSnapshot(collection(db, 'assets'), snap => {
            setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id } as Asset)));
        });
        const unsubM = onSnapshot(collection(db, 'materials'), snap => {
            setMaterials(snap.docs.map(d => ({ ...d.data(), id: d.id } as Material)));
        });
        const unsubAsgn = onSnapshot(collection(db, 'assetAssignments'), snap => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as AssetAssignment)));
        });
        const unsubT = onSnapshot(collection(db, 'users'), snap => {
            setTechnicians(
                snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
                    .filter(t => !t.roles?.includes('client'))
            );
        });
        return () => { unsubA(); unsubM(); unsubAsgn(); unsubT(); };
    }, []);

    // ── Filtered views ─────────────────────────────────────────────────────

    const filteredAssets = useMemo(() => {
        const q = search.toLowerCase();
        return assets.filter(a => {
            if (assetCatFilter !== 'all' && a.category !== assetCatFilter) return false;
            if (statusFilter !== 'all' && a.status !== statusFilter) return false;
            if (conditionFilter !== 'all' && a.condition !== conditionFilter) return false;
            if (q && !(
                a.name.toLowerCase().includes(q) ||
                (a.brand || '').toLowerCase().includes(q) ||
                (a.model || '').toLowerCase().includes(q) ||
                (a.serialNumber || '').toLowerCase().includes(q) ||
                (a.assignedUserName || '').toLowerCase().includes(q)
            )) return false;
            return true;
        });
    }, [assets, assetCatFilter, statusFilter, conditionFilter, search]);

    const filteredMaterials = useMemo(() => {
        const q = search.toLowerCase();
        return materials.filter(m => {
            if (matCatFilter !== 'all' && m.category !== matCatFilter) return false;
            if (matStatusFilter !== 'all' && m.status !== matStatusFilter) return false;
            if (q && !(
                m.name.toLowerCase().includes(q) ||
                m.category.toLowerCase().includes(q) ||
                (m.sku || '').toLowerCase().includes(q) ||
                (m.vendor || '').toLowerCase().includes(q)
            )) return false;
            return true;
        });
    }, [materials, matCatFilter, matStatusFilter, search]);

    // ── Summary stats ──────────────────────────────────────────────────────

    const stats = useMemo(() => ({
        total: assets.length,
        checkedOut: assets.filter(a => a.status === 'assigned' || a.status === 'checked_out').length,
        needsRepair: assets.filter(a => a.status === 'needs_repair').length,
        lost: assets.filter(a => a.status === 'lost').length,
        activeMaterials: materials.filter(m => m.status === 'active').length,
    }), [assets, materials]);

    // ── Asset CRUD ─────────────────────────────────────────────────────────

    const openAddAsset = () => {
        setEditingAsset(false);
        setAssetForm({ ...EMPTY_ASSET_FORM });
        setAssetFormOpen(true);
    };

    const openEditAsset = (asset: Asset) => {
        setEditingAsset(true);
        setAssetForm({
            name: asset.name,
            category: asset.category,
            brand: asset.brand || '',
            model: asset.model || '',
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
            currentLocation: asset.currentLocation || '',
            notes: asset.notes || '',
        });
        setAssetFormOpen(true);
    };

    const handleSaveAsset = async () => {
        if (!assetForm.name.trim() || !assetForm.category || !assetForm.condition) {
            toast({ variant: 'destructive', title: 'Required fields missing', description: 'Name, category, and condition are required.' });
            return;
        }
        setAssetSaving(true);
        try {
            const tech = technicians.find(t => t.id === assetForm.assignedUserId);
            const base = {
                name: assetForm.name.trim(),
                category: assetForm.category as AssetCategory,
                condition: assetForm.condition as Asset['condition'],
                status: (assetForm.assignedUserId ? 'assigned' : assetForm.status) as Asset['status'],
                updatedAt: new Date().toISOString(),
                ...(assetForm.brand && { brand: assetForm.brand }),
                ...(assetForm.model && { model: assetForm.model }),
                ...(assetForm.subCategory && { subCategory: assetForm.subCategory }),
                ...(assetForm.serialNumber && { serialNumber: assetForm.serialNumber }),
                ...(assetForm.vin && { vin: assetForm.vin }),
                ...(assetForm.licensePlate && { licensePlate: assetForm.licensePlate }),
                ...(assetForm.vendor && { vendor: assetForm.vendor }),
                ...(assetForm.purchaseDate && { purchaseDate: assetForm.purchaseDate }),
                ...(assetForm.purchasePrice && { purchasePrice: Number(assetForm.purchasePrice) }),
                ...(assetForm.warrantyExpiry && { warrantyExpiry: assetForm.warrantyExpiry }),
                ...(assetForm.lastMaintenanceDate && { lastMaintenanceDate: assetForm.lastMaintenanceDate }),
                ...(assetForm.nextMaintenanceDate && { nextMaintenanceDate: assetForm.nextMaintenanceDate }),
                ...(assetForm.assignedUserId && { assignedUserId: assetForm.assignedUserId }),
                ...(tech && { assignedUserName: tech.name }),
                ...(assetForm.currentLocation && { currentLocation: assetForm.currentLocation }),
                ...(assetForm.notes && { notes: assetForm.notes }),
            };

            if (editingAsset && selectedAsset) {
                await updateDoc(doc(db, 'assets', selectedAsset.id), base);
                setSelectedAsset(prev => prev ? { ...prev, ...base } as Asset : null);
                toast({ title: 'Asset updated' });
            } else {
                await addDoc(collection(db, 'assets'), { ...base, createdAt: new Date().toISOString() });
                toast({ title: 'Asset added', description: `${assetForm.name} has been recorded.` });
            }
            setAssetFormOpen(false);
            setEditingAsset(false);
            setAssetForm({ ...EMPTY_ASSET_FORM });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to save asset', description: e.message });
        } finally {
            setAssetSaving(false);
        }
    };

    // ── Asset Actions ──────────────────────────────────────────────────────

    const handleAssign = async () => {
        if (!assignForm.assignedToUserId || !selectedAsset) return;
        setAssignSaving(true);
        try {
            const tech = technicians.find(t => t.id === assignForm.assignedToUserId);
            const now = new Date().toISOString();

            // Close any active assignment for this asset
            const activeAssignment = assignments.find(a => a.assetId === selectedAsset.id && a.status === 'active');
            if (activeAssignment) {
                await updateDoc(doc(db, 'assetAssignments', activeAssignment.id), {
                    status: 'returned', returnedAt: now, returnCondition: selectedAsset.condition,
                });
            }

            // Create new assignment
            await addDoc(collection(db, 'assetAssignments'), {
                assetId: selectedAsset.id,
                assetName: selectedAsset.name,
                assignedToUserId: assignForm.assignedToUserId,
                assignedToName: tech?.name || '',
                assignedByName: 'Admin',
                checkedOutAt: now,
                checkoutCondition: assignForm.checkoutCondition,
                status: 'active',
                ...(assignForm.expectedReturnAt && { expectedReturnAt: assignForm.expectedReturnAt }),
                ...(assignForm.notes && { notes: assignForm.notes }),
                createdAt: now,
            });

            // Update asset
            const update = {
                status: 'assigned' as Asset['status'],
                assignedUserId: assignForm.assignedToUserId,
                assignedUserName: tech?.name || '',
                checkedOutAt: now,
                updatedAt: now,
                ...(assignForm.expectedReturnAt && { expectedReturnAt: assignForm.expectedReturnAt }),
            };
            await updateDoc(doc(db, 'assets', selectedAsset.id), update);
            setSelectedAsset(prev => prev ? { ...prev, ...update } as Asset : null);

            toast({ title: 'Asset assigned', description: `${selectedAsset.name} assigned to ${tech?.name}.` });
            setAssignOpen(false);
            setAssignForm({ ...EMPTY_ASSIGN_FORM });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Assignment failed', description: e.message });
        } finally {
            setAssignSaving(false);
        }
    };

    const handleReturn = async () => {
        if (!selectedAsset) return;
        setReturnSaving(true);
        try {
            const now = new Date().toISOString();
            const activeAssignment = assignments.find(a => a.assetId === selectedAsset.id && a.status === 'active');
            if (activeAssignment) {
                await updateDoc(doc(db, 'assetAssignments', activeAssignment.id), {
                    status: 'returned', returnedAt: now,
                    returnCondition: returnForm.returnCondition,
                    ...(returnForm.notes && { notes: returnForm.notes }),
                });
            }
            const update = {
                status: 'available' as Asset['status'],
                assignedUserId: null,
                assignedUserName: null,
                checkedOutAt: null,
                expectedReturnAt: null,
                lastReturnedAt: now,
                condition: returnForm.returnCondition as Asset['condition'],
                updatedAt: now,
            };
            await updateDoc(doc(db, 'assets', selectedAsset.id), update);
            setSelectedAsset(prev => prev ? { ...prev, ...update, assignedUserId: undefined, assignedUserName: undefined, checkedOutAt: undefined, expectedReturnAt: undefined } as unknown as Asset : null);
            toast({ title: 'Asset returned', description: `${selectedAsset.name} is now available.` });
            setReturnOpen(false);
            setReturnForm({ ...EMPTY_RETURN_FORM });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Return failed', description: e.message });
        } finally {
            setReturnSaving(false);
        }
    };

    const handleStatusChange = async (asset: Asset, newStatus: Asset['status']) => {
        try {
            await updateDoc(doc(db, 'assets', asset.id), {
                status: newStatus,
                updatedAt: new Date().toISOString(),
                ...(newStatus !== 'assigned' && newStatus !== 'checked_out' ? { assignedUserId: null, assignedUserName: null } : {}),
            });
            setSelectedAsset(prev => prev?.id === asset.id ? { ...prev, status: newStatus } : prev);
            toast({ title: 'Status updated', description: `${asset.name} marked as ${newStatus.replace(/_/g, ' ')}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed', description: e.message });
        }
    };

    // ── Material CRUD ──────────────────────────────────────────────────────

    const openAddMaterial = () => {
        setEditingMat(false);
        setMatForm({ ...EMPTY_MAT_FORM });
        setMatFormOpen(true);
    };

    const openEditMaterial = (m: Material) => {
        setEditingMat(true);
        setMatForm({
            name: m.name, category: m.category, description: m.description || '',
            unitType: m.unitType, standardCost: m.standardCost.toString(),
            billablePrice: m.billablePrice.toString(),
            markupPercentage: m.markupPercentage?.toString() || '',
            vendor: m.vendor || '', sku: m.sku || '',
            taxable: m.taxable, status: m.status, notes: m.notes || '',
        });
        setMatFormOpen(true);
    };

    const handleSaveMaterial = async () => {
        if (!matForm.name.trim() || !matForm.category || !matForm.unitType) {
            toast({ variant: 'destructive', title: 'Required fields missing', description: 'Name, category, and unit type are required.' });
            return;
        }
        setMatSaving(true);
        try {
            const cost = parseFloat(matForm.standardCost) || 0;
            const price = parseFloat(matForm.billablePrice) || 0;
            const markup = matForm.markupPercentage
                ? parseFloat(matForm.markupPercentage)
                : cost > 0 ? Math.round(((price - cost) / cost) * 100) : 0;

            const base = {
                name: matForm.name.trim(),
                category: matForm.category,
                unitType: matForm.unitType,
                standardCost: cost,
                billablePrice: price,
                markupPercentage: markup,
                taxable: matForm.taxable,
                status: matForm.status,
                updatedAt: new Date().toISOString(),
                ...(matForm.description && { description: matForm.description }),
                ...(matForm.vendor && { vendor: matForm.vendor }),
                ...(matForm.sku && { sku: matForm.sku }),
                ...(matForm.notes && { notes: matForm.notes }),
            };

            if (editingMat && selectedMaterial) {
                await updateDoc(doc(db, 'materials', selectedMaterial.id), base);
                setSelectedMaterial(prev => prev ? { ...prev, ...base } as Material : null);
                toast({ title: 'Material updated' });
            } else {
                await addDoc(collection(db, 'materials'), { ...base, createdAt: new Date().toISOString() });
                toast({ title: 'Material added', description: `${matForm.name} added to price list.` });
            }
            setMatFormOpen(false);
            setEditingMat(false);
            setMatForm({ ...EMPTY_MAT_FORM });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to save material', description: e.message });
        } finally {
            setMatSaving(false);
        }
    };

    // ── Helpers ────────────────────────────────────────────────────────────

    const maintenanceDue = (a: Asset) => {
        if (!a.nextMaintenanceDate) return false;
        try { return differenceInDays(parseISO(a.nextMaintenanceDate), new Date()) <= 14; } catch { return false; }
    };

    const assetHistory = (assetId: string) =>
        assignments.filter(a => a.assetId === assetId).sort((a, b) => b.checkedOutAt.localeCompare(a.checkedOutAt));

    const tabTriggerCls = "px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[10px] font-black uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all";

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">
            {/* Header */}
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2"><Package size={12} /> Resource Management</p>
                    <h1 className="page-title">Assets & Materials</h1>
                    <p className="page-subtitle">Track reusable company assets and standard billable materials.</p>
                </div>
                <div className="page-header-right">
                    {mainTab === 'assets' ? (
                        <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={openAddAsset}>
                            <Plus size={12} className="mr-1.5" /> Add Asset
                        </Button>
                    ) : (
                        <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={openAddMaterial}>
                            <Plus size={12} className="mr-1.5" /> Add Material
                        </Button>
                    )}
                </div>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Total Assets', value: stats.total, color: 'text-text-primary', icon: Package },
                    { label: 'Checked Out', value: stats.checkedOut, color: 'text-blue-400', icon: ArrowRightLeft },
                    { label: 'Needs Repair', value: stats.needsRepair, color: 'text-text-amber', icon: Hammer },
                    { label: 'Lost / Missing', value: stats.lost, color: 'text-text-red', icon: AlertTriangle },
                    { label: 'Materials', value: stats.activeMaterials, color: 'text-text-green', icon: ShoppingCart },
                ].map(s => (
                    <div key={s.label} className="p-3 rounded-xl border border-border-sub bg-bg-secondary flex items-center gap-3">
                        <s.icon size={16} className={cn('shrink-0', s.color)} />
                        <div>
                            <p className={cn('text-[20px] font-black font-mono leading-none', s.color)}>{s.value}</p>
                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mt-0.5">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main tabs */}
            <Tabs value={mainTab} onValueChange={v => { setMainTab(v as 'assets' | 'materials'); setSearch(''); }} className="w-full">
                <TabsList className="border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 mb-5">
                    <TabsTrigger value="assets" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><Boxes size={12} /> Assets ({assets.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="materials" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><ShoppingCart size={12} /> Materials ({materials.filter(m => m.status === 'active').length})</span>
                    </TabsTrigger>
                </TabsList>

                {/* ── Assets Tab ─────────────────────────────────────────── */}
                <TabsContent value="assets" className="m-0">
                    {/* Category pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4">
                        {ASSET_CATS.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setAssetCatFilter(cat.value)}
                                className={cn('flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                    assetCatFilter === cat.value
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                )}
                            >
                                <cat.icon size={10} />
                                {cat.label}
                                <span className="opacity-70">
                                    ({cat.value === 'all' ? assets.length : assets.filter(a => a.category === cat.value).length})
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl mb-5">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                                placeholder="Search name, brand, serial, assigned to..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 w-[140px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Statuses</SelectItem>
                                {ASSET_STATUSES.map(s => (
                                    <SelectItem key={s} value={s} className="text-[10px] font-bold uppercase">{s.replace(/_/g, ' ')}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                    </div>

                    {/* Asset grid */}
                    {filteredAssets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                            <Package size={28} className="text-text-muted mx-auto mb-3" />
                            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                                {search || statusFilter !== 'all' || conditionFilter !== 'all' || assetCatFilter !== 'all'
                                    ? 'No assets match your filters'
                                    : 'No assets tracked yet'}
                            </p>
                            {!search && statusFilter === 'all' && conditionFilter === 'all' && assetCatFilter === 'all' && (
                                <Button size="sm" variant="outline" className="mt-4 text-[10px] font-black uppercase" onClick={openAddAsset}>
                                    <Plus size={11} className="mr-1.5" /> Add First Asset
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredAssets.map(asset => {
                                const CatIcon = ASSET_CATS.find(c => c.value === asset.category)?.icon || Package;
                                const needsMaint = maintenanceDue(asset);
                                const assignedTech = technicians.find(t => t.id === asset.assignedUserId);
                                return (
                                    <div
                                        key={asset.id}
                                        onClick={() => setSelectedAsset(asset)}
                                        className="rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red hover:bg-bg-tertiary transition-all cursor-pointer group overflow-hidden"
                                    >
                                        <div className="bg-bg-tertiary/50 border-b border-border-sub px-4 py-2.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <CatIcon size={12} className="text-brand-red shrink-0" />
                                                {asset.brand && <span className="text-[9px] font-bold text-text-muted uppercase truncate">{asset.brand}</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {needsMaint && <AlertTriangle size={11} className="text-text-amber" />}
                                                <span className={cn('inline-flex items-center px-2 h-4 rounded text-[7px] font-black uppercase border', STATUS_COLORS[asset.status] || STATUS_COLORS.available)}>
                                                    {asset.status.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-2.5">
                                            <div>
                                                <p className="text-[13px] font-black uppercase tracking-tight text-text-primary truncate group-hover:text-brand-red transition-colors">{asset.name}</p>
                                                {asset.model && <p className="text-[9px] text-text-muted mt-0.5">{asset.model}</p>}
                                                {asset.serialNumber && <p className="text-[9px] font-mono text-text-muted">S/N: {asset.serialNumber}</p>}
                                            </div>
                                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[8px] font-bold uppercase', CONDITION_COLORS[asset.condition])}>
                                                <CheckCircle size={8} /> {asset.condition}
                                            </span>
                                            {assignedTech ? (
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5 border border-border-sub shrink-0">
                                                        <AvatarImage src={assignedTech.avatarUrl} />
                                                        <AvatarFallback className="text-[7px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <p className="text-[9px] font-bold text-text-secondary uppercase truncate">{assignedTech.name}</p>
                                                </div>
                                            ) : (
                                                <p className="text-[8px] text-text-muted uppercase">Unassigned</p>
                                            )}
                                            {asset.currentLocation && (
                                                <p className="flex items-center gap-1 text-[9px] text-text-muted">
                                                    <MapPin size={9} />{asset.currentLocation}
                                                </p>
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

                {/* ── Materials Tab ──────────────────────────────────────── */}
                <TabsContent value="materials" className="m-0">
                    {/* Category pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4">
                        {['all', ...MAT_CATS].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setMatCatFilter(cat)}
                                className={cn('text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                    matCatFilter === cat
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                )}
                            >
                                {cat === 'all' ? `All (${materials.length})` : cat}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex gap-3 mb-5">
                        <div className="relative flex-1">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                                placeholder="Search name, SKU, vendor..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Select value={matStatusFilter} onValueChange={setMatStatusFilter}>
                            <SelectTrigger className="h-9 w-[130px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All</SelectItem>
                                <SelectItem value="active" className="text-[10px] font-bold uppercase">Active</SelectItem>
                                <SelectItem value="inactive" className="text-[10px] font-bold uppercase">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {filteredMaterials.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                            <ShoppingCart size={28} className="text-text-muted mx-auto mb-3" />
                            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                                {search || matStatusFilter !== 'all' || matCatFilter !== 'all' ? 'No materials match your filters' : 'No materials in price list yet'}
                            </p>
                            {!search && matStatusFilter === 'all' && matCatFilter === 'all' && (
                                <Button size="sm" variant="outline" className="mt-4 text-[10px] font-black uppercase" onClick={openAddMaterial}>
                                    <Plus size={11} className="mr-1.5" /> Add First Material
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border-sub overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border-sub bg-bg-secondary/50">
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Name</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Category</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Unit</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Cost</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Billable</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Markup</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">SKU</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMaterials.map(m => (
                                        <TableRow
                                            key={m.id}
                                            className="border-border-sub hover:bg-bg-secondary cursor-pointer transition-colors"
                                            onClick={() => setSelectedMaterial(m)}
                                        >
                                            <TableCell>
                                                <p className="text-[10px] font-bold text-text-primary uppercase">{m.name}</p>
                                                {m.vendor && <p className="text-[8px] text-text-muted">{m.vendor}</p>}
                                            </TableCell>
                                            <TableCell className="text-[9px] text-text-muted">{m.category}</TableCell>
                                            <TableCell>
                                                <Badge variant="scheduled" className="text-[7px] uppercase h-4">{m.unitType}</Badge>
                                            </TableCell>
                                            <TableCell className="text-[10px] font-mono text-text-muted text-right">${m.standardCost.toFixed(2)}</TableCell>
                                            <TableCell className="text-[10px] font-mono font-bold text-text-primary text-right">${m.billablePrice.toFixed(2)}</TableCell>
                                            <TableCell className="text-[9px] font-mono text-text-amber text-right">
                                                {m.markupPercentage ? `${m.markupPercentage}%` : '—'}
                                            </TableCell>
                                            <TableCell className="text-[9px] font-mono text-text-muted">{m.sku || '—'}</TableCell>
                                            <TableCell>
                                                <Badge variant={m.status === 'active' ? 'active' : 'completed'} className="text-[7px] uppercase h-4">{m.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* ── Asset Detail Dialog ──────────────────────────────────────── */}
            <Dialog open={!!selectedAsset && !assetFormOpen && !assignOpen && !returnOpen} onOpenChange={open => !open && setSelectedAsset(null)}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-2xl max-h-[90vh] overflow-y-auto">
                    {selectedAsset && (() => {
                        const CatIcon = ASSET_CATS.find(c => c.value === selectedAsset.category)?.icon || Package;
                        const assignedTech = technicians.find(t => t.id === selectedAsset.assignedUserId);
                        const history = assetHistory(selectedAsset.id);
                        const isOut = selectedAsset.status === 'assigned' || selectedAsset.status === 'checked_out';
                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center shrink-0">
                                                <CatIcon size={16} className="text-brand-red" />
                                            </div>
                                            <div>
                                                <DialogTitle className="text-[14px] font-black uppercase">{selectedAsset.name}</DialogTitle>
                                                <p className="text-[9px] text-text-muted uppercase">
                                                    {selectedAsset.brand && `${selectedAsset.brand} `}{selectedAsset.model && `${selectedAsset.model} · `}
                                                    {ASSET_CATS.find(c => c.value === selectedAsset.category)?.label}
                                                    {selectedAsset.subCategory && ` · ${selectedAsset.subCategory}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap shrink-0">
                                            <span className={cn('inline-flex items-center px-2 h-5 rounded text-[7px] font-black uppercase border', STATUS_COLORS[selectedAsset.status])}>
                                                {selectedAsset.status.replace(/_/g, ' ')}
                                            </span>
                                            <span className={cn('inline-flex items-center px-2 h-5 rounded text-[7px] font-bold uppercase border', CONDITION_COLORS[selectedAsset.condition])}>
                                                {selectedAsset.condition}
                                            </span>
                                        </div>
                                    </div>
                                </DialogHeader>

                                <div className="space-y-4 py-1">
                                    {/* Current assignment */}
                                    {assignedTech && (
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                            <Avatar className="h-8 w-8 border border-border-sub">
                                                <AvatarImage src={assignedTech.avatarUrl} />
                                                <AvatarFallback className="text-[9px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold text-text-primary uppercase">{assignedTech.name}</p>
                                                <p className="text-[8px] text-text-muted uppercase">
                                                    Assigned {selectedAsset.checkedOutAt ? format(parseISO(selectedAsset.checkedOutAt), 'MMM d, yyyy') : ''}
                                                    {selectedAsset.expectedReturnAt && ` · Expected back ${selectedAsset.expectedReturnAt}`}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Info grid */}
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            ['Serial Number', selectedAsset.serialNumber],
                                            ['VIN', selectedAsset.vin],
                                            ['License Plate', selectedAsset.licensePlate],
                                            ['Vendor', selectedAsset.vendor],
                                            ['Purchase Date', selectedAsset.purchaseDate],
                                            ['Purchase Price', selectedAsset.purchasePrice ? `$${selectedAsset.purchasePrice.toLocaleString()}` : undefined],
                                            ['Warranty Expiry', selectedAsset.warrantyExpiry],
                                            ['Next Maintenance', selectedAsset.nextMaintenanceDate],
                                            ['Location', selectedAsset.currentLocation],
                                            ['Last Returned', selectedAsset.lastReturnedAt ? format(parseISO(selectedAsset.lastReturnedAt), 'MMM d, yyyy') : undefined],
                                        ].filter(([, v]) => v).map(([label, value]) => (
                                            <div key={label as string} className="p-2 rounded-lg bg-bg-secondary border border-border-sub">
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

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-2 border-t border-border-sub pt-3">
                                        {!isOut && (
                                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setAssignOpen(true)}>
                                                <ArrowRightLeft size={10} className="mr-1.5" /> Assign / Check Out
                                            </Button>
                                        )}
                                        {isOut && (
                                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setReturnOpen(true)}>
                                                <RotateCcw size={10} className="mr-1.5" /> Return Asset
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'needs_repair' && (
                                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase text-text-amber border-text-amber/30" onClick={() => handleStatusChange(selectedAsset, 'needs_repair')}>
                                                <Hammer size={10} className="mr-1.5" /> Needs Repair
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'lost' && (
                                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase text-text-red border-text-red/30" onClick={() => handleStatusChange(selectedAsset, 'lost')}>
                                                <XCircle size={10} className="mr-1.5" /> Mark Lost
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'available' && !isOut && (
                                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase text-text-green border-text-green/30" onClick={() => handleStatusChange(selectedAsset, 'available')}>
                                                <CheckCircle size={10} className="mr-1.5" /> Mark Available
                                            </Button>
                                        )}
                                    </div>

                                    {/* Assignment history */}
                                    {history.length > 0 && (
                                        <div>
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2 mb-2">
                                                <History size={10} /> Assignment History
                                            </p>
                                            <div className="space-y-1.5">
                                                {history.map(h => (
                                                    <div key={h.id} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-sub">
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-bold text-text-primary uppercase">{h.assignedToName}</p>
                                                            <p className="text-[8px] text-text-muted">
                                                                {format(parseISO(h.checkedOutAt), 'MMM d, yyyy')}
                                                                {h.returnedAt && ` → ${format(parseISO(h.returnedAt), 'MMM d, yyyy')}`}
                                                            </p>
                                                            {h.notes && <p className="text-[8px] text-text-muted italic">{h.notes}</p>}
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                                            <Badge variant={h.status === 'active' ? 'active' : 'completed'} className="text-[6px] uppercase h-3">{h.status}</Badge>
                                                            <span className={cn('text-[7px] uppercase font-bold', CONDITION_COLORS[h.checkoutCondition]?.split(' ')[0])}>{h.checkoutCondition}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <DialogFooter className="gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedAsset(null)} className="text-[10px] font-black uppercase">Close</Button>
                                    <Button size="sm" onClick={() => { openEditAsset(selectedAsset); setSelectedAsset(null); }} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                                        <Edit2 size={11} className="mr-1.5" /> Edit
                                    </Button>
                                </DialogFooter>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* ── Assign Dialog ────────────────────────────────────────────── */}
            <Dialog open={assignOpen} onOpenChange={open => { if (!open) { setAssignOpen(false); setAssignForm({ ...EMPTY_ASSIGN_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Assign Asset</DialogTitle>
                        {selectedAsset && <p className="text-[10px] text-text-muted mt-1">{selectedAsset.name}</p>}
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Assign To *</Label>
                            <Select value={assignForm.assignedToUserId} onValueChange={v => setAssignForm(f => ({ ...f, assignedToUserId: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold uppercase">
                                    <SelectValue placeholder="Select person" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {technicians.map(t => (
                                        <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Checkout Condition</Label>
                            <Select value={assignForm.checkoutCondition} onValueChange={v => setAssignForm(f => ({ ...f, checkoutCondition: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold uppercase"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {['excellent', 'good', 'fair', 'poor'].map(c => (
                                        <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expected Return</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assignForm.expectedReturnAt} onChange={e => setAssignForm(f => ({ ...f, expectedReturnAt: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Notes</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Optional notes..." value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleAssign} disabled={assignSaving || !assignForm.assignedToUserId} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {assignSaving ? 'Assigning...' : 'Assign Asset'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Return Dialog ─────────────────────────────────────────────── */}
            <Dialog open={returnOpen} onOpenChange={open => { if (!open) { setReturnOpen(false); setReturnForm({ ...EMPTY_RETURN_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Return Asset</DialogTitle>
                        {selectedAsset && <p className="text-[10px] text-text-muted mt-1">{selectedAsset.name} — currently with {selectedAsset.assignedUserName}</p>}
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Return Condition</Label>
                            <Select value={returnForm.returnCondition} onValueChange={v => setReturnForm(f => ({ ...f, returnCondition: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold uppercase"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {['excellent', 'good', 'fair', 'poor', 'out-of-service'].map(c => (
                                        <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Notes</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Return notes..." value={returnForm.notes} onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setReturnOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleReturn} disabled={returnSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {returnSaving ? 'Processing...' : 'Confirm Return'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Add / Edit Asset Dialog ───────────────────────────────────── */}
            <Dialog open={assetFormOpen} onOpenChange={open => { if (!open) { setAssetFormOpen(false); setEditingAsset(false); setAssetForm({ ...EMPTY_ASSET_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest">{editingAsset ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Asset Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Milwaukee Drill M18" value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Category *</Label>
                                <Select value={assetForm.category} onValueChange={v => setAssetForm(f => ({ ...f, category: v as AssetCategory, subCategory: '' }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(['tool', 'electronic', 'safety', 'vehicle', 'inventory'] as AssetCategory[]).map(c => (
                                            <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">
                                                {ASSET_CATS.find(x => x.value === c)?.label || c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Sub-Category</Label>
                                <Select value={assetForm.subCategory} onValueChange={v => setAssetForm(f => ({ ...f, subCategory: v }))} disabled={!assetForm.category}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(assetForm.category ? ASSET_CAT_SUBS[assetForm.category as AssetCategory] || [] : []).map(s => (
                                            <SelectItem key={s} value={s} className="text-[10px] font-bold uppercase">{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Brand</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Milwaukee" value={assetForm.brand} onChange={e => setAssetForm(f => ({ ...f, brand: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Model</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. M18 FUEL" value={assetForm.model} onChange={e => setAssetForm(f => ({ ...f, model: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Condition *</Label>
                                <Select value={assetForm.condition} onValueChange={v => setAssetForm(f => ({ ...f, condition: v as Asset['condition'] }))}>
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
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</Label>
                                <Select value={assetForm.status} onValueChange={v => setAssetForm(f => ({ ...f, status: v as Asset['status'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {ASSET_STATUSES.map(s => (
                                            <SelectItem key={s} value={s} className="text-[10px] font-bold uppercase">{s.replace(/_/g, ' ')}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Serial Number</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="S/N" value={assetForm.serialNumber} onChange={e => setAssetForm(f => ({ ...f, serialNumber: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Vendor</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Supplier" value={assetForm.vendor} onChange={e => setAssetForm(f => ({ ...f, vendor: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Purchase Date</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.purchaseDate} onChange={e => setAssetForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Purchase Price ($)</Label>
                                <Input type="number" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={assetForm.purchasePrice} onChange={e => setAssetForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Warranty Expiry</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.warrantyExpiry} onChange={e => setAssetForm(f => ({ ...f, warrantyExpiry: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Next Maintenance</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.nextMaintenanceDate} onChange={e => setAssetForm(f => ({ ...f, nextMaintenanceDate: e.target.value }))} />
                            </div>
                        </div>
                        {assetForm.category === 'vehicle' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">VIN</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Vehicle ID number" value={assetForm.vin} onChange={e => setAssetForm(f => ({ ...f, vin: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">License Plate</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="ABC-1234" value={assetForm.licensePlate} onChange={e => setAssetForm(f => ({ ...f, licensePlate: e.target.value }))} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Current Location</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Warehouse A" value={assetForm.currentLocation} onChange={e => setAssetForm(f => ({ ...f, currentLocation: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Assign To</Label>
                                <Select value={assetForm.assignedUserId || '__none__'} onValueChange={v => setAssetForm(f => ({ ...f, assignedUserId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__" className="text-[10px] font-bold uppercase">Unassigned</SelectItem>
                                        {technicians.map(t => (
                                            <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Notes</Label>
                            <Textarea className="text-[11px] bg-bg-secondary border-border-main min-h-[60px]" placeholder="Additional notes..." value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => { setAssetFormOpen(false); setEditingAsset(false); setAssetForm({ ...EMPTY_ASSET_FORM }); }} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleSaveAsset} disabled={assetSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {assetSaving ? 'Saving...' : editingAsset ? 'Save Changes' : 'Add Asset'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Material Detail Dialog ────────────────────────────────────── */}
            <Dialog open={!!selectedMaterial && !matFormOpen} onOpenChange={open => !open && setSelectedMaterial(null)}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-md">
                    {selectedMaterial && (
                        <>
                            <DialogHeader>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <DialogTitle className="text-[14px] font-black uppercase">{selectedMaterial.name}</DialogTitle>
                                        <p className="text-[9px] text-text-muted uppercase mt-0.5">{selectedMaterial.category}</p>
                                    </div>
                                    <Badge variant={selectedMaterial.status === 'active' ? 'active' : 'completed'} className="text-[7px] uppercase h-5 shrink-0">{selectedMaterial.status}</Badge>
                                </div>
                            </DialogHeader>
                            <div className="space-y-3 py-1">
                                {selectedMaterial.description && (
                                    <p className="text-[11px] text-text-secondary">{selectedMaterial.description}</p>
                                )}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub text-center">
                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Cost</p>
                                        <p className="text-[16px] font-black font-mono text-text-muted mt-0.5">${selectedMaterial.standardCost.toFixed(2)}</p>
                                        <p className="text-[7px] text-text-muted uppercase">per {selectedMaterial.unitType}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-brand-red/5 border border-brand-red/20 text-center">
                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Billable</p>
                                        <p className="text-[16px] font-black font-mono text-brand-red mt-0.5">${selectedMaterial.billablePrice.toFixed(2)}</p>
                                        <p className="text-[7px] text-text-muted uppercase">per {selectedMaterial.unitType}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-text-amber/5 border border-text-amber/20 text-center">
                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Markup</p>
                                        <p className="text-[16px] font-black font-mono text-text-amber mt-0.5">{selectedMaterial.markupPercentage ?? '—'}%</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        ['Unit Type', selectedMaterial.unitType],
                                        ['Vendor', selectedMaterial.vendor],
                                        ['SKU / Part #', selectedMaterial.sku],
                                        ['Taxable', selectedMaterial.taxable ? 'Yes' : 'No'],
                                    ].filter(([, v]) => v).map(([label, value]) => (
                                        <div key={label as string} className="p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{label}</p>
                                            <p className="text-[10px] font-bold text-text-primary mt-0.5 capitalize">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                {selectedMaterial.notes && (
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Notes</p>
                                        <p className="text-[10px] text-text-secondary">{selectedMaterial.notes}</p>
                                    </div>
                                )}
                            </div>
                            <DialogFooter className="gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSelectedMaterial(null)} className="text-[10px] font-black uppercase">Close</Button>
                                <Button size="sm" onClick={() => { openEditMaterial(selectedMaterial); setSelectedMaterial(null); }} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                                    <Edit2 size={11} className="mr-1.5" /> Edit
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Add / Edit Material Dialog ────────────────────────────────── */}
            <Dialog open={matFormOpen} onOpenChange={open => { if (!open) { setMatFormOpen(false); setEditingMat(false); setMatForm({ ...EMPTY_MAT_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest">{editingMat ? 'Edit Material' : 'Add Material'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Material Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Cat6 Cable" value={matForm.name} onChange={e => setMatForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Category *</Label>
                                <Select value={matForm.category} onValueChange={v => setMatForm(f => ({ ...f, category: v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {MAT_CATS.map(c => (
                                            <SelectItem key={c} value={c} className="text-[10px] font-bold uppercase">{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Unit Type *</Label>
                                <Select value={matForm.unitType} onValueChange={v => setMatForm(f => ({ ...f, unitType: v as Material['unitType'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {UNIT_TYPES.map(u => (
                                            <SelectItem key={u} value={u} className="text-[10px] font-bold uppercase">{u}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Description</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Brief description..." value={matForm.description} onChange={e => setMatForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Cost ($)</Label>
                                <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={matForm.standardCost} onChange={e => setMatForm(f => ({ ...f, standardCost: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Billable ($)</Label>
                                <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={matForm.billablePrice} onChange={e => setMatForm(f => ({ ...f, billablePrice: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Markup %</Label>
                                <Input type="number" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Auto" value={matForm.markupPercentage} onChange={e => setMatForm(f => ({ ...f, markupPercentage: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Vendor / Source</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Supplier name" value={matForm.vendor} onChange={e => setMatForm(f => ({ ...f, vendor: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">SKU / Part #</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Part number or SKU" value={matForm.sku} onChange={e => setMatForm(f => ({ ...f, sku: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</Label>
                                <Select value={matForm.status} onValueChange={v => setMatForm(f => ({ ...f, status: v as Material['status'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold uppercase"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="active" className="text-[10px] font-bold uppercase">Active</SelectItem>
                                        <SelectItem value="inactive" className="text-[10px] font-bold uppercase">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-end pb-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={matForm.taxable}
                                        onChange={e => setMatForm(f => ({ ...f, taxable: e.target.checked }))}
                                        className="accent-brand-red h-4 w-4"
                                    />
                                    <span className="text-[10px] font-bold uppercase text-text-muted">Taxable</span>
                                </label>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Notes</Label>
                            <Textarea className="text-[11px] bg-bg-secondary border-border-main min-h-[60px]" placeholder="Additional notes..." value={matForm.notes} onChange={e => setMatForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => { setMatFormOpen(false); setEditingMat(false); setMatForm({ ...EMPTY_MAT_FORM }); }} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleSaveMaterial} disabled={matSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {matSaving ? 'Saving...' : editingMat ? 'Save Changes' : 'Add Material'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
