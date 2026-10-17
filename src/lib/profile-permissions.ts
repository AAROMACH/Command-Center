import type { Technician } from './types';
import { isAdmin, hasPermission, getSubroles } from './permissions';

// Fields a user may edit on their own profile (no admin required)
export const SELF_EDITABLE_FIELDS = [
  'name', 'preferredName', 'phone', 'address', 'currentLocation',
  'avatarUrl', 'photoURL', 'emergencyContact', 'availability', 'skills',
] as const;

// Fields that require admin access to modify
export const ADMIN_ONLY_FIELDS = [
  'roles', 'role', 'portalAccess', 'primaryPortal', 'permissionOverrides',
  'reliabilityScore', 'reliabilityTier', 'approvalStatus', 'accountStatus',
  'hourlyRate', 'payoutPreferences', 'adminNotes', 'email',
  'certifications', 'serviceArea', 'jobTitle', 'department',
  'approvedAt', 'approvedBy', 'deniedAt', 'deniedBy', 'denialReason',
  'updatedBy', 'accounting',
] as const;

/** Can currentUser edit targetUser's profile at all? */
export function canEditUserProfile(
  currentUser: Technician | null | undefined,
  targetUser: Technician | null | undefined,
): boolean {
  if (!currentUser || !targetUser) return false;
  if (isAdmin(currentUser)) return true;
  return currentUser.id === targetUser.id;
}

/** Can currentUser edit admin-only protected fields on any user? */
export function canEditProtectedUserFields(
  currentUser: Technician | null | undefined,
): boolean {
  if (!currentUser) return false;
  return isAdmin(currentUser) || hasPermission(currentUser, 'admin.directory.manage');
}

/** Can a non-admin user edit this specific field on their own profile? */
export function canEditOwnProfileField(fieldName: string): boolean {
  return (SELF_EDITABLE_FIELDS as readonly string[]).includes(fieldName);
}

/** Returns the field names currentUser is allowed to write on targetUser */
export function getEditableProfileFields(
  currentUser: Technician | null | undefined,
  targetUser: Technician | null | undefined,
): string[] {
  if (!currentUser || !targetUser) return [];
  if (canEditProtectedUserFields(currentUser)) {
    return [
      ...SELF_EDITABLE_FIELDS,
      ...ADMIN_ONLY_FIELDS,
      'clientCompany', 'businessType', 'billingDetails',
    ];
  }
  if (currentUser.id === targetUser.id) {
    return [...SELF_EDITABLE_FIELDS];
  }
  return [];
}

// These two mirror firestore.rules (accessKeys / payKeys on users) so the UI
// locks exactly what the rules would reject.

/** Subroles, portal and permission overrides — super admin only. */
/**
 * Roles any admin may grant (approve a sign-up, add a tech or client).
 * Admin roles and permission overrides stay super-admin only — mirrors
 * nonAdminRoles() in firestore.rules.
 */
export const NON_ADMIN_ROLES: string[] = ['client', 'field_technician', 'project_lead', 'sales'];

export function canEditUserAccess(currentUser: Technician | null | undefined): boolean {
  return getSubroles(currentUser).includes('super_admin');
}

/** Pay rate, payout method and the tax/QuickBooks profile — payroll or super admin. */
export function canEditUserPay(currentUser: Technician | null | undefined): boolean {
  return getSubroles(currentUser).some(r => r === 'super_admin' || r === 'payroll_admin');
}
