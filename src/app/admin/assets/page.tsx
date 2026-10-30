'use client';
import { useSessionState } from '@/hooks/use-session-state';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, setDoc, deleteField, doc, writeBatch } from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { uploadFile } from '@/lib/upload';
import { STANDARD_MATERIALS } from '@/lib/standard-materials';
import { RECOMMENDED_MARKUPS, STANDARD_MATERIAL_COSTS } from '@/lib/standard-material-prices';
import { savePricing } from '@/lib/billing-actions';
import type { Asset, AssetCategory, Material, AssetAssignment, Technician } from '@/lib/types';
import { isClient } from '@/lib/permissions';
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
    Package, Plus, Car, Wrench, Laptop, Archive, Shield,
    User, MapPin, Calendar, AlertTriangle, ChevronRight, Edit2, CheckCircle,
    DollarSign, Tag, RotateCcw, XCircle, Hammer, History, ArrowRightLeft,
    ShoppingCart, Boxes, ClipboardList, Loader2, ImagePlus, X,
Percent, } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { PricingTab } from './pricing-tab';
import { usePricingSettings } from '@/hooks/use-billing';
import { canonicalCategory, localDay, markupFor, roundCents, type PricingSettings } from '@/lib/billing';
import { materialPrice } from '@/lib/price-lines';
import { canEditUserPay } from '@/lib/profile-permissions';
import { useAuth } from '@/contexts/auth-context';
import { StatCard, StatGrid } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { SortControl } from '@/components/list-toolbar';
import { TONE_BADGE, statusLabel, type Tone } from '@/lib/status-styles';
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInDays, formatDistanceStrict } from 'date-fns';

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


const UNIT_TYPES = ['each', 'box', 'pack', 'foot', 'roll', 'hour', 'set', 'bag', 'bundle'];

const ASSET_STATUSES: Asset['status'][] = ['available', 'assigned', 'checked_out', 'needs_repair', 'lost', 'retired'];

// Asset condition / status → shared status tones (lib/status-styles.ts).
const CONDITION_TONE: Record<string, Tone> = {
    excellent: 'done', good: 'info', fair: 'progress', poor: 'problem', 'out-of-service': 'neutral',
};
const STATUS_TONE: Record<string, Tone> = {
    available: 'done', assigned: 'info', checked_out: 'info', needs_repair: 'progress', lost: 'problem', retired: 'neutral',
};

function ToneChip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
    return (
        <Badge variant={TONE_BADGE[tone]} className={cn('h-5 shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide', className)}>
            {children}
        </Badge>
    );
}

const ASSET_SORTS = [
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'condition', label: 'Condition' },
    { value: 'assigned', label: 'Assigned to' },
    { value: 'date', label: 'Added' },
];
const MATERIAL_SORTS = [
    { value: 'name', label: 'Name' },
    { value: 'category', label: 'Category' },
    { value: 'price', label: 'Price' },
    { value: 'cost', label: 'Cost' },
    { value: 'date', label: 'Added' },
];
const CONDITION_ORDER = ['excellent', 'good', 'fair', 'poor', 'out-of-service'];

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
    standardCost: '', billablePrice: '', priceOverride: false as boolean,
    vendor: '', sku: '', taxable: false as boolean, status: 'active' as Material['status'], notes: '',
    imageUrl: '', imagePath: '',
};

const MAX_MAT_IMAGE = 5 * 1024 * 1024; // matches storage.rules (materialImages)
const SUGGESTED_COST_NOTE = 'Suggested contractor cost — check against your supplier invoice';

