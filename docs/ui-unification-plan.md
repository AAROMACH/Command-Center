# UI Unification Plan

Goal: one professional, consistent look across every page and portal (Admin,
Tech, Client, Sales, public forms) — without changing how features work.

Based on a code survey (Oct 2026). Counts are from `src/**/*.tsx`.

## Where we are

| Area | Today | Problem |
|---|---|---|
| **Color tints** | ~700 classes like `bg-brand-red/10`, `border-text-green/30` | **Render nothing.** Theme colors are `var(--hex)`, which Tailwind can't fade, so every tinted badge, card edge and highlight is silently missing. |
| **Undefined colors** | `text-amber`, `border-gold-border` (~90 uses, incl. Badge variants) | No CSS generated. |
| **Pill tabs** | 49 `TabsTrigger className="tab"` | Active style keys off `.active`, Radix sets `data-state` → selected tab never highlights red. |
| **Tabs** | 7 different tab styles, 6 `<style jsx global>` blocks redefining them | Every page's tabs look different. |
| **Text size** | 6–9px text used ~1,560 times (admin 1,183); `text-xs`+ only ~750 | Hard to read; looks cramped, not professional. |
| **Shouting** | `uppercase` 3,420 · `tracking-widest` 1,529 · `font-black` 1,107 | Everything is all-caps bold, so nothing stands out. Buttons are uppercase by default. |
| **Surfaces** | 111 `<Card>` vs ~90 hand-rolled divs; 6 radius sizes; 6 shadow levels | Cards don't match page to page. |
| **Buttons** | 9 different heights (h-5 → h-14); 164 raw `<button>`s | Inconsistent hit areas, especially on phones. |
| **Tables** | shadcn `Table` (40) + raw `.tbl` (11); 30 different header styles; `.tbl` centers every cell | Tables look different everywhere. |
| **Status colors** | "Completed" badge is blue, green elsewhere; "Submitted" pay is grey / gold / blue on three pages; map pins disagree | Same status, different color. |
| **Headers** | 46 pages use the shared header; Archives, calendars, detail pages, projects use custom ones | Page tops look different. |
| **Loading / empty** | 70 spinners with "Initializing Terminal…" style text; 7 skeletons; 156 empty messages, mostly uppercase/italic | Inconsistent and jargon-heavy. |
| **Dialogs** | 29 different widths; 4 title sizes | Pop-ups feel unrelated. |
| **Copy** | ~150 visible "Registry / Terminal / Mission / Operative / Protocol / Manifest" labels, incl. nav ("Field Terminal") | Reads like a game, not a field-services company. |
| **Palette leaks** | 265 raw Tailwind colors (amber, blue, purple, sky…) + 37 hex | Off-brand colors; dark mode breaks. |

Good news: a shared system already exists (`page-header`, `page-title`, `.tabs`,
`table-wrap`, `ListPager`, `Card`, `Badge`) and ~45 pages use the header. We
extend and enforce it rather than starting over.

## Design direction (proposed defaults — confirm in "Decisions")

- **Tone:** clean, calm operations software. Brand red for primary actions and
  alerts only; neutrals everywhere else.
- **Type scale:** body 13–14px; secondary 12px; labels/captions 11px minimum;
  page title 22–24px. **No text under 11px** (10px only for table headers and
  badges).
- **Casing:** sentence case for body, buttons and titles. UPPERCASE only for
  eyebrows, table headers, badges and tab labels — with normal tracking
  (0.04–0.08em), never `tracking-widest` on body text. `font-black` only for
  big numbers.
- **Shape:** cards `rounded-xl`, controls `rounded-md`, pills `rounded-full`.
- **Elevation:** cards `shadow-sm`, popovers `shadow-md`, dialogs `shadow-xl`.
- **Density:** controls h-9 (default) / h-8 (compact, tables) / h-10 (primary on
  mobile). 40px minimum touch target on phones.
- **Status colors:** one map, used by every badge, chart and map pin:
  | Meaning | Color |
  |---|---|
  | Done / approved / paid | green |
  | In progress / submitted / waiting | gold |
  | Scheduled / draft / neutral | grey |
  | Problem / disputed / overdue / missed | red |
  | Informational / imported | blue |

## Phases

### Phase 0 — Fix the foundation (no redesign; ~1 day)
Makes existing styles actually render. Low risk, big visible win.
1. Redefine theme colors as RGB channels (`--brand-red-rgb: 204 34 0`, Tailwind
   `rgb(var(--brand-red-rgb) / <alpha-value>)`) so the ~700 tint classes work.
2. Define the missing `amber` / `gold-border` tokens (or map them to
   `accent-gold`).
3. `.tab[data-state=active]` so pill tabs highlight.
4. One `STATUS_STYLES` map in `lib/status-styles.ts`; Badge `completed` → green.
5. Build + screenshot check of key pages in light and dark.

### Phase 1 — Tokens and primitives (~2 days)
1. Type tokens in `globals.css`: `.text-caption` (11px), `.text-label`,
   `.text-body`, `.text-title`, `.text-display`; retire 6–9px utilities in the
   component classes (`field-label`, `ts-*`, `job-*`, `pdh-*`).
2. Button: sentence case by default, sizes `sm` h-8 / `default` h-9 / `lg` h-10;
   remove per-call height overrides over time.
3. Input / Select / Textarea: one height (h-9), one label style.
4. Badge: variants driven by `STATUS_STYLES`; add `<StatusBadge kind="job|log|pay|request|invoice" value=…/>`.
5. Tabs: two variants only — **Pills** (page-level sections) and **Underline**
   (inside a detail page/dialog) — as `<Tabs variant=…>`; delete the six
   `<style jsx global>` tab blocks and inline `tabTriggerClass` strings.
