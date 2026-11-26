'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Technician } from '@/lib/types';

/** Everyone who works here — the roles that aren't 'client'. */
const STAFF_ROLES = [
  'super_admin', 'dispatch_admin', 'payroll_admin',
  'project_manager', 'project_lead', 'field_technician', 'sales',
];

/** Name, title, email and phone of one of our people, for a stored snapshot. */
export type StaffBrief = {
  id: string;
  name: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
};

export const staffBrief = (u: Technician): StaffBrief => ({
  id: u.id,
  name: u.name || '',
  jobTitle: u.jobTitle || null,
  email: u.email || null,
  phone: u.phone || null,
});

/**
 * Picks one of our own people — the account manager on a client, or who owns
 * a contact at that client. Loads the staff list itself so callers don't each
 * repeat the query; admins are the only ones who can read other user docs
 * (firestore.rules), which is who sees these fields.
 *
 * `onChange` hands back the full record as well as the id, so a caller that
 * needs to store a display snapshot has the details without another read.
 */
export function StaffPicker({ value, onChange, onResolve, className, placeholder = 'Nobody yet', allowNone = true, noneLabel = 'Nobody yet' }: {
  value: string | null | undefined;
  onChange: (id: string, staff: Technician | null) => void;
  /** The record the current `value` points at, once the list has loaded.
   *  Lets a caller keep a stored snapshot fresh without its own read. */
  onResolve?: (staff: Technician | null) => void;
  className?: string;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [staff, setStaff] = useState<Technician[]>([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'users'), where('roles', 'array-contains-any', STAFF_ROLES)),
    snap => setStaff(
      snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
        // Someone who has left shouldn't be offered, but stays selected if
        // they already are, so an old record never looks empty.
        .filter(u => u.accountStatus !== 'inactive' || u.id === value)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    ),
    () => setStaff([]),
  ), [value]);

  // Report who the saved id points at, so a snapshot of their details can be
  // rewritten on every save instead of going stale after a phone change.
  useEffect(() => {
    if (!onResolve) return;
    if (!value) { onResolve(null); return; }
    const found = staff.find(s => s.id === value);
    if (found) onResolve(found);
  }, [value, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Select value={value || '__none'} onValueChange={v => onChange(v === '__none' ? '' : v, staff.find(s => s.id === v) || null)}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="bg-bg-elevated border-border-main">
        {allowNone && <SelectItem value="__none">{noneLabel}</SelectItem>}
        {staff.map(u => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
