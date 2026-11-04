import { redirect } from 'next/navigation';

/**
 * Retired: Billing and Financials showed the same invoices twice. Everything
 * (balance, invoices, service plan, billing details) is on /client/financials,
 * shown as "Billing". Kept as a redirect so old links still work.
 */
export default function ClientBillingRedirect() {
    redirect('/client/financials');
}
