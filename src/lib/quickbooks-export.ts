/**
 * QuickBooks Online import files (Settings → Import data in QuickBooks).
 * One CSV per QuickBooks list, since QuickBooks imports each list on its own:
 *
 *  - Customers  ← clients
 *  - Vendors    ← technicians (1099 contractors by default)
 *  - Products and services ← labor rates, price book materials, service
 *    catalog, and (optionally) inventory on hand
 *  - Invoices   ← sent / overdue / paid invoices
 *
 * QuickBooks asks you to map columns on import; these headers use its own
 * names so most map automatically. Names must be unique within a list, so
 * clashes get a suffix rather than failing the import.
 *
 * Never exported: tax IDs (only the last 4 are stored anyway), bank details.
 */
import type { Invoice, InventoryItem, Material, Technician } from './types';
import type { PricingSettings, LaborRate } from './billing';
import type { CatalogService } from './estimating';
import { materialPrice } from './price-lines';

export type Csv = { name: string; header: string[]; rows: (string | number)[][] };

const money = (n: number | undefined | null) => (Number(n) || 0).toFixed(2);
const usDate = (iso?: string | null) => {
    const d = (iso || '').slice(0, 10);
    const [y, m, dd] = d.split('-');
    return y && m && dd ? `${m}/${dd}/${y}` : '';
};
const clip = (s: unknown, n = 100) => String(s ?? '').trim().slice(0, n);

/** Gives each name a unique spelling: "Cat6 Jack", "Cat6 Jack (2)", … */
function uniqueNames() {
    const seen = new Set<string>();
    return (name: string, suffix?: string) => {
        let base = clip(name) || 'Unnamed';
        if (seen.has(base.toLowerCase()) && suffix) base = clip(`${base} (${suffix})`);
        let out = base, i = 2;
        while (seen.has(out.toLowerCase())) out = clip(`${base} (${i++})`);
        seen.add(out.toLowerCase());
        return out;
    };
}

// ── Customers ────────────────────────────────────────────────────────────

export const customerName = (u: Technician) =>
    clip(u.accounting?.customerDisplayName || u.clientCompany || u.name || u.id);

export function customersCsv(clients: Technician[]): Csv {
    const unique = uniqueNames();
    return {
        name: 'quickbooks_customers',
        header: ['Name', 'Company', 'First Name', 'Last Name', 'Email', 'Phone', 'Street', 'Notes'],
        rows: clients.map(u => {
            const parts = String(u.billingDetails?.contactName || u.name || '').trim().split(/\s+/);
            return [
                unique(customerName(u)), clip(u.clientCompany || ''),
                parts.length > 1 ? parts[0] : '', parts.length > 1 ? parts.slice(1).join(' ') : '',
                clip(u.billingEmail || u.billingDetails?.email || u.email || '', 100), clip(u.phone || '', 30),
                clip(u.accounting?.billingAddress || u.address || '', 500),
                u.accounting?.taxExempt ? `Tax exempt${u.accounting.taxExemptReason ? `: ${u.accounting.taxExemptReason}` : ''}` : '',
            ];
        }),
    };
}

// ── Vendors ──────────────────────────────────────────────────────────────

export const vendorName = (u: Technician) => clip(u.accounting?.payeeLegalName || u.name || u.id);

export function vendorsCsv(techs: Technician[]): Csv {
    const unique = uniqueNames();
    return {
        name: 'quickbooks_vendors',
        header: ['Name', 'Company', 'First Name', 'Last Name', 'Email', 'Phone', 'Street', 'Track Payments For 1099'],
        rows: techs.map(u => {
            const parts = String(u.name || '').trim().split(/\s+/);
            return [
                unique(vendorName(u)), clip(u.accounting?.payeeBusinessName || ''),
                parts.length > 1 ? parts[0] : '', parts.length > 1 ? parts.slice(1).join(' ') : '',
                clip(u.email || '', 100), clip(u.phone || '', 30), clip(u.address || '', 500),
                u.accounting?.workerType === '1099_contractor' ? 'Yes' : 'No',
            ];
        }),
    };
}

// ── Products and services ───────────────────────────────────────────────

const PRODUCT_HEADER = [
    'Product/Service Name', 'Sales Description', 'SKU', 'Type', 'Sales Price / Rate', 'Income Account',
    'Purchase Description', 'Purchase Cost', 'Expense Account',
    'Quantity on Hand', 'Reorder Point', 'Inventory Asset Account', 'Quantity as-of Date',
    'Taxable', 'Category',
];

