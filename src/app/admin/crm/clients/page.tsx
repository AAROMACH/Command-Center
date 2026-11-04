import { redirect } from 'next/navigation';

/**
 * Retired: this was a second "Clients" screen (client accounts with site
 * request counts). Clients live at /admin/sites, client detail at
 * /admin/clients/[id], and site requests are approved in Directory.
 * Kept as a redirect so old links and bookmarks still land somewhere.
 */
export default function CrmClientsRedirect() {
    redirect('/admin/sites');
}