/** Square material thumbnail: the uploaded image, or a neutral placeholder. */
function MaterialThumb({ url, name, size = 40, className }: { url?: string; name: string; size?: number; className?: string }) {
    return (
        <div
            className={cn('shrink-0 overflow-hidden rounded-md border border-border-sub bg-bg-primary flex items-center justify-center', className)}
            style={{ width: size, height: size }}
        >
            {url
                ? <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
                : <Package size={Math.round(size * 0.42)} className="text-text-muted/50" aria-hidden="true" />}
        </div>
    );
}

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
    const { settings: pricing } = usePricingSettings();
    const markupLabel = (m: Material) => {
        const fixed = m.priceOverride ?? (m.billablePrice || 0) > 0;
        return fixed ? (m.markupPercentage != null ? `${m.markupPercentage}% (own price)` : 'Own price') : `${markupFor(m.category, pricing)}%`;
    };
    // Filter pills: the price-book categories plus any older category still on a material.
    const matCats = useMemo(() => [...new Set([...pricing.categories.map(c => c.name), ...materials.map(m => m.category).filter(Boolean)])], [pricing.categories, materials]);
    const { user: authUser } = useAuth();
    const [mainTab, setMainTab] = useState<'assets' | 'log' | 'materials' | 'pricing'>('assets');
    const [logFilter, setLogFilter] = useState<'all' | 'out' | 'overdue' | 'returned'>('all');
    const [viewMode, setViewMode] = useViewMode('assets');
    const [assetCatFilter, setAssetCatFilter] = useState<AssetCategory | 'all'>('all');
    const [matCatFilter, setMatCatFilter] = useState('all');
    const [search, setSearch] = useSessionState('admin/assets:search', '');
    const [statusFilter, setStatusFilter] = useSessionState('admin/assets:statusFilter', 'all');
    const [conditionFilter, setConditionFilter] = useState('all');
    const [matStatusFilter, setMatStatusFilter] = useState('all');
    const [assetSort, setAssetSort] = useState('name');
    const [assetSortAsc, setAssetSortAsc] = useState(false);
    const [matSort, setMatSort] = useState('name');
    const [matSortAsc, setMatSortAsc] = useState(false);

    // Selected detail
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

    // Dialogs
    const [assetFormOpen, setAssetFormOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(false);
    // Kept apart from selectedAsset, which is cleared when the edit form opens.
    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
    const [assetForm, setAssetForm] = useState({ ...EMPTY_ASSET_FORM });
    const [assetSaving, setAssetSaving] = useState(false);

    const [matFormOpen, setMatFormOpen] = useState(false);
    const [editingMat, setEditingMat] = useState(false);
    const [matForm, setMatForm] = useState({ ...EMPTY_MAT_FORM });
    // The material being edited. Kept apart from selectedMaterial, which is
    // cleared when the detail dialog closes to open the edit form.
    const [editingMatId, setEditingMatId] = useState<string | null>(null);
    // A newly picked image, uploaded on save; matForm.imageUrl is the saved one.
    const [matImageFile, setMatImageFile] = useState<File | null>(null);
    const [matImagePreview, setMatImagePreview] = useState('');
    useEffect(() => () => { if (matImagePreview) URL.revokeObjectURL(matImagePreview); }, [matImagePreview]);
    const [matSaving, setMatSaving] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignForm, setAssignForm] = useState({ ...EMPTY_ASSIGN_FORM });
    const [assignSaving, setAssignSaving] = useState(false);

    const [returnOpen, setReturnOpen] = useState(false);
    const [returnForm, setReturnForm] = useState({ ...EMPTY_RETURN_FORM });
    const [returnSaving, setReturnSaving] = useState(false);

    useEffect(() => {
        const unsubA = onSharedSnapshot('assets', snap => {
            setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id } as Asset)));
        });
        const unsubM = onSharedSnapshot('materials', snap => {
            // Older materials may carry a renamed category ("Cable" → "Cable & Wire").
            setMaterials(snap.docs.map(d => { const m = { ...d.data(), id: d.id } as Material; return { ...m, category: canonicalCategory(m.category || '') }; }));
        });
        const unsubAsgn = onSharedSnapshot('assetAssignments', snap => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as AssetAssignment)));
        });
        const unsubT = onSharedSnapshot('users', snap => {
            setTechnicians(
                snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
                    .filter(t => !isClient(t))
            );
        });
        return () => { unsubA(); unsubM(); unsubAsgn(); unsubT(); };
    }, []);

    // ── Filtered views ─────────────────────────────────────────────────────

    const filteredAssets = useMemo(() => {
        const q = search.toLowerCase();
        const rows = assets.filter(a => {
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
        const when = (a: Asset) => new Date(a.createdAt || a.purchaseDate || 0).getTime() || 0;
        const byName = (a: Asset, b: Asset) => (a.name || '').localeCompare(b.name || '');
        return [...rows].sort((a, b) => {
            switch (assetSort) {
                case 'status': return statusLabel(a.status).localeCompare(statusLabel(b.status)) || byName(a, b);
                case 'condition': return CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition) || byName(a, b);
                case 'assigned': return (a.assignedUserName || '\uffff').localeCompare(b.assignedUserName || '\uffff') || byName(a, b);
                case 'date': return (assetSortAsc ? when(a) - when(b) : when(b) - when(a)) || byName(a, b);
                default: return byName(a, b);
            }
        });
    }, [assets, assetCatFilter, statusFilter, conditionFilter, search, assetSort, assetSortAsc]);
    const assetPager = usePaged(filteredAssets, PAGE_SIZES_LARGE, 'assets', [assetCatFilter, statusFilter, conditionFilter, search, assetSort, assetSortAsc]);

    const filteredMaterials = useMemo(() => {
        const q = search.toLowerCase();
        const rows = materials.filter(m => {
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
        const when = (m: Material) => new Date(m.createdAt || 0).getTime() || 0;
        const byName = (a: Material, b: Material) => (a.name || '').localeCompare(b.name || '');
        return [...rows].sort((a, b) => {
            switch (matSort) {
                case 'category': return (a.category || '').localeCompare(b.category || '') || byName(a, b);
                case 'price': return materialPrice(b, pricing) - materialPrice(a, pricing) || byName(a, b);
                case 'cost': return (b.standardCost || 0) - (a.standardCost || 0) || byName(a, b);
                case 'date': return (matSortAsc ? when(a) - when(b) : when(b) - when(a)) || byName(a, b);
                default: return byName(a, b);
            }
        });
    }, [materials, matCatFilter, matStatusFilter, search, matSort, matSortAsc]);
    const materialPager = usePaged(filteredMaterials, PAGE_SIZES_LARGE, 'materials', [matCatFilter, matStatusFilter, search, matSort, matSortAsc]);

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
        setEditingAssetId(null);
        setAssetForm({ ...EMPTY_ASSET_FORM });
        setAssetFormOpen(true);
    };

    const openEditAsset = (asset: Asset) => {
        setEditingAsset(true);
        setEditingAssetId(asset.id);
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

    // ── Check-out records ──────────────────────────────────────────────────
    // Every check-out and return goes through these two, whether it starts
    // from Assign / Return or from changing "Assign To" on the edit form, so
    // the log always shows who had a tool and when.
    const actorName = authUser?.name || 'Admin';
    const activeAssignmentFor = (assetId: string) => assignments.find(a => a.assetId === assetId && a.status === 'active');

    const recordReturn = async (assetId: string, now: string, returnCondition: string, returnNotes?: string) => {
        const active = activeAssignmentFor(assetId);
        if (!active) return;
        await updateDoc(doc(db, 'assetAssignments', active.id), {
            status: 'returned', returnedAt: now, returnCondition, returnedByName: actorName,
            ...(returnNotes && { returnNotes }),
        });
    };

    const recordCheckout = async (asset: { id: string; name: string }, userId: string, now: string,
        opts: { checkoutCondition: string; expectedReturnAt?: string; notes?: string }) => {
        const tech = technicians.find(t => t.id === userId);
        await addDoc(collection(db, 'assetAssignments'), {
            assetId: asset.id,
            assetName: asset.name,
            assignedToUserId: userId,
            assignedToName: tech?.name || '',
            assignedByName: actorName,
            checkedOutAt: now,
            checkoutCondition: opts.checkoutCondition,
            status: 'active',
            ...(opts.expectedReturnAt && { expectedReturnAt: opts.expectedReturnAt }),
            ...(opts.notes && { notes: opts.notes }),
            createdAt: now,
        });
        return tech;
    };

    const handleSaveAsset = async () => {
        if (!assetForm.name.trim() || !assetForm.category || !assetForm.condition) {
            toast({ variant: 'destructive', title: 'Required fields missing', description: 'Name, category, and condition are required.' });
            return;
        }
        setAssetSaving(true);
        try {
            const tech = technicians.find(t => t.id === assetForm.assignedUserId);
            const now = new Date().toISOString();
            const original = editingAsset && editingAssetId ? assets.find(a => a.id === editingAssetId) : undefined;
            const newUser = assetForm.assignedUserId || '';
            const oldUser = original?.assignedUserId || '';
            const holderChanged = newUser !== oldUser;
            const wasOut = (s?: string) => s === 'assigned' || s === 'checked_out';
            const base = {
                name: assetForm.name.trim(),
                category: assetForm.category as AssetCategory,
                condition: assetForm.condition as Asset['condition'],
                status: (newUser ? 'assigned' : wasOut(assetForm.status) ? 'available' : assetForm.status) as Asset['status'],
                updatedAt: now,
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

            // New assets get their id up front so a check-out can point at it.
            const assetRef = original ? doc(db, 'assets', original.id) : doc(collection(db, 'assets'));
            const holder = holderChanged
                ? newUser
                    ? { checkedOutAt: now, ...(original ? { expectedReturnAt: deleteField() } : {}) }
                    : original ? { assignedUserId: deleteField(), assignedUserName: deleteField(), checkedOutAt: deleteField(), expectedReturnAt: deleteField(), lastReturnedAt: now } : {}
                : {};

            if (original) {
                await updateDoc(assetRef, { ...base, ...holder });
                toast({ title: 'Asset updated' });
            } else {
                await setDoc(assetRef, { ...base, ...holder, createdAt: now });
                toast({ title: 'Asset added', description: `${assetForm.name} has been recorded.` });
            }
            if (holderChanged) {
                if (oldUser) await recordReturn(assetRef.id, now, assetForm.condition);
                if (newUser) await recordCheckout({ id: assetRef.id, name: base.name }, newUser, now, { checkoutCondition: assetForm.condition });
            }
            setAssetFormOpen(false);
            setEditingAsset(false);
            setEditingAssetId(null);
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
            const now = new Date().toISOString();
            // Hand-off: close whoever had it before opening the new check-out.
            await recordReturn(selectedAsset.id, now, selectedAsset.condition);
            const tech = await recordCheckout(selectedAsset, assignForm.assignedToUserId, now, {
                checkoutCondition: assignForm.checkoutCondition,
                expectedReturnAt: assignForm.expectedReturnAt,
                notes: assignForm.notes,
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
            await recordReturn(selectedAsset.id, now, returnForm.returnCondition, returnForm.notes);
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
            toast({ title: 'Status updated', description: `${asset.name} marked as ${statusLabel(newStatus).toLowerCase()}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed', description: e.message });
        }
    };

    // ── Material CRUD ──────────────────────────────────────────────────────

    // One-time starter list (lib/standard-materials): names, categories and
    // units at $0 cost, priced from each category's markup once a cost is set.
    // Skips names already in the price book, so it's safe to click again.
    const [seeding, setSeeding] = useState(false);
    const loadStandardMaterials = async () => {
        const have = new Set(materials.map(m => (m.name || '').trim().toLowerCase()));
        const toAdd = STANDARD_MATERIALS.filter(m => !have.has(m.name.toLowerCase()));
        if (!toAdd.length) { toast({ title: 'Already loaded', description: 'Every standard material is already in your price book.' }); return; }
        if (!confirm(`Add ${toAdd.length} standard low-voltage materials with suggested contractor costs? Sell prices follow each category's markup. Names already in your price book are skipped.`)) return;
        setSeeding(true);
        try {
            const now = new Date().toISOString();
            for (let i = 0; i < toAdd.length; i += 400) {
                const batch = writeBatch(db);
                toAdd.slice(i, i + 400).forEach(m => {
                    const cost = STANDARD_MATERIAL_COSTS[m.name] ?? 0;
                    const markup = markupFor(m.category, pricing);
                    batch.set(doc(collection(db, 'materials')), {
                        name: m.name, category: m.category, unitType: m.unitType,
                        ...(m.description ? { description: m.description } : {}),
                        standardCost: cost, billablePrice: roundCents(cost * (1 + markup / 100)),
                        markupPercentage: markup, priceOverride: false,
                        taxable: true, status: 'active', notes: cost ? SUGGESTED_COST_NOTE : 'Standard list — add cost', createdAt: now, updatedAt: now,
                    });
                });
                await batch.commit();
            }
            toast({ title: 'Standard materials added', description: `${toAdd.length} materials added with suggested costs. Check them against your supplier invoices.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not add materials', description: e.message });
        } finally {
            setSeeding(false);
        }
    };

    const resetMatImage = () => { setMatImageFile(null); setMatImagePreview(''); };

    const closeMatForm = () => {
        setMatFormOpen(false);
        setEditingMat(false);
        setEditingMatId(null);
        setMatForm({ ...EMPTY_MAT_FORM });
        resetMatImage();
    };

    const pickMatImage = (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Not an image', description: 'Choose a JPG, PNG, WebP or GIF.' });
            return;
        }
        if (file.size > MAX_MAT_IMAGE) {
            toast({ variant: 'destructive', title: 'Image too large', description: 'Images must be under 5 MB.' });
            return;
        }
        setMatImageFile(file);
        setMatImagePreview(URL.createObjectURL(file));
    };

    // Fills suggested costs on standard items still at $0 (never touches a
    // price set by hand) and brings the price book's category markups up to
    // the recommended ones where they're still at the untouched 20% default.
    const [fillingPrices, setFillingPrices] = useState(false);
    const fillSuggestedPrices = async () => {
        const toPrice = materials.filter(m =>
            !(m.standardCost > 0) && !(m.priceOverride === true || (m.priceOverride === undefined && (m.billablePrice || 0) > 0))
            && STANDARD_MATERIAL_COSTS[m.name] != null);
        const canSetMarkups = canEditUserPay(authUser);
        const nextCategories = [...pricing.categories];
        const markupChanges: string[] = [];
        for (const [name, pct] of Object.entries(RECOMMENDED_MARKUPS)) {
            const i = nextCategories.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
            if (i === -1) { nextCategories.push({ id: `cat-${Date.now().toString(36)}-${markupChanges.length}`, name, markupPct: pct }); markupChanges.push(`${name} ${pct}%`); }
            else if (nextCategories[i].markupPct === 20 && pct !== 20) { nextCategories[i] = { ...nextCategories[i], markupPct: pct }; markupChanges.push(`${name} 20% → ${pct}%`); }
        }
        const doMarkups = canSetMarkups && markupChanges.length > 0;
        if (!toPrice.length && !doMarkups) {
            toast({ title: 'Nothing to fill', description: 'Every standard material already has a cost, and the category markups are set.' });
            return;
        }
        const lines = [
            toPrice.length ? `Fill suggested costs on ${toPrice.length} standard materials still at $0.` : '',
            doMarkups ? `Set category markups: ${markupChanges.join(', ')}.` : '',
            'Anything you priced by hand is left alone.',
        ].filter(Boolean).join('\n\n');
        if (!confirm(lines)) return;
        setFillingPrices(true);
        try {
            let settings: PricingSettings = pricing;
            if (doMarkups) {
                settings = { ...pricing, categories: nextCategories };
                await savePricing(settings);
            }
            const now = new Date().toISOString();
            for (let i = 0; i < toPrice.length; i += 400) {
                const batch = writeBatch(db);
                toPrice.slice(i, i + 400).forEach(m => {
                    const cost = STANDARD_MATERIAL_COSTS[m.name];
                    const markup = markupFor(m.category, settings);
                    batch.update(doc(db, 'materials', m.id), {
                        standardCost: cost, billablePrice: roundCents(cost * (1 + markup / 100)),
                        markupPercentage: markup, priceOverride: false,
                        ...(m.notes === 'Standard list — add cost' || !m.notes ? { notes: SUGGESTED_COST_NOTE } : {}),
                        updatedAt: now,
                    });
                });
                await batch.commit();
            }
            toast({
                title: 'Suggested prices filled',
                description: [
                    toPrice.length ? `${toPrice.length} materials priced` : '',
                    doMarkups ? 'category markups updated' : '',
                    !canSetMarkups && markupChanges.length ? 'markups need a billing admin to change' : '',
                ].filter(Boolean).join(' · '),
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not fill prices', description: e.message });
        } finally {
            setFillingPrices(false);
        }
    };

    const openAddMaterial = () => {
        setEditingMat(false);
        setEditingMatId(null);
        setMatForm({ ...EMPTY_MAT_FORM });
        resetMatImage();
        setMatFormOpen(true);
    };

    const openEditMaterial = (m: Material) => {
        setEditingMat(true);
        setMatForm({
            name: m.name, category: m.category, description: m.description || '',
            unitType: m.unitType, standardCost: m.standardCost.toString(),
            billablePrice: m.billablePrice.toString(),
            // Older materials were priced by hand.
            priceOverride: m.priceOverride ?? (m.billablePrice || 0) > 0,
            vendor: m.vendor || '', sku: m.sku || '',
            taxable: m.taxable, status: m.status, notes: m.notes || '',
            imageUrl: m.imageUrl || '', imagePath: m.imagePath || '',
        });
        setEditingMatId(m.id);
        resetMatImage();
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
            // Priced from the category markup unless the user set their own price.
            const catMarkup = markupFor(matForm.category, pricing);
            const price = matForm.priceOverride ? (parseFloat(matForm.billablePrice) || 0) : Math.round(cost * (1 + catMarkup / 100) * 100) / 100;
            const markup = matForm.priceOverride ? (cost > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : 0) : catMarkup;

            const base = {
                name: matForm.name.trim(),
                category: matForm.category,
                unitType: matForm.unitType,
                standardCost: cost,
                billablePrice: price,
                markupPercentage: markup,
                priceOverride: matForm.priceOverride,
                taxable: matForm.taxable,
                status: matForm.status,
                updatedAt: new Date().toISOString(),
                ...(matForm.description && { description: matForm.description }),
                ...(matForm.vendor && { vendor: matForm.vendor }),
                ...(matForm.sku && { sku: matForm.sku }),
                ...(matForm.notes && { notes: matForm.notes }),
            };

            // New materials get their id up front so the image can be stored under it.
            const matRef = editingMat && editingMatId ? doc(db, 'materials', editingMatId) : doc(collection(db, 'materials'));
            const original = editingMat ? materials.find(m => m.id === matRef.id) : undefined;

            let image: { imageUrl: string; imagePath: string } | null = matForm.imageUrl
                ? { imageUrl: matForm.imageUrl, imagePath: matForm.imagePath }
                : null;
            if (matImageFile) {
                const safeName = matImageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const up = await uploadFile(`materialImages/${matRef.id}/${Date.now()}-${safeName}`, matImageFile, { contentType: matImageFile.type });
                image = { imageUrl: up.url, imagePath: up.storagePath };
            }

            if (editingMat && editingMatId) {
                await updateDoc(matRef, {
                    ...base,
                    ...(image ?? { imageUrl: deleteField(), imagePath: deleteField() }),
                });
                toast({ title: 'Material updated' });
            } else {
                await setDoc(matRef, { ...base, ...(image ?? {}), createdAt: new Date().toISOString() });
                toast({ title: 'Material added', description: `${matForm.name} added to price list.` });
            }

            // The old file is no longer referenced once the material is saved.
            if (original?.imagePath && original.imagePath !== image?.imagePath) {
                try { await deleteObject(storageRef(storage, original.imagePath)); } catch { /* already gone */ }
            }
            closeMatForm();
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

    const stamp = (iso?: string) => { try { return iso ? format(parseISO(iso), 'MMM d, yyyy h:mm a') : ''; } catch { return iso || ''; } };
    const outFor = (a: AssetAssignment) => { try { return formatDistanceStrict(parseISO(a.checkedOutAt), a.returnedAt ? parseISO(a.returnedAt) : new Date()); } catch { return ''; } };
    // expectedReturnAt is a calendar day (yyyy-MM-dd); overdue once that day has passed.
    const isOverdue = (a: AssetAssignment) => a.status === 'active' && !!a.expectedReturnAt && a.expectedReturnAt < localDay();

    const logRows = useMemo(() => {
        const rows = assignments.filter(a =>
            logFilter === 'all' ? true
            : logFilter === 'out' ? a.status === 'active'
            : logFilter === 'overdue' ? isOverdue(a)
            : a.status === 'returned');
        const q = search.trim().toLowerCase();
        const matched = q ? rows.filter(a => [a.assetName, a.assignedToName, a.assignedByName, a.returnedByName].some(v => (v || '').toLowerCase().includes(q))) : rows;
        // Still out first (overdue at the top), then everything by most recent check-out.
        return [...matched].sort((a, b) =>
            Number(isOverdue(b)) - Number(isOverdue(a))
            || Number(b.status === 'active') - Number(a.status === 'active')
            || b.checkedOutAt.localeCompare(a.checkedOutAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignments, logFilter, search]);
    const logPager = usePaged(logRows, PAGE_SIZES_LARGE, 'asset-log', [logFilter, search]);
    const logCounts = useMemo(() => ({
        out: assignments.filter(a => a.status === 'active').length,
        overdue: assignments.filter(isOverdue).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [assignments]);

    const tabTriggerCls = "tab-underline";

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">
            {/* Header */}
            <PageHeader
                eyebrow="Equipment"
                icon={Package}
                title="Assets & materials"
                subtitle="Company tools, vehicles and devices, plus the materials you bill for."
                actions={<>
                    <ViewToggle value={viewMode} onChange={setViewMode} />
                    {mainTab === 'assets' ? (
                        <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white" onClick={openAddAsset}>
                            <Plus size={14} className="mr-1.5" /> Add asset
                        </Button>
                    ) : mainTab === 'materials' && (
                        <>
                            <Button size="sm" variant="outline" className="h-9" onClick={fillSuggestedPrices} disabled={fillingPrices}>
                                {fillingPrices ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <DollarSign size={14} className="mr-1.5" />} Fill suggested prices
                            </Button>
                            <Button size="sm" variant="outline" className="h-9" onClick={loadStandardMaterials} disabled={seeding}>
                                {seeding ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ShoppingCart size={14} className="mr-1.5" />} Load standard materials
                            </Button>
                            <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white" onClick={openAddMaterial}>
                                <Plus size={14} className="mr-1.5" /> Add material
                            </Button>
                        </>
                    )}
                </>}
            />

            {/* Stats */}
            <StatGrid className="md:grid-cols-5 xl:grid-cols-5">
                <StatCard label="Total assets" value={stats.total} icon={Package} />
                <StatCard label="Checked out" value={stats.checkedOut} icon={ArrowRightLeft} tone={stats.checkedOut ? 'info' : undefined} />
                <StatCard label="Needs repair" value={stats.needsRepair} icon={Hammer} tone={stats.needsRepair ? 'progress' : undefined} />
                <StatCard label="Lost / missing" value={stats.lost} icon={AlertTriangle} tone={stats.lost ? 'problem' : undefined} />
                <StatCard label="Active materials" value={stats.activeMaterials} icon={ShoppingCart} />
            </StatGrid>

            {/* Main tabs */}
            <Tabs value={mainTab} onValueChange={v => { setMainTab(v as 'assets' | 'log' | 'materials' | 'pricing'); setSearch(''); }} className="w-full">
                <TabsList className="border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 mb-5">
                    <TabsTrigger value="assets" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><Boxes size={12} /> Assets ({assets.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="log" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><History size={12} /> Check-out log{logCounts.out > 0 && ` (${logCounts.out} out)`}</span>
                    </TabsTrigger>
                    <TabsTrigger value="materials" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><ShoppingCart size={12} /> Materials ({materials.filter(m => m.status === 'active').length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="pricing" className={tabTriggerCls}>
                        <span className="flex items-center gap-2"><Percent size={12} /> Rates &amp; markups</span>
                    </TabsTrigger>
                </TabsList>

                {/* ── Assets Tab ─────────────────────────────────────────── */}
                <TabsContent value="assets" className="m-0">
                    {/* Category pills */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {ASSET_CATS.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setAssetCatFilter(cat.value)}
                                className={cn('flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                    assetCatFilter === cat.value
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                )}
                            >
                                <cat.icon size={12} />
                                {cat.label}
                                <span className="opacity-70">
                                    ({cat.value === 'all' ? assets.length : assets.filter(a => a.category === cat.value).length})
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2 mb-5">
                        <SearchField
                            className="flex-1 min-w-[200px]"
                            placeholder="Search name, brand, serial, assigned to…"
                            value={search}
                            onChange={setSearch}
                        />
                        <SortControl value={assetSort} onChange={setAssetSort} options={ASSET_SORTS} dateAsc={assetSortAsc} onToggleDirection={() => setAssetSortAsc(v => !v)} />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 w-[150px] bg-bg-secondary border-border-main" aria-label="Status">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all">All statuses</SelectItem>
                                {ASSET_STATUSES.map(s => (
                                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={conditionFilter} onValueChange={setConditionFilter}>
                            <SelectTrigger className="h-9 w-[150px] bg-bg-secondary border-border-main" aria-label="Condition">
                                <SelectValue placeholder="Condition" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                {['all', 'excellent', 'good', 'fair', 'poor', 'out-of-service'].map(v => (
                                    <SelectItem key={v} value={v}>{v === 'all' ? 'All conditions' : statusLabel(v)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Asset grid */}
                    {filteredAssets.length === 0 ? (
                        (search || statusFilter !== 'all' || conditionFilter !== 'all' || assetCatFilter !== 'all') ? (
                            <EmptyState
                                icon={Package}
                                title="No assets match these filters"
                                action={<Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); setConditionFilter('all'); setAssetCatFilter('all'); }}>Reset filters</Button>}
                            />
                        ) : (
                            <EmptyState
                                icon={Package}
                                title="No assets yet"
                                description="Add tools, vehicles and devices to track who has them."
                                action={<Button size="sm" variant="outline" onClick={openAddAsset}><Plus size={14} className="mr-1.5" /> Add first asset</Button>}
                            />
                        )
                    ) : viewMode === 'list' ? (
                        <div className="space-y-1">
                            {assetPager.items.map(asset => {
                                const CatIcon = ASSET_CATS.find(c => c.value === asset.category)?.icon || Package;
                                const needsMaint = maintenanceDue(asset);
                                const assignedTech = technicians.find(t => t.id === asset.assignedUserId);
                                return (
                                    <div key={asset.id} onClick={() => setSelectedAsset(asset)}
                                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red hover:bg-bg-tertiary transition-all cursor-pointer">
                                        <CatIcon size={13} className="text-brand-red shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-bold tracking-tight text-text-primary truncate">{asset.name}</p>
                                            <p className="text-[11px] text-text-muted truncate">
                                                {[asset.brand, asset.model, asset.serialNumber ? `S/N ${asset.serialNumber}` : null].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        {asset.currentLocation && (
                                            <span className="hidden lg:flex items-center gap-1 text-[11px] text-text-muted shrink-0"><MapPin size={9} />{asset.currentLocation}</span>
                                        )}
                                        <span className="hidden md:block text-[12px] font-bold text-text-secondary truncate max-w-[120px] shrink-0">
                                            {assignedTech ? assignedTech.name : 'Unassigned'}
                                        </span>
                                        <ToneChip tone={CONDITION_TONE[asset.condition] || 'neutral'}>{statusLabel(asset.condition)}</ToneChip>
                                        {needsMaint && <AlertTriangle size={11} className="text-text-amber shrink-0" />}
                                        <ToneChip tone={STATUS_TONE[asset.status] || 'neutral'}>{statusLabel(asset.status)}</ToneChip>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {assetPager.items.map(asset => {
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
                                                {asset.brand && <span className="text-[11px] font-bold text-text-muted truncate">{asset.brand}</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {needsMaint && <AlertTriangle size={11} className="text-text-amber" />}
                                                <ToneChip tone={STATUS_TONE[asset.status] || 'neutral'}>{statusLabel(asset.status)}</ToneChip>
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-2.5">
                                            <div>
                                                <p className="text-[13px] font-bold tracking-tight text-text-primary truncate group-hover:text-brand-red transition-colors">{asset.name}</p>
                                                {asset.model && <p className="text-[11px] text-text-muted mt-0.5">{asset.model}</p>}
                                                {asset.serialNumber && <p className="text-[11px] font-mono text-text-muted">S/N: {asset.serialNumber}</p>}
                                            </div>
                                            <ToneChip tone={CONDITION_TONE[asset.condition] || 'neutral'} className="gap-1">
                                                <CheckCircle size={10} /> {statusLabel(asset.condition)}
                                            </ToneChip>
                                            {assignedTech ? (
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5 border border-border-sub shrink-0">
                                                        <AvatarImage src={assignedTech.avatarUrl} />
                                                        <AvatarFallback className="text-[10px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <p className="text-[12px] font-bold text-text-secondary truncate">{assignedTech.name}</p>
                                                </div>
                                            ) : (
                                                <p className="text-[12px] text-text-muted">Unassigned</p>
                                            )}
                                            {asset.currentLocation && (
                                                <p className="flex items-center gap-1 text-[11px] text-text-muted">
                                                    <MapPin size={9} />{asset.currentLocation}
                                                </p>
                                            )}
                                        </div>
                                        <div className="bg-bg-tertiary/20 border-t border-border-sub px-4 py-2 flex items-center justify-between">
                                            <p className="text-[12px] font-medium text-text-muted">View details</p>
                                            <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <ListPager pager={assetPager} noun="assets" />
                </TabsContent>

                {/* ── Materials Tab ──────────────────────────────────────── */}
                {/* ── Check-out log: every check-out and return across all assets ── */}
                <TabsContent value="log" className="m-0">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {([
                            ['all', `All (${assignments.length})`],
                            ['out', `Checked out (${logCounts.out})`],
                            ['overdue', `Overdue (${logCounts.overdue})`],
                            ['returned', 'Returned'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setLogFilter(value)}
                                className={cn('text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                    logFilter === value
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-5">
                        <SearchField className="flex-1 min-w-[200px]" placeholder="Search asset or person…" value={search} onChange={setSearch} />
                    </div>

                    {logRows.length === 0 ? (
                        <EmptyState
                            icon={History}
                            title={assignments.length ? 'No check-outs match these filters' : 'No check-outs yet'}
                            description={assignments.length ? undefined : 'Open an asset and use Assign / check out. Every check-out and return is recorded here.'}
                        />
                    ) : (
                        <div className="rounded-xl border border-border-sub overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border-sub bg-bg-secondary/50">
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Asset</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Checked out to</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Out</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Returned</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Time out</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Condition</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logPager.items.map(a => {
                                        const asset = assets.find(x => x.id === a.assetId);
                                        return (
                                            <TableRow
                                                key={a.id}
                                                className={cn('border-border-sub transition-colors', asset && 'hover:bg-bg-secondary cursor-pointer')}
                                                onClick={() => { if (asset) setSelectedAsset(asset); }}
                                            >
                                                <TableCell className="text-[12px] font-bold text-text-primary">{a.assetName}</TableCell>
                                                <TableCell className="text-[12px] text-text-primary">{a.assignedToName || '—'}</TableCell>
                                                <TableCell className="text-[11px] text-text-muted whitespace-nowrap">
                                                    {stamp(a.checkedOutAt)}
                                                    {a.assignedByName && <span className="block">by {a.assignedByName}</span>}
                                                </TableCell>
                                                <TableCell className="text-[11px] text-text-muted whitespace-nowrap">
                                                    {a.returnedAt ? <>{stamp(a.returnedAt)}{a.returnedByName && <span className="block">by {a.returnedByName}</span>}</>
                                                        : a.expectedReturnAt ? <>Due {a.expectedReturnAt}</> : '—'}
                                                </TableCell>
                                                <TableCell className="text-[11px] text-text-muted whitespace-nowrap">{outFor(a)}</TableCell>
                                                <TableCell className="text-[11px] text-text-muted whitespace-nowrap">
                                                    {statusLabel(a.checkoutCondition)}{a.returnCondition && ` → ${statusLabel(a.returnCondition)}`}
                                                </TableCell>
                                                <TableCell>
                                                    <ToneChip tone={isOverdue(a) ? 'problem' : a.status === 'active' ? 'info' : 'neutral'}>
                                                        {isOverdue(a) ? 'Overdue' : a.status === 'active' ? 'Checked out' : 'Returned'}
                                                    </ToneChip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <ListPager pager={logPager} noun="check-outs" />
                </TabsContent>

                <TabsContent value="materials" className="m-0">
                    {/* Category: a picker on phones (ten long names would stack
                        five rows deep), pills from sm up. */}
                    <Select value={matCatFilter} onValueChange={setMatCatFilter}>
                        <SelectTrigger className="mb-4 h-9 w-full bg-bg-secondary border-border-main sm:hidden" aria-label="Category">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                            {['all', ...matCats].map(cat => (
                                <SelectItem key={cat} value={cat}>{cat === 'all' ? `All categories (${materials.length})` : cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="hidden sm:flex flex-wrap items-center gap-2 mb-4">
                        {['all', ...matCats].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setMatCatFilter(cat)}
                                className={cn('text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
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
                    <div className="flex flex-wrap gap-2 mb-5">
                        <SearchField
                            className="flex-1 min-w-[200px]"
                            placeholder="Search name, SKU, vendor…"
                            value={search}
                            onChange={setSearch}
                        />
                        <SortControl value={matSort} onChange={setMatSort} options={MATERIAL_SORTS} dateAsc={matSortAsc} onToggleDirection={() => setMatSortAsc(v => !v)} />
                        <Select value={matStatusFilter} onValueChange={setMatStatusFilter}>
                            <SelectTrigger className="h-9 w-[130px] bg-bg-secondary border-border-main" aria-label="Status">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {filteredMaterials.length === 0 ? (
                        (search || matStatusFilter !== 'all' || matCatFilter !== 'all') ? (
                            <EmptyState
                                icon={ShoppingCart}
                                title="No materials match these filters"
                                action={<Button size="sm" variant="outline" onClick={() => { setSearch(''); setMatStatusFilter('all'); setMatCatFilter('all'); }}>Reset filters</Button>}
                            />
                        ) : (
                            <EmptyState
                                icon={ShoppingCart}
                                title="No materials yet"
                                description="Add the parts and supplies you bill to clients."
                                action={<Button size="sm" variant="outline" onClick={openAddMaterial}><Plus size={14} className="mr-1.5" /> Add first material</Button>}
                            />
                        )
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {materialPager.items.map(m => (
                                <div key={m.id} onClick={() => setSelectedMaterial(m)}
                                    className="rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red hover:bg-bg-tertiary transition-all cursor-pointer p-4 space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <MaterialThumb url={m.imageUrl} name={m.name} size={48} />
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-text-primary truncate">{m.name}</p>
                                                {m.vendor && <p className="text-[11px] text-text-muted truncate">{m.vendor}</p>}
                                            </div>
                                        </div>
                                        <ToneChip tone={m.status === 'active' ? 'done' : 'neutral'}>{statusLabel(m.status)}</ToneChip>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="scheduled" className="text-[10px] h-4">{m.category}</Badge>
                                        <Badge variant="scheduled" className="text-[10px] h-4">{m.unitType}</Badge>
                                        {m.sku && <span className="text-[10px] font-mono text-text-muted">SKU {m.sku}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 pt-1 border-t border-border-sub">
                                        <div><p className="text-[10px] font-bold text-text-muted">Cost</p><p className="text-[11px] font-mono text-text-muted">${m.standardCost.toFixed(2)}</p></div>
                                        <div><p className="text-[10px] font-bold text-text-muted">Billable</p><p className="text-[12px] font-mono font-bold text-text-primary">${materialPrice(m, pricing).toFixed(2)}</p></div>
                                        <div><p className="text-[10px] font-bold text-text-muted">Markup</p><p className="text-[11px] font-mono text-text-amber">{markupLabel(m)}</p></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border-sub overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border-sub bg-bg-secondary/50">
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Name</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Category</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Unit</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Cost</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Billable</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Markup</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">SKU</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {materialPager.items.map(m => (
                                        <TableRow
                                            key={m.id}
                                            className="border-border-sub hover:bg-bg-secondary cursor-pointer transition-colors"
                                            onClick={() => setSelectedMaterial(m)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-2.5">
                                                    <MaterialThumb url={m.imageUrl} name={m.name} size={32} />
                                                    <div className="min-w-0">
                                                        <p className="text-[12px] font-bold text-text-primary">{m.name}</p>
                                                        {m.vendor && <p className="text-[11px] text-text-muted">{m.vendor}</p>}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-[11px] text-text-muted">{m.category}</TableCell>
                                            <TableCell>
                                                <Badge variant="scheduled" className="text-[10px] h-4">{m.unitType}</Badge>
                                            </TableCell>
                                            <TableCell className="text-[12px] font-mono text-text-muted text-right">${m.standardCost.toFixed(2)}</TableCell>
                                            <TableCell className="text-[12px] font-mono font-bold text-text-primary text-right">${materialPrice(m, pricing).toFixed(2)}</TableCell>
                                            <TableCell className="text-[11px] font-mono text-text-amber text-right">{markupLabel(m)}</TableCell>
                                            <TableCell className="text-[11px] font-mono text-text-muted">{m.sku || '—'}</TableCell>
                                            <TableCell>
                                                <ToneChip tone={m.status === 'active' ? 'done' : 'neutral'}>{statusLabel(m.status)}</ToneChip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <ListPager pager={materialPager} noun="materials" />
                </TabsContent>

                {/* ── Labor & pricing: labor rates, markup, sales tax (adminConfig/pricing) ── */}
                <TabsContent value="pricing" className="m-0">
                    <PricingTab settings={pricing} canEdit={canEditUserPay(authUser)} materials={materials} />
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
                                                <DialogTitle className="text-base font-semibold">{selectedAsset.name}</DialogTitle>
                                                <p className="text-[11px] text-text-muted">
                                                    {selectedAsset.brand && `${selectedAsset.brand} `}{selectedAsset.model && `${selectedAsset.model} · `}
                                                    {ASSET_CATS.find(c => c.value === selectedAsset.category)?.label}
                                                    {selectedAsset.subCategory && ` · ${selectedAsset.subCategory}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap shrink-0">
                                            <ToneChip tone={STATUS_TONE[selectedAsset.status] || 'neutral'}>{statusLabel(selectedAsset.status)}</ToneChip>
                                            <ToneChip tone={CONDITION_TONE[selectedAsset.condition] || 'neutral'}>{statusLabel(selectedAsset.condition)}</ToneChip>
                                        </div>
                                    </div>
                                </DialogHeader>

                                <div className="space-y-4 py-1">
                                    {/* Current assignment */}
                                    {assignedTech && (
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                            <Avatar className="h-8 w-8 border border-border-sub">
                                                <AvatarImage src={assignedTech.avatarUrl} />
                                                <AvatarFallback className="text-[11px]">{(assignedTech.name || 'U')[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1">
                                                <p className="text-[12px] font-bold text-text-primary">{assignedTech.name}</p>
                                                <p className="text-[12px] text-text-muted">
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
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
                                                <p className="text-[12px] font-bold text-text-primary mt-0.5">{value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {selectedAsset.notes && (
                                        <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notes</p>
                                            <p className="text-[12px] text-text-secondary">{selectedAsset.notes}</p>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-2 border-t border-border-sub pt-3">
                                        {!isOut && (
                                            <Button size="sm" variant="outline" className="h-8" onClick={() => setAssignOpen(true)}>
                                                <ArrowRightLeft size={10} className="mr-1.5" /> Assign / check out
                                            </Button>
                                        )}
                                        {isOut && (
                                            <Button size="sm" variant="outline" className="h-8" onClick={() => setReturnOpen(true)}>
                                                <RotateCcw size={10} className="mr-1.5" /> Return asset
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'needs_repair' && (
                                            <Button size="sm" variant="outline" className="h-8 text-text-amber border-text-amber/30" onClick={() => handleStatusChange(selectedAsset, 'needs_repair')}>
                                                <Hammer size={10} className="mr-1.5" /> Needs repair
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'lost' && (
                                            <Button size="sm" variant="outline" className="h-8 text-text-red border-text-red/30" onClick={() => handleStatusChange(selectedAsset, 'lost')}>
                                                <XCircle size={10} className="mr-1.5" /> Mark lost
                                            </Button>
                                        )}
                                        {selectedAsset.status !== 'available' && !isOut && (
                                            <Button size="sm" variant="outline" className="h-8 text-text-green border-text-green/30" onClick={() => handleStatusChange(selectedAsset, 'available')}>
                                                <CheckCircle size={10} className="mr-1.5" /> Mark available
                                            </Button>
                                        )}
                                    </div>

                                    {/* Assignment history */}
                                    {history.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2 mb-2">
                                                <History size={10} /> Check-out history
                                            </p>
                                            <div className="space-y-1.5">
                                                {history.map(h => (
                                                    <div key={h.id} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-sub">
                                                        <div className="min-w-0">
                                                            <p className="text-[12px] font-bold text-text-primary">{h.assignedToName || 'Unknown'}</p>
                                                            <p className="text-[11px] text-text-muted">
                                                                Out {stamp(h.checkedOutAt)}{h.assignedByName && ` · by ${h.assignedByName}`}
                                                            </p>
                                                            <p className="text-[11px] text-text-muted">
                                                                {h.returnedAt
                                                                    ? <>Back {stamp(h.returnedAt)}{h.returnedByName && ` · by ${h.returnedByName}`} · {outFor(h)}</>
                                                                    : <>Still out · {outFor(h)}{h.expectedReturnAt && ` · due ${h.expectedReturnAt}`}</>}
                                                            </p>
                                                            {h.notes && <p className="text-[11px] text-text-muted">Out: {h.notes}</p>}
                                                            {h.returnNotes && <p className="text-[11px] text-text-muted">Back: {h.returnNotes}</p>}
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                                            <ToneChip tone={isOverdue(h) ? 'problem' : h.status === 'active' ? 'info' : 'neutral'}>{isOverdue(h) ? 'Overdue' : h.status === 'active' ? 'Checked out' : statusLabel(h.status)}</ToneChip>
                                                            <span className="text-[11px] text-text-muted">
                                                                {statusLabel(h.checkoutCondition)}{h.returnCondition && ` → ${statusLabel(h.returnCondition)}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <DialogFooter className="gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedAsset(null)} className="text-[10px] font-bold">Close</Button>
                                    <Button size="sm" onClick={() => { openEditAsset(selectedAsset); setSelectedAsset(null); }} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
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
                        <DialogTitle className="text-base font-semibold">Assign asset</DialogTitle>
                        {selectedAsset && <p className="text-[12px] text-text-muted mt-1">{selectedAsset.name}</p>}
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Assign To *</Label>
                            <Select value={assignForm.assignedToUserId} onValueChange={v => setAssignForm(f => ({ ...f, assignedToUserId: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold">
                                    <SelectValue placeholder="Select person" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {technicians.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Checkout Condition</Label>
                            <Select value={assignForm.checkoutCondition} onValueChange={v => setAssignForm(f => ({ ...f, checkoutCondition: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {['excellent', 'good', 'fair', 'poor'].map(c => (
                                        <SelectItem key={c} value={c}>{statusLabel(c)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Expected Return</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assignForm.expectedReturnAt} onChange={e => setAssignForm(f => ({ ...f, expectedReturnAt: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Notes</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Optional notes..." value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" onClick={handleAssign} disabled={assignSaving || !assignForm.assignedToUserId} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                            {assignSaving ? 'Assigning...' : 'Assign asset'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Return Dialog ─────────────────────────────────────────────── */}
            <Dialog open={returnOpen} onOpenChange={open => { if (!open) { setReturnOpen(false); setReturnForm({ ...EMPTY_RETURN_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">Return asset</DialogTitle>
                        {selectedAsset && <p className="text-[12px] text-text-muted mt-1">{selectedAsset.name} — currently with {selectedAsset.assignedUserName}</p>}
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Return Condition</Label>
                            <Select value={returnForm.returnCondition} onValueChange={v => setReturnForm(f => ({ ...f, returnCondition: v }))}>
                                <SelectTrigger className="h-9 text-[10px] bg-bg-secondary border-border-main font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {['excellent', 'good', 'fair', 'poor', 'out-of-service'].map(c => (
                                        <SelectItem key={c} value={c}>{statusLabel(c)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Notes</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Return notes..." value={returnForm.notes} onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setReturnOpen(false)} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" onClick={handleReturn} disabled={returnSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                            {returnSaving ? 'Saving…' : 'Confirm return'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Add / Edit Asset Dialog ───────────────────────────────────── */}
            <Dialog open={assetFormOpen} onOpenChange={open => { if (!open) { setAssetFormOpen(false); setEditingAsset(false); setEditingAssetId(null); setAssetForm({ ...EMPTY_ASSET_FORM }); } }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">{editingAsset ? 'Edit asset' : 'Add asset'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Asset Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Milwaukee Drill M18" value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Category *</Label>
                                <Select value={assetForm.category} onValueChange={v => setAssetForm(f => ({ ...f, category: v as AssetCategory, subCategory: '' }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(['tool', 'electronic', 'safety', 'vehicle', 'inventory'] as AssetCategory[]).map(c => (
                                            <SelectItem key={c} value={c}>
                                                {ASSET_CATS.find(x => x.value === c)?.label || c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Sub-Category</Label>
                                <Select value={assetForm.subCategory} onValueChange={v => setAssetForm(f => ({ ...f, subCategory: v }))} disabled={!assetForm.category}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(assetForm.category ? ASSET_CAT_SUBS[assetForm.category as AssetCategory] || [] : []).map(s => (
                                            <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Brand</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Milwaukee" value={assetForm.brand} onChange={e => setAssetForm(f => ({ ...f, brand: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Model</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. M18 FUEL" value={assetForm.model} onChange={e => setAssetForm(f => ({ ...f, model: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Condition *</Label>
                                <Select value={assetForm.condition} onValueChange={v => setAssetForm(f => ({ ...f, condition: v as Asset['condition'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue placeholder="Select condition" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {(['excellent', 'good', 'fair', 'poor', 'out-of-service'] as const).map(c => (
                                            <SelectItem key={c} value={c}>{statusLabel(c)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</Label>
                                <Select value={assetForm.status} onValueChange={v => setAssetForm(f => ({ ...f, status: v as Asset['status'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {ASSET_STATUSES.map(s => (
                                            <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Serial Number</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="S/N" value={assetForm.serialNumber} onChange={e => setAssetForm(f => ({ ...f, serialNumber: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Vendor</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Supplier" value={assetForm.vendor} onChange={e => setAssetForm(f => ({ ...f, vendor: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Purchase Date</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.purchaseDate} onChange={e => setAssetForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Purchase Price ($)</Label>
                                <Input type="number" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={assetForm.purchasePrice} onChange={e => setAssetForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Warranty Expiry</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.warrantyExpiry} onChange={e => setAssetForm(f => ({ ...f, warrantyExpiry: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Next Maintenance</Label>
                                <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={assetForm.nextMaintenanceDate} onChange={e => setAssetForm(f => ({ ...f, nextMaintenanceDate: e.target.value }))} />
                            </div>
                        </div>
                        {assetForm.category === 'vehicle' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">VIN</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Vehicle ID number" value={assetForm.vin} onChange={e => setAssetForm(f => ({ ...f, vin: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">License Plate</Label>
                                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="ABC-1234" value={assetForm.licensePlate} onChange={e => setAssetForm(f => ({ ...f, licensePlate: e.target.value }))} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Current Location</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Warehouse A" value={assetForm.currentLocation} onChange={e => setAssetForm(f => ({ ...f, currentLocation: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Assign To</Label>
                                <Select value={assetForm.assignedUserId || '__none__'} onValueChange={v => setAssetForm(f => ({ ...f, assignedUserId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__">Unassigned</SelectItem>
                                        {technicians.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Notes</Label>
                            <Textarea className="text-[11px] bg-bg-secondary border-border-main min-h-[60px]" placeholder="Additional notes..." value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => { setAssetFormOpen(false); setEditingAsset(false); setEditingAssetId(null); setAssetForm({ ...EMPTY_ASSET_FORM }); }} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" onClick={handleSaveAsset} disabled={assetSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                            {assetSaving ? 'Saving...' : editingAsset ? 'Save changes' : 'Add asset'}
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
                                    <div className="flex min-w-0 items-start gap-3">
                                        <MaterialThumb url={selectedMaterial.imageUrl} name={selectedMaterial.name} size={64} />
                                        <div className="min-w-0">
                                            <DialogTitle className="text-base font-semibold">{selectedMaterial.name}</DialogTitle>
                                            <p className="text-[11px] text-text-muted mt-0.5">{selectedMaterial.category}</p>
                                        </div>
                                    </div>
                                    <ToneChip tone={selectedMaterial.status === 'active' ? 'done' : 'neutral'}>{statusLabel(selectedMaterial.status)}</ToneChip>
                                </div>
                            </DialogHeader>
                            <div className="space-y-3 py-1">
                                {selectedMaterial.description && (
                                    <p className="text-[12px] text-text-secondary">{selectedMaterial.description}</p>
                                )}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub text-center">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Cost</p>
                                        <p className="text-[16px] font-bold font-mono text-text-muted mt-0.5">${selectedMaterial.standardCost.toFixed(2)}</p>
                                        <p className="text-[10px] text-text-muted">per {selectedMaterial.unitType}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-brand-red/5 border border-brand-red/20 text-center">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Billable</p>
                                        <p className="text-[16px] font-bold font-mono text-brand-red mt-0.5">${materialPrice(selectedMaterial, pricing).toFixed(2)}</p>
                                        <p className="text-[10px] text-text-muted">per {selectedMaterial.unitType}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-text-amber/5 border border-text-amber/20 text-center">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Markup</p>
                                        <p className="text-[16px] font-bold font-mono text-text-amber mt-0.5">{markupLabel(selectedMaterial)}</p>
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
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
                                            <p className="text-[12px] font-bold text-text-primary mt-0.5 capitalize">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                {selectedMaterial.notes && (
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notes</p>
                                        <p className="text-[12px] text-text-secondary">{selectedMaterial.notes}</p>
                                    </div>
                                )}
                            </div>
                            <DialogFooter className="gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSelectedMaterial(null)} className="text-[10px] font-bold">Close</Button>
                                <Button size="sm" onClick={() => { openEditMaterial(selectedMaterial); setSelectedMaterial(null); }} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                                    <Edit2 size={11} className="mr-1.5" /> Edit
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Add / Edit Material Dialog ────────────────────────────────── */}
            <Dialog open={matFormOpen} onOpenChange={open => { if (!open) closeMatForm(); }}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">{editingMat ? 'Edit material' : 'Add material'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Image</Label>
                            <div className="flex items-center gap-3">
                                <MaterialThumb url={matImagePreview || matForm.imageUrl} name={matForm.name || 'Material'} size={64} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-main bg-bg-secondary px-3 text-[10px] font-bold text-text-primary hover:border-brand-red">
                                        <ImagePlus size={13} className="mr-1.5" />
                                        {matImagePreview || matForm.imageUrl ? 'Replace image' : 'Upload image'}
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            className="sr-only"
                                            onChange={e => { pickMatImage(e.target.files?.[0]); e.target.value = ''; }}
                                        />
                                    </label>
                                    {(matImagePreview || matForm.imageUrl) && (
                                        <Button type="button" variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-text-muted"
                                            onClick={() => { resetMatImage(); setMatForm(f => ({ ...f, imageUrl: '', imagePath: '' })); }}>
                                            <X size={13} className="mr-1" /> Remove
                                        </Button>
                                    )}
                                    <p className="w-full text-[10px] text-text-muted">JPG, PNG, WebP or GIF, up to 5 MB. Shown as the thumbnail in the price book.</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Material Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Cat6 Cable" value={matForm.name} onChange={e => setMatForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Category *</Label>
                                <Select value={matForm.category} onValueChange={v => setMatForm(f => ({ ...f, category: v }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {[...new Set([...pricing.categories.map(c => c.name), ...(matForm.category ? [matForm.category] : [])])].map(c => (
                                            <SelectItem key={c} value={c}>{c} · {markupFor(c, pricing)}% markup</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Unit Type *</Label>
                                <Select value={matForm.unitType} onValueChange={v => setMatForm(f => ({ ...f, unitType: v as Material['unitType'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {UNIT_TYPES.map(u => (
                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Description</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Brief description..." value={matForm.description} onChange={e => setMatForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Your cost ($)</Label>
                                <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={matForm.standardCost} onChange={e => setMatForm(f => ({ ...f, standardCost: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Sell price ($)</Label>
                                {matForm.priceOverride ? (
                                    <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="0.00" value={matForm.billablePrice} onChange={e => setMatForm(f => ({ ...f, billablePrice: e.target.value }))} />
                                ) : (
                                    <p className="h-9 flex items-center px-3 rounded-md border border-border-sub bg-bg-primary text-[12px] font-mono font-bold">
                                        ${((parseFloat(matForm.standardCost) || 0) * (1 + markupFor(matForm.category, pricing) / 100)).toFixed(2)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer -mt-1">
                            <input type="checkbox" className="accent-brand-red h-4 w-4" checked={matForm.priceOverride}
                                onChange={e => setMatForm(f => ({ ...f, priceOverride: e.target.checked,
                                    billablePrice: e.target.checked && !f.billablePrice ? ((parseFloat(f.standardCost) || 0) * (1 + markupFor(f.category, pricing) / 100)).toFixed(2) : f.billablePrice }))} />
                            <span className="text-[11px] text-text-muted">
                                {matForm.priceOverride ? 'Using my own price for this item' : `Priced from ${matForm.category || 'the category'} markup (${markupFor(matForm.category, pricing)}%) — check to set my own price`}
                            </span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Vendor / Source</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Supplier name" value={matForm.vendor} onChange={e => setMatForm(f => ({ ...f, vendor: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">SKU / Part #</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Part number or SKU" value={matForm.sku} onChange={e => setMatForm(f => ({ ...f, sku: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</Label>
                                <Select value={matForm.status} onValueChange={v => setMatForm(f => ({ ...f, status: v as Material['status'] }))}>
                                    <SelectTrigger className="h-9 bg-bg-secondary border-border-main text-[10px] font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
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
                                    <span className="text-[10px] font-bold text-text-muted">Taxable</span>
                                </label>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Notes</Label>
                            <Textarea className="text-[11px] bg-bg-secondary border-border-main min-h-[60px]" placeholder="Additional notes..." value={matForm.notes} onChange={e => setMatForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={closeMatForm} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" onClick={handleSaveMaterial} disabled={matSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                            {matSaving ? 'Saving...' : editingMat ? 'Save changes' : 'Add material'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