export function productsCsv(opts: {
    pricing: PricingSettings;
    laborRates?: LaborRate[];
    materials?: Material[];
    services?: CatalogService[];
    inventory?: InventoryItem[];
    asOf: string;
}): Csv {
    const { pricing, asOf } = opts;
    const unique = uniqueNames();
    const incomeFor = (category?: string) =>
        pricing.categories.find(c => c.name.toLowerCase() === (category || '').toLowerCase())?.qbIncomeAccount || 'Sales of Product Income';
    const rows: (string | number)[][] = [];
    const blankInv = ['', '', '', ''];

    for (const r of opts.laborRates || []) {
        rows.push([unique(r.label, 'Labor'), r.unit === 'hour' ? `${r.label} (per hour)` : r.label, r.sku || '', 'Service', money(r.rate),
            'Services', '', '', '', ...blankInv, 'No', 'Labor']);
    }

    // Inventory items that are also in the price book become one Inventory
    // item (with the price-book sale price), not two.
    const inv = (opts.inventory || []).filter(i => i.status !== 'inactive');
    const invFor = (m: Material) => inv.find(i => i.priceBookId === m.id) || inv.find(i => i.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    const usedInv = new Set<string>();
    const invCols = (i: InventoryItem) => [String(Math.max(0, i.quantityOnHand || 0)), i.reorderPoint != null ? String(i.reorderPoint) : '', 'Inventory Asset', usDate(asOf)];

    for (const m of (opts.materials || []).filter(m => m.status !== 'inactive')) {
        const i = opts.inventory ? invFor(m) : undefined;
        if (i) usedInv.add(i.id);
        rows.push([
            unique(m.name, 'Material'), m.description || m.name, m.sku || i?.sku || '', i ? 'Inventory' : 'Non-inventory',
            money(materialPrice(m, pricing)), incomeFor(m.category),
            m.description || m.name, money(i?.unitCost ?? m.standardCost), 'Cost of Goods Sold',
            ...(i ? invCols(i) : blankInv), m.taxable ? 'Yes' : 'No', m.category || '',
        ]);
    }
    for (const i of inv.filter(i => !usedInv.has(i.id))) {
        rows.push([
            unique(i.name, 'Inventory'), i.name, i.sku || '', 'Inventory', '', incomeFor(i.category),
            i.name, money(i.unitCost), 'Cost of Goods Sold', ...invCols(i), 'Yes', i.category || '',
        ]);
    }

    for (const s of (opts.services || []).filter(s => s.active !== false)) {
        rows.push([
            unique(`${s.code} ${s.name}`, 'Service'), `${s.name} (per ${s.unit})${s.note ? ` — ${s.note}` : ''}`, s.code, 'Service',
            money(s.priceTarget), 'Services', '', '', '', ...blankInv, 'No', s.category || 'Service catalog',
        ]);
    }
    return { name: 'quickbooks_products_services', header: PRODUCT_HEADER, rows };
}

// ── Invoices ─────────────────────────────────────────────────────────────

/**
 * Lines go to two items, "Labor" and "Materials" — the same two the live
 * QuickBooks sync uses — with the app's line text as the description, so a
 * CSV import and the sync never disagree on items.
 */
export function invoicesCsv(invoices: Invoice[], nameFor: (inv: Invoice) => string): Csv {
    const rows: (string | number)[][] = [];
    for (const inv of invoices) {
        const terms = (inv as any).paymentTerms as string | undefined;
        for (const l of inv.lineItems || []) {
            const mult = l.category === 'labor' && (l as any).multiplier ? Number((l as any).multiplier) : 1;
            const qty = Number(l.quantity) || 0;
            const rate = (Number(l.unitPrice) || 0) * mult;
            rows.push([
                inv.invoiceNumber, nameFor(inv), usDate(inv.issueDate), usDate(inv.dueDate), termsLabel(terms),
                clip(inv.notes || '', 1000), l.category === 'labor' ? 'Labor' : 'Materials', clip(l.description, 4000),
                qty, money(rate), money(qty * rate), l.category !== 'labor' && l.taxable !== false ? 'Taxable' : 'Non',
            ]);
        }
    }
    return {
        name: 'quickbooks_invoices',
        header: ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Terms', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'ItemTaxCode'],
        rows,
    };
}

function termsLabel(t?: string) {
    const map: Record<string, string> = { due_on_receipt: 'Due on receipt', net_15: 'Net 15', net_30: 'Net 30', net_45: 'Net 45', net_60: 'Net 60' };
    return t ? map[t] || '' : '';
}

/** Downloads each file, a beat apart so the browser doesn't drop any. */
export async function downloadCsvs(files: Csv[], download: (name: string, header: string[], rows: (string | number)[][]) => void) {
    for (const f of files) {
        download(f.name, f.header, f.rows);
        await new Promise(r => setTimeout(r, 400));
    }
}
