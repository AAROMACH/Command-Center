/**
 * Where a notification opens, by portal and related entity. Used by the bell
 * and by phone push notifications (lib/server/push.ts), so a tap lands on the
 * same page either way.
 */
export type LinkPortal = 'admin' | 'tech' | 'client' | 'sales';

export function entityHref(portal: LinkPortal, type?: string, id?: string): string {
  if (!type || !id) return '';
  if (type === 'project') return portal === 'tech' ? `/tech/projects/${id}` : portal === 'client' ? '/client/projects' : portal === 'admin' ? `/admin/projects/${id}` : '';
  if (type === 'assignment') return portal === 'tech' ? `/tech/assignments/${id}` : portal === 'admin' ? `/admin/assignments/${id}` : '';
  if (type === 'request') return portal === 'admin' ? '/admin/requests' : portal === 'client' ? '/client/tickets' : '';
  if (type === 'lead') return portal === 'sales' ? '/sales/pipeline' : portal === 'admin' ? '/admin/crm' : '';
  if (type === 'weeklyLog') return portal === 'tech' ? '/tech/logs' : portal === 'admin' ? '/admin/payroll/audit' : '';
  // id is "dm:<sender uid>" or "project:<project id>" — opens that conversation.
  if (type === 'message') {
    if (portal === 'sales') return '';
    const [kind, ref] = id.split(':');
    // Older alerts saved the bare message id: ?msg= makes the page look it up.
    const q = ref && (kind === 'dm' || kind === 'project') ? `?${kind}=${encodeURIComponent(ref)}`
      : !ref && kind ? `?msg=${encodeURIComponent(kind)}` : '';
    return `/${portal}/messaging${q}`;
  }
  if (type === 'user') return portal === 'admin' ? `/admin/directory/${id}` : '';
  return '';
}
