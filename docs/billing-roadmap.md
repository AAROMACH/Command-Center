# Billing, Payments & Accounting Roadmap

Decided Oct 2026. Stripe **collects** money; QuickBooks Online **keeps the books**.
The app is where work, quotes, invoices, plans and pay are created.

## Decisions

| Topic | Decision |
|---|---|
| Collecting payments | **Stripe** — invoice Pay Now links (card + ACH), deposits, subscriptions (Stripe Billing + Customer Portal). |
| Books | **QuickBooks Online** — invoices, Stripe payments + fees, tech bills, expenses posted by the app. |
| Workforce | **Mixed.** 1099 contractors → QuickBooks Vendor + Bill (Bill Pay ACH, 1099-NEC). W-2 employees → QuickBooks Payroll (hours exported as TimeActivity; QuickBooks has no public payroll-run API). Worker type lives on the profile (`accounting.workerType`). |
| Material pricing | **Markup by material category**, set in Service Plans → Pricing. A line can override. |
| Sales tax | **Materials only** (Michigan 6% default, configurable). Labor, travel and plan fees are not taxed. QuickBooks tax codes mirror this. |
| Client identity | **Migrate to `clientId`** on every record. Company-name joins break when a name changes and can't map to a QuickBooks Customer. |
| Service plans | One doc per plan (`servicePlans`), one doc per client subscription (`subscriptions`). Shaped like Stripe Products/Prices so the sync is a mapping, not a redesign. |

## Phases

### Phase 0 — Service plans on real data ✅ (this branch)
- `servicePlans` collection: prices per interval (month/quarter/year), setup fee,
  benefits the app enforces (response hours → SLA, labor discount %, included
  visits, site limit, after-hours), minimum term, draft/active/archived.
- `subscriptions` collection: client (by id), plan, interval, status
  (`pending`, `active`, `past_due`, `paused`, `canceled`), start, next billing
  date, collection method (`manual` now, `stripe` later), price override.
- `adminConfig/pricing`: labor rates, per-category material markup, sales tax.
- Plans page: plans, subscriptions, requests, pricing — no mock data, no PIN
  (access is by role, enforced in firestore.rules).
- Client billing / financials / dashboard and site detail read the same data.
- Starts empty — the old Plans page held no real data. Its leftover
  `adminConfig/servicePricing`, `adminConfig/serviceRates` and
  `adminConfig/plans` (edit PIN) docs are no longer read and can be deleted.

### Phase 1 — Quotes & invoices that work (no outside accounts)
1. Materials catalog feeds quote/invoice lines (cost, category markup, sell price, taxable). CSV price import + price history. Quote shows margin.
2. Plan benefits apply automatically (labor discount on quotes/invoices for subscribed clients).
3. Quote → real invoice (and deposit invoice); sequential invoice numbers.
4. Email quotes/invoices with a PDF (SendGrid — needs `SENDGRID_API_KEY`); overdue reminders.
5. Statuses: sent, viewed, partial, paid (with date), overdue.

### Phase 2 — Client ID migration
- Add `clientId` to projects, work orders, assignments, invoices, quotes, sites, requests; backfill from company name with a review screen for ambiguous matches.
- Switch queries and firestore.rules from `clientName == clientCompany` to `clientId`.

### Phase 3 — Stripe (needs Stripe account)
- Server routes + webhook (`/api/stripe/webhook`, signature-verified).
- Invoice Pay Now (Checkout / payment link), deposits; webhook marks paid + paid date.
- Plans → Stripe Products/Prices; subscriptions with collection `stripe`; Customer Portal for card/cancel; `past_due` from failed payments.

### Phase 4 — QuickBooks (needs QuickBooks Online)
- OAuth connect; map Customers (clientId), Vendors (1099 techs), Items (materials, labor, plans), Classes.
- Push invoices; record Stripe payments to a Stripe clearing account + fee expense; payouts transfer to bank.
- Approved weekly log → Bill for 1099 techs; BillPayment webhook → log Paid. W-2 hours → TimeActivity for payroll.
- Sync-health panel; nightly CDC reconcile.

## Open items
- Deploy `firestore.rules` from this branch.
- Confirm Michigan tax treatment of plan fees and travel with the accountant.
