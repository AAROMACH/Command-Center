# Access Control Audit & Model

Describes the access-control system **as implemented** in code. Update this file
when subroles, permissions, portal logic, or the route guard change.

## 1. Subroles are the single source of portal access

The stored `roles: AppRole[]` field on a user is the **subrole** array (the two
are identical — `roles` was kept as the field name to avoid a live-data
migration). Every subrole belongs to exactly one portal and carries a preset
permission set, both declared in the one central map:

```
src/lib/permissions.ts → SUBROLE_DEFINITIONS
```

- Selecting a subrole **unlocks its portal** and **applies its preset
  permissions**.
- Portal access is derived from subroles **only** — never from individual
  permission overrides and never from a separate `portalAccess` field (that
  authority was removed).
- Removing the last subrole in a portal group removes access to that portal.

```
admin  = user holds any subrole whose portal === 'admin'
tech   = user holds any subrole whose portal === 'tech'
client = user holds any subrole whose portal === 'client'
```

## 2. Layers (source files)

| Layer | File | Enforces | Reads from |
|---|---|---|---|
| Effective permission | `permissions.ts` → `hasPermission()` | page & action permissions | `permissionOverrides` (explicit `true`/`false`) → subrole presets |
| Portal access | `permissions.ts` → `getPortalAccess()` / `hasPortalSubrole()` | which portals a user may enter | selected subroles only |
| Composite route guard | `route-permissions.ts` → `canAccessPath()` | direct-URL / refresh / in-app navigation | live user doc (portal + page permission) |
| Nav visibility | `app-sidebar.tsx` | sidebar items | `hasPermission` per item, within the active portal |
| Edge / middleware | `middleware.ts` | portal gate at the edge | `aaromach_portals` cookie (written at login from `getPortalAccess`) |
| Backend data | `firestore.rules` | Firestore reads/writes | `roles[]` / legacy `role` + document ownership |

## 3. Precedence rules

**Permission** (`hasPermission`):

```
1. individual restriction  (permissionOverrides[perm] === false)  → deny
2. individual addition      (permissionOverrides[perm] === true)   → allow
3. selected subrole presets                                        → allow
4. deny by default
```

An individual **addition grants the action only — it never grants portal
access.** Portal access comes solely from subroles.

**Route** (`canAccessPath`):

1. **Portal lock** — `getPortalAccess(user)[portal]` (subrole-derived). If the
   portal owning the path is not unlocked, access is denied regardless of any
   page permission.
2. **Page permission** — `hasPermission(user, requiredPermissionForPath(path))`.
3. **Action permission** — buttons/actions call `hasPermission` with their
   `portal.page.action` key at the call site.
4. **Backend backstop** — `firestore.rules` enforce role + ownership on every
   read/write, independent of the UI.

`canAccessPath` reads the **live** user document, so subrole/permission changes
take effect on the client without waiting for the login cookie to refresh.

## 4. Primary Portal

`primaryPortal` is **landing only** — it decides which unlocked portal opens
after login and grants no access. Login (`src/app/login/page.tsx`) routes to it
when it is still unlocked, otherwise to the first available portal; with no
subroles at all the user is sent to `pending-approval`. The directory editors
only offer unlocked portals and auto-adjust `primaryPortal` when its portal
loses its last subrole.

## 5. Known limitations

- **Cookie staleness.** The `aaromach_portals` cookie is a ≤24h snapshot from
  login; `canAccessPath` re-derives from the live user doc so a **revocation**
  takes effect immediately on the client, but immediate effect of a fresh
  **grant** at the edge needs a cookie/session refresh (deferred).
- **Coarse route permissions.** Several pages share one `.view` key
  (`admin.reports.view` gates Reports + Intel + Company Planning + Plans;
  `admin.assignments.view` also gates Assets; `admin.crm.view` also gates Quotes;
  `admin.clients.view` gates `/admin/sites`). Splitting them is a follow-up.
- **`admin.logs.*` permissions** exist and are assignable (granted to
  `payroll_admin`/`super_admin`) but the payroll UI still gates its actions on
  the existing `admin.financials.*` keys — full re-wiring is a follow-up.
- **`super_admin` does not imply tech/client access.** It unlocks the admin
  portal only; a tech or client subrole must be added separately.

## 6. Subroles (from `SUBROLE_DEFINITIONS`)

### Admin portal

| Subrole | Preset summary |
|---|---|
| `super_admin` | Full Admin Portal — every admin page, permission management, overrides |
| `dispatch_admin` | Dashboard, Requests, Dispatch (assign/swap/routes), Schedule, Assignments, Projects (view), Directory, Reports, Messages |
| `payroll_admin` | Dashboard, Assignments, Directory, Weekly Logs (view/approve/return/reopen), Financials, Payroll, Reports |
| `project_manager` | Dashboard, Requests, Assignments, Schedule, full Projects lifecycle, Directory, Reports |
| `sales` | Dashboard, CRM (leads/opportunities/quotes/import), Projects (view), Clients (view), Directory, Reports |

### Tech portal

| Subrole | Preset summary |
|---|---|
| `field_technician` | Dashboard, Assignments (confirm/trip/check-in-out/complete/report), Schedule, Projects, Logs (view/create/submit/unsubmit-own/move), Earnings, Messages, Profile |
| `project_lead` | All Field Technician + project task create/assign |

### Client portal

| Subrole | Preset summary |
|---|---|
| `client` | Dashboard, Tickets, Service requests, Projects, Sites, Quotes, Financials, Messages, Profile |

`safety_officer` and `training_coordinator` were removed from the system.

## 7. Weekly-log permission keys

- **Tech:** `tech.logs.view`, `tech.logs.create`, `tech.logs.submit`,
  `tech.logs.unsubmit_own`, `tech.logs.move_assignment`.
- **Admin:** `admin.logs.view`, `admin.logs.approve`, `admin.logs.return`,
  `admin.logs.reopen`, `admin.logs.move_assignment`, `admin.logs.lock`.

A tech may unsubmit only their **own** log, and only while it is Submitted (not
approved, paid, or archived) — enforced in the UI and in `firestore.rules`.