6. Dark-mode audit of every token.

### Phase 2 — Shared building blocks (~3 days)
Replace hand-rolled patterns with components so pages can't drift:
- `PageHeader` (eyebrow, title, subtitle, actions slot, optional back link)
- `Section` (title + description + actions)
- `StatCard` / `StatGrid` (KPI tiles — dashboards, Intel, Activity, payroll)
- `DataTable` (shadcn Table + toolbar + `FilterBar` + `ListPager` + empty /
  loading rows + mobile column hiding + CSV export hook) — generalizes the
  Archives / Intel tables
- `FilterBar` (from Archives) for every list page
- `EmptyState` and `LoadingState` (skeleton rows, plain text: "Loading jobs…")
- `DialogShell` (sizes sm / md / lg / full; standard header and footer)
- `ChartCard` (ChartContainer + status colors + tooltip)

### Phase 2b — List controls that work the same on every page (~3 days)
Every list or table page (jobs, assignments, requests, projects, clients,
sites, directory, CRM, quotes, invoices, assets, plans, weekly logs, payroll,
tech and client lists) gets the same toolbar from `DataTable`, and each control
must actually work — verified per page, not assumed.

| Control | Standard behavior |
|---|---|
| **Search** | One box, matches every visible text column (IDs incl. Field Nation #, title, client, location, tech names); debounced; resets to page 1; "×" to clear. |
| **Sort** | Sort menu and clickable column headers; asc/desc toggle; correct for dates in either format (MM-DD-YYYY / YYYY-MM-DD), numbers and text; remembered per page. |
| **Filters** | Filter popover + chips showing what's on; accurate active count; one **Reset**; options built from real values (no option that can never match); remembered per page. |
| **Column filters** | Filter icon on filterable column headers (status, client, tech, type, date) — same logic as the popover, so the two never disagree. |
| **Date range** | One picker, same presets everywhere (Today, This week, Last 30 days, This month, Custom). |
| **Select all / bulk actions** | Header checkbox selects the **filtered** rows (with "Select all N matching" when paged); selection clears when filters change so hidden rows are never acted on; bulk bar shows the count and the actions. |
| **Pagination** | `ListPager` everywhere a list can exceed ~25 rows; resets on search/filter change. |
| **Export CSV** | Exports every row matching the filters (not just the page), same columns as the table plus IDs. |
| **Empty / no-match** | "No jobs match these filters" + Reset button, distinct from "No jobs yet". |
| **Mobile** | Toolbar collapses to Search + Filters button + Sort; no control hidden on phones without an alternative. |

Each page gets a checklist row in the audit table below (built from a code
trace), and is only marked done when every control on it passes.

<!-- LIST-CONTROLS-AUDIT -->

### Phase 3 — Migrate pages, highest traffic first (~1–2 weeks)
Each page: swap to the building blocks, apply the type scale, fix copy. No
behavior changes; one portal per PR so review stays manageable.

1. **Tech portal** (phones in the field): dashboard, assignments, logs (worst
   offender), calendar (custom header/tabs), projects, earnings, activity,
   messaging, profile, settings.
2. **Admin core:** dashboard, dispatch, assignments, requests, projects,
   Archives (custom header), Intel, calendar, directory + profile, payroll audit.
3. **Admin secondary:** CRM, quotes, assets, clients, sites, plans, financials,
   company planning, settings.
4. **Client portal:** dashboard (raw chart), messaging, profile, the rest are
   close already.
5. **Sales portal:** inherits Admin CRM/quotes pages — fixed by step 3.
6. **Public + auth:** login, get-access, forgot-password, service request,
   client intake.
7. **Shared dialogs:** job detail, payroll review, check-in, new job / project /
   request dialogs (the copy-pasted "Client Registry / Close Terminal" trio).

### Phase 4 — Copy and polish (~2 days)
- Plain field-services wording everywhere, including nav ("Field Terminal" →
  "Tech Portal"), loading and empty states.
- Consistent dates (`Oct 6, 2026` / `10/06/2026` in tables), money and phone
  formatting helpers.
- Accessibility: contrast on muted text, focus rings, 40px touch targets,
  `aria-label` on icon buttons.
- Final light/dark and phone/tablet/desktop pass with screenshots.

### Phase 5 — Keep it consistent
- A grep check in CI (or a small ESLint rule) that fails on `text-[6-9px]`,
  raw palette colors (`text-blue-400`…), `<style jsx global>` and arbitrary hex.
- An internal `/admin/style-guide` page showing every component and status
  color, for reference when building new features.
- Short "how we build pages" section in the repo README.

## How we'll verify
- Before/after screenshots of each migrated page (light + dark, phone + desktop).
- `next build` and typecheck on every PR; no logic diffs in a styling PR.
- Counts tracked per phase (tiny-text uses, palette colors, tab variants,
  jargon words) so progress is measurable, not vibes.

## Decisions needed
1. **Casing:** sentence case for buttons/titles (recommended), or keep the
   all-caps look in a softer form?
2. **Density:** comfortable (recommended for field use) or compact like today?
3. **Brand red:** primary actions + alerts only (recommended), or keep it as
   the accent on headers/tabs too?
4. **Nav names:** keep "Intel", "Archives", "Dispatch Hub", or rename to plain
   labels ("Insights", "History", "Dispatch")?
5. **Dark mode:** keep both themes first-class (recommended), or light-first?
6. **Order:** Tech portal first (recommended — it's used on phones daily), or
   Admin first?
