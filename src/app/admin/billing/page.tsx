import { redirect } from 'next/navigation';

/**
 * This page used to render a hardcoded sample ledger (2024 demo rows) and a
 * demo user — nothing in the app linked to it. Real billing lives on
 * Financials (invoices, reimbursements, payroll), so send anyone who lands
 * here by URL there.
 */
export default function AdminBillingRedirect() {
    redirect('/admin/financials');
}
