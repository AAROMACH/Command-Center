# Access Control Audit & Model

Describes the access-control system **as implemented** in code, the conflicts
found during the audit, the consolidation applied, and the resulting effective
access. Update this file when roles, permissions, portal logic, or the route
guard change.

## 1. Layers (source files)

| Layer | File | Enforces | Reads from |
|---|---|---|---|
| Effective permission | `src/lib/permissions.ts` → `hasPermission()` | page & action permissions | `permissionOverrides` (explicit `true`/`false`) → `ROLE_PERMISSIONS[roles]` |
| Portal access | `src/lib/permissions.ts` → `getPortalAccess()` | which portals a user may enter | explicit `portalAccess.{portal}` → else `hasAnyPortalPermission()` (permission-derived) |
| Composite route guard | `src/lib/route-permissions.ts` → `canAccessPath()`, used in `src/components/sidebar-layout.tsx` | direct-URL / refresh / in-app navigation | live user doc (portal + page permission) |
| Nav visibility | `src/components/app-sidebar.tsx` | sidebar items | `hasPermission` per item, within the active portal |
| Edge / middleware | `src/middleware.ts` | portal gate at the edge | `aaromach_portals` cookie (written at login from `getPortalAccess`) |
| Backend data | `firestore.rules` | Firestore reads/writes | `roles[]` / legacy `role` + document ownership |

## 2. Precedence rule (single documented source of truth)

Permissions are the source of truth. Effective access for a route is decided by
`canAccessPath(user, pathname)` in this order:

1. **Portal lock** — `getPortalAccess(user)[portal]`. Explicit
   `portalAccess.{portal}` (an admin-set lock or grant) wins when present;
   otherwise the portal is derived from whether the user holds **any** permission
   in it. If the portal that owns the path is not accessible, access is denied
   regardless of any page permission the role grants. *(Top-level gate.)*
2. **Page permission** — `hasPermission(user, requiredPermissionForPath(path))`.
   `permissionOverrides` (explicit `true`/`false`) override role defaults. Paths
   not in the route map (profile, settings, detail pages) are gated by portal
   access only.
3. **Action permission** — individual buttons/actions call `hasPermission` with
   their specific `portal.page.action` key at the call site.
4. **Backend backstop** — `firestore.rules` enforce role + ownership on every
   read/write, independent of the UI.

`canAccessPath` reads the **live** user document, so portal/permission changes
take effect on the client without waiting for the login cookie to refresh.

## 3. Conflicts found in the audit and how they were resolved

1. **Two axes enforced in different layers that did not compose.** The client
   route guard and nav checked only page permission; portal locks were enforced
   *only* by middleware via the login-time cookie (stale until re-login; bypassed
   entirely if the cookie was missing/malformed). **Resolved:** `canAccessPath`
   composes both axes and is used by the client guard, giving a client backstop
   and live enforcement that agrees with the edge.

2. **Portal access derived from role buckets, contradicting granted pages.** The
   old `getPortalAccess` derived `admin` from `isAdmin()`, which excludes the
   office roles (`sales`, `safety_officer`, `training_coordinator`). Those roles
   hold admin-portal permissions but were denied admin-portal access, so
   middleware bounced them out of every `/admin` route their role granted.
   **Resolved:** portal access is now derived from the permission set
   (`hasAnyPortalPermission`), so it can never contradict the pages a role holds.

3. **Page permissions have no server-side enforcement.** Middleware gates portal
   (cookie) but not page permissions; Firestore rules gate role + ownership but
   not the granular `page.action` keys. A hidden action whose write the user's
   *role* is allowed to make is still callable. **Status:** documented; data the
   role cannot write is still stopped by Firestore. Closing this fully requires
   moving page-permission checks server-side (see Known limitations).

## 4. Known limitations (documented, not yet changed)

- **Cookie staleness / session revocation.** The `aaromach_portals` cookie and
  the session are a ≤24h snapshot from login. `canAccessPath` re-derives from the
  live user doc, so a **revocation** takes effect immediately on the client even
  if the cookie is still permissive; a full server-side revocation (and immediate
  effect of a *grant*, which the stale cookie can still block at the edge until
  re-login) needs a cookie/session refresh mechanism. Deferred.
- **Coarse route permissions.** Several distinct pages share one `.view` key:
  `admin.reports.view` gates Reports **and** Intel (`/admin/analytics`), Company
  Planning, and Service Plans (`/admin/plans`); `admin.assignments.view` also
  gates Assets; `admin.crm.view` also gates Quotes; `admin.clients.view` gates
  `/admin/sites`. Granting one of these grants the others. Splitting them would
  add new permission keys and is left as a follow-up (only add a key when a real
  workflow needs the finer control).
- **`super_admin` now derives access to all three portals** (it holds every
  permission, including `tech.*`/`client.*`). Login routes it via `primaryPortal`
  or the portal picker. Set `primaryPortal` or an explicit `portalAccess` to
  tailor landing behavior.

## 5. Effective access matrix (generated from `ROLE_PERMISSIONS`)

Portal column = permission-derived default (before any explicit `portalAccess`
override). Page columns list the portal pages each role can **view** (via its
`.view` permission and the `route-permissions.ts` map). Actions beyond view
(create/edit/approve/etc.) are governed per-key by `hasPermission`.

### Admin portal roles

| Role | Portal(s) | Admin pages viewable |
|---|---|---|
| `super_admin` | admin, tech, client | **All** pages in every portal |
| `dispatch_admin` | admin | Dashboard, Requests, Dispatch, Schedule, Assignments, Assets, Projects, Directory, Reports/Intel/Company-Planning/Plans, Messages |
| `payroll_admin` | admin | Dashboard, Assignments, Assets, Directory, Financials, Reports/Intel/Company-Planning/Plans |
| `project_manager` | admin | Dashboard, Requests, Assignments, Assets, Schedule, Projects, Directory, Reports/Intel/Company-Planning/Plans |
| `sales` | admin | Dashboard, CRM, Quotes, Projects, Clients (`/admin/sites`), Directory, Reports/Intel/Company-Planning/Plans |
| `safety_officer` | admin | Dashboard, Assignments, Assets, Projects, Directory, Reports/Intel/Company-Planning/Plans (+ Safety events, doc upload) |
| `training_coordinator` | admin | Dashboard, Directory, Reports/Intel/Company-Planning/Plans (+ Certifications, doc upload/approve) |

### Tech portal roles

| Role | Portal(s) | Tech pages viewable |
|---|---|---|
| `project_lead` | tech | Dashboard, Activity, Schedule, Assignments, Projects (+ task create/assign), Logs, Earnings, Messages, Profile |
| `field_technician` | tech | Dashboard, Activity, Schedule, Assignments, Projects (view), Logs, Earnings, Messages, Profile |

### Client portal role

| Role | Portal(s) | Client pages viewable |
|---|---|---|
| `client` | client | Dashboard, Requests (tickets), Clients (`/client/sites`), Quotes, Projects, Messages, Financials, Profile |

Notes:
- "Reports/Intel/Company-Planning/Plans" is one bucket because those four routes
  all require `admin.reports.view` (see Known limitations → coarse permissions).
- `field_technician` differs from `project_lead` only by lacking the project
  task-management actions (`tech.projects.create_task`/`assign_task`/`complete_task`).
- Any role's row can be overridden per user by `permissionOverrides` (page/action)
  and `portalAccess` (portal); explicit overrides win per the precedence rule.
