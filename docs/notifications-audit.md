# Notifications audit

What the app tells people, who hears it, and what changed (October 2026).

## How it works now

- **Admin alerts stay in the Admin Portal; tech alerts stay in the Tech Portal.** Someone with both (for example a super admin who also works jobs) sees only admin alerts in the Admin Portal bell and only their own job alerts in the Tech Portal bell. Client and sales alerts work the same way.
- **Nobody is alerted about something they did themselves.**
- **Routine** = in-app bell only, never emailed or texted. **Full** = bell plus email/text, depending on each person's notification settings.
- "Ops admins" = super admin + dispatch admin. "Payroll" = super admin + payroll admin. "PMs" = project managers (they use the Tech Portal).
- Older alerts, sent before this change, are sorted into the right portal by their title where possible; anything else still shows in every portal, so nothing already sent disappears.

## Admin alerts (Admin Portal)

| Alert | When | Who | Routine? | Status | Why |
|---|---|---|---|---|---|
| New client request | A client submits a service ticket | Ops admins | Full | Changed (new) | Was missing — clients' tickets reached nobody |
| New site request | A client asks to add a site | Ops admins | Routine | Changed (new) | Needs approval; also counted in the top alert band |
| New service request | An admin logs a request in Dispatch | Other ops admins | Routine | Changed | Was "Urgent Intake Ticket" emailed to every admin, including the one who logged it |
| Job completed | Lead tech completes a job | Ops admins | Full | Kept | Key event |
| Helper finished | A helper completes their part | Ops admins | Routine | Changed | Was emailed; the lead's "Job completed" is the one that matters |
| Tech checked in (lead or helper) | Every check-in | — | — | Removed | Emailed/texted on every tap; "On site now" in the alert band shows it live |
| Payroll dispute filed | Tech files a payroll dispute | Payroll | Full | Changed | Now links to the weekly log |
| Job disputed on weekly log | Tech disputes a job on their draft log | Payroll | Routine | Changed (new) | Was missing; also summed up when the log is submitted |
| Missing job reported | Tech reports a job missing from their log | Payroll | Routine | Changed (new) | Was missing; also in the submission summary |
| Reimbursement requested (on log) | Tech adds a reimbursement to their draft log | Payroll | Routine | Changed (new) | Was missing; also in the submission summary |
| Reimbursement / mileage requested | Tech submits a receipt or mileage from Earnings | Payroll | Full | Changed (new) | Was missing |
| Weekly log submitted | Tech submits their week | Payroll | Full | Changed (new) | Was missing. Lists jobs, total, and anything needing review (disputes, reimbursements, missing jobs) |
| Log reopen requested | Tech asks payroll to reopen a submitted log | Payroll | Full | Changed (new) | Was missing; needs action |
| Time-off request | Tech requests time off | Ops admins | Full | Changed (new) | Was missing |
| Access request | Someone signs up (email or Google) | Ops admins | Full | Changed (new) | Was missing; sent once per account |
| Project tasks complete | Last task on a project is checked off | Ops admins | Full | Changed (new) | Was PM-only; admins need it to close out |
| New project from sales | A deal is handed off to ops | Ops admins | Full | Kept | Key event |
| Deal won | A deal is won without a project yet | Ops admins | Full | Kept | Key event |
| Sold projects waiting on kickoff | Daily CRM digest | Ops admins | Full | Kept | Daily summary |

## Tech alerts (Tech Portal)

| Alert | When | Who | Routine? | Status | Why |
|---|---|---|---|---|---|
| New job assigned | Job assigned or swapped to a tech (Dispatch, job page, job panel, job table) | That tech | Full | Changed | Was sent only from the Dispatch board; now from every place a job is assigned |
| Job removed from your schedule | Job swapped away or unassigned | The previous tech | Full | Changed (new) | Was missing |
| Job rescheduled | Date or time changed, same tech | That tech | Full | Changed (new) | Was missing |
| Weekly log approved / rejected / returned | Payroll acts on the log | That tech | Full | Changed (new) | Was missing |
| Weekly log reopened | Payroll approves the tech's reopen request | That tech | Full | Changed (new) | Was missing |
| Payroll dispute resolved | Payroll resolves a dispute | That tech | Full | Changed (new) | Was missing |
| Reimbursement approved | Payroll approves (log or Earnings) | That tech | Routine | Changed (new) | Good news; no email needed |
| Reimbursement rejected | Payroll rejects (log or Earnings) | That tech | Full | Changed (new) | Was missing |
| Time off approved / not approved | Admin decides in Directory | That tech | Full | Changed (new) | Small gap, wired cleanly |
| Task(s) assigned to you | Admin assigns project tasks | That tech | Full | Kept | Key event |
| Added to a project | Admin adds a tech to a crew | That tech | Full | Kept | Key event |
| Removed from a project | Admin removes a tech from a crew | That tech | Full | Changed (new) | Was missing |
| Announcements | Admin broadcast | Chosen portal | — | Kept | Unchanged |

## Project Manager alerts (Tech Portal)

| Alert | When | Routine? | Status | Why |
|---|---|---|---|---|
| New project from sales | Deal handed off | Full | Kept | PMs staff it |
| Project status changed / closed | Admin changes status | Full | Kept | Key event |
| Project tasks complete | Last task done | Full | Kept | Close-out |
| Task completed | Any task checked off | Routine | Kept | PMs track progress; bell only |
| Crew checked in | Crew member checks in on a project | Routine | Kept | Bell only |
| Crew checked out | Crew member checks out | — | Removed | Noise; check-in and the daily log cover it |
| Crew updated / Document added | Admin edits crew or adds a file | Routine | Kept | Bell only |

## Client and sales alerts

| Alert | Who | Status | Why |
|---|---|---|---|
| New assignment staged | Client (Client Portal) | Kept | Tells the client work is scheduled |
| Your CRM day (daily digest) | Deal owner (Sales Portal, or Admin Portal if they have no sales role) | Kept | Daily summary |
| Quote approved / rejected | Deal owner | Kept | Key event |

## Gaps not wired yet

- **The bell only appears on the dashboards** (Admin, Tech, Client). The Sales Portal has no bell, so sales alerts are only seen by email/text. Adding the bell to the shared page header would fix this.
- **Public intake form** (`/public/client-intake`) is filled out by people who aren't signed in, so it can't send an alert yet. It needs a small server endpoint.
- **Clients aren't told when their request changes status** (accepted, scheduled, closed).
- **Helpers aren't told when they're added to or removed from a job**, and nobody is alerted when a tech cancels or a job runs late. Each needs a decision on who should hear it.
- **No alert to a new user when their account is approved.**
- **Document uploads by techs** (W-9, certifications) awaiting approval don't alert admins; they rely on the Directory.
