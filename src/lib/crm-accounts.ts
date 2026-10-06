import { db } from './firebase';
import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { CrmCompany, CrmContact, CrmContactRole, Lead } from './types';

export const CONTACT_ROLES: { key: CrmContactRole; label: string }[] = [
  { key: 'decision_maker', label: 'Decision Maker' },
  { key: 'influencer', label: 'Influencer' },
  { key: 'technical', label: 'IT / Technical' },
  { key: 'site_contact', label: 'Site / Facilities' },
  { key: 'billing', label: 'Billing / AP' },
  { key: 'other', label: 'Other' },
];
export const contactRoleLabel = (r?: string) => CONTACT_ROLES.find(x => x.key === r)?.label ?? '';

/** Company names compare loosely: case, punctuation and Inc/LLC suffixes ignored. */
export function companyKey(name?: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const emailKey = (e?: string) => (e || '').trim().toLowerCase();

export function findCompany(companies: CrmCompany[], name: string): CrmCompany | undefined {
  const k = companyKey(name);
  return k ? companies.find(c => companyKey(c.name) === k) : undefined;
}

export function findContact(contacts: CrmContact[], companyId: string, c: { name?: string; email?: string }): CrmContact | undefined {
  const email = emailKey(c.email);
  const name = (c.name || '').trim().toLowerCase();
  return contacts.find(x => x.companyId === companyId && (
    (email && emailKey(x.email) === email) || (name && (x.name || '').trim().toLowerCase() === name)
  ));
}

/** Drops undefined/empty-string fields so updates never blank out data. */
function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}

export async function saveCompany(company: Partial<CrmCompany> & { name: string }): Promise<string> {
  const now = new Date().toISOString();
  if (company.id) {
    await updateDoc(doc(db, 'crmCompanies', company.id), { ...company, updatedAt: now });
    return company.id;
  }
  const ref = doc(collection(db, 'crmCompanies'));
  await setDoc(ref, { ...compact(company), id: ref.id, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function saveContact(contact: Partial<CrmContact> & { companyId: string; name: string }): Promise<string> {
  const now = new Date().toISOString();
  if (contact.id) {
    await updateDoc(doc(db, 'crmContacts', contact.id), { ...contact, updatedAt: now });
    return contact.id;
  }
  const ref = doc(collection(db, 'crmContacts'));
  await setDoc(ref, { ...compact(contact), id: ref.id, createdAt: now, updatedAt: now });
  return ref.id;
}

/**
 * Finds or creates the company + primary contact behind a lead's flat fields.
 * Used when a lead is saved, so every deal ends up attached to an account.
 */
export async function resolveLeadAccount(
  lead: Pick<Lead, 'companyName' | 'contactName' | 'contactTitle' | 'contactEmail' | 'contactPhone' | 'industry' | 'website' | 'address'> & { companyId?: string },
  companies: CrmCompany[],
  contacts: CrmContact[],
  owner: { id: string; name?: string },
): Promise<{ companyId: string; contactId?: string }> {
  let companyId = lead.companyId && companies.some(c => c.id === lead.companyId) ? lead.companyId : findCompany(companies, lead.companyName)?.id;
  if (!companyId) {
    companyId = await saveCompany({
      name: lead.companyName.trim(), industry: lead.industry, website: lead.website, address: lead.address,
      ownerId: owner.id, ownerName: owner.name,
    });
  }
  if (!lead.contactName?.trim() && !lead.contactEmail?.trim()) return { companyId };
  const existing = findContact(contacts, companyId, { name: lead.contactName, email: lead.contactEmail });
  if (existing) {
    // Fill gaps on the contact without overwriting what's there.
    const gaps = compact({
      title: existing.title ? undefined : lead.contactTitle,
      email: existing.email ? undefined : lead.contactEmail,
      phone: existing.phone ? undefined : lead.contactPhone,
    });
    if (Object.keys(gaps).length) await saveContact({ ...existing, ...gaps });
    return { companyId, contactId: existing.id };
  }
  const isFirst = !contacts.some(c => c.companyId === companyId);
  const contactId = await saveContact({
    companyId, name: (lead.contactName || lead.contactEmail || '').trim(), title: lead.contactTitle,
    email: lead.contactEmail, phone: lead.contactPhone, isPrimary: isFirst,
  });
  return { companyId, contactId };
}

/**
 * One-time migration: groups existing leads by company name, creates the
 * missing accounts and contacts, and stamps companyId/contactId on each lead.
 * Safe to re-run — anything already linked is skipped.
 */
export async function backfillAccountsFromLeads(
  leads: Lead[],
  companies: CrmCompany[],
  contacts: CrmContact[],
): Promise<{ companies: number; contacts: number; leads: number }> {
  const now = new Date().toISOString();
  const comps = [...companies];
  const conts = [...contacts];
  const stats = { companies: 0, contacts: 0, leads: 0 };
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
  const queue = async (fn: () => void) => { fn(); ops++; if (ops >= 400) await flush(); };

  // Oldest first so the earliest contact becomes the primary one.
  const ordered = [...leads].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  for (const lead of ordered) {
    if (!lead.companyName?.trim()) continue;
    if (lead.companyId && (lead.contactId || !lead.contactName)) continue;

    let company = (lead.companyId && comps.find(c => c.id === lead.companyId)) || findCompany(comps, lead.companyName);
    if (!company) {
      const ref = doc(collection(db, 'crmCompanies'));
      company = {
        ...compact({ industry: lead.industry, website: lead.website, address: lead.address, ownerId: lead.assignedTo, ownerName: lead.assignedToName }),
        id: ref.id, name: lead.companyName.trim(), createdAt: lead.createdAt || now, updatedAt: now,
      } as CrmCompany;
      const data = company;
      await queue(() => batch.set(ref, data));
      comps.push(company);
      stats.companies++;
    }

    let contactId: string | undefined;
    if (lead.contactName?.trim() || lead.contactEmail?.trim()) {
      let contact = findContact(conts, company.id, { name: lead.contactName, email: lead.contactEmail });
      if (!contact) {
        const ref = doc(collection(db, 'crmContacts'));
        contact = {
          ...compact({ title: lead.contactTitle, email: lead.contactEmail, phone: lead.contactPhone }),
          id: ref.id, companyId: company.id, name: (lead.contactName || lead.contactEmail).trim(),
          isPrimary: !conts.some(c => c.companyId === company!.id), createdAt: lead.createdAt || now, updatedAt: now,
        } as CrmContact;
        const data = contact;
        await queue(() => batch.set(ref, data));
        conts.push(contact);
        stats.contacts++;
      }
      contactId = contact.id;
    }

    const companyId = company.id;
    await queue(() => batch.update(doc(db, 'leads', lead.id), { companyId, ...(contactId ? { contactId } : {}) }));
    stats.leads++;
  }
  await flush();
  return stats;
}
