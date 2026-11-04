import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { hasPermission, isAdmin, isClient, type RoleLike } from '@/lib/permissions';
import type { Technician } from '@/lib/types';

/**
 * In-app clients and their sites, for the site walk's customer and address
 * pickers. Techs can't read `users` or `sites` directly (those hold pay,
 * codes and other private fields), so this returns only what a walk needs:
 * company, contact name, email and phone, and each site's name and address.
 * Field Nation customers (free-text names on imported jobs) aren't clients
 * and aren't included.
 *
 * Who may call it: anyone who can create site walks (techs), review them
 * (sales / super admin), or any admin.
 */

export type WalkClient = { id: string; company: string; name: string; email: string; phone: string };
export type WalkSite = { id: string; clientId: string; name: string; location: string };

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try { uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid; }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const fs = getFirestore(adminApp);
  const me = await fs.collection('users').doc(uid).get();
  const caller = { ...(me.data() || {}), id: uid } as Technician & RoleLike;
  if (!me.exists || !(isAdmin(caller) || hasPermission(caller, 'tech.site_walks.create') || hasPermission(caller, 'admin.crm.review_site_walk'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [users, sites] = await Promise.all([fs.collection('users').get(), fs.collection('sites').get()]);
  const clients: WalkClient[] = users.docs
    .map(d => ({ id: d.id, u: d.data() as Technician & { accountStatus?: string; status?: string } }))
    .filter(({ u }) => isClient(u) && u.accountStatus !== 'inactive' && u.status !== 'inactive')
    .map(({ id, u }) => ({ id, company: u.clientCompany || u.name || '', name: u.name || '', email: u.email || '', phone: u.phone || '' }))
    .filter(c => c.company)
    .sort((a, b) => a.company.localeCompare(b.company));
  const ids = new Set(clients.map(c => c.id));
  const byCompany = new Map(clients.map(c => [c.company.trim().toLowerCase(), c.id]));
  const walkSites: WalkSite[] = sites.docs
    .map(d => ({ id: d.id, s: d.data() as { name?: string; location?: string; clientId?: string; clientName?: string; status?: string } }))
    .filter(({ s }) => s.status !== 'inactive')
    .map(({ id, s }) => ({ id, clientId: (s.clientId && ids.has(s.clientId) ? s.clientId : byCompany.get((s.clientName || '').trim().toLowerCase())) || '', name: s.name || '', location: s.location || '' }))
    .filter(s => s.clientId && (s.name || s.location));
  return NextResponse.json({ clients, sites: walkSites });
}
