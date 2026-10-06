'use client';

import { usePathname } from 'next/navigation';

/**
 * The CRM screens are shared by two portals: /admin/crm (admins) and /sales
 * (the Sales Portal). Links between them must stay inside the portal the user
 * is in — a sales rep has no Admin Portal access.
 */
export function useCrmPaths() {
  const sales = (usePathname() || '').startsWith('/sales');
  return sales
    ? { inSalesPortal: true, pipeline: '/sales/pipeline', accounts: '/sales/accounts', quotes: '/sales/quotes', clients: null as string | null, project: (_id: string) => null as string | null }
    : { inSalesPortal: false, pipeline: '/admin/crm', accounts: '/admin/crm/accounts', quotes: '/admin/quotes', clients: '/admin/crm/clients' as string | null, project: (id: string) => `/admin/projects/${id}` as string | null };
}
