# Payroll disputes: clear wording and real decisions

**Goal:** when payroll opens a weekly log, every flagged job says exactly what the tech is claiming and what payroll has to decide, and each claim has buttons that actually carry out that decision.

## The problem

In the payroll review dialog, the **Disputed** tab mixes two opposite claims under one label:

| What's in the list | What the tech is saying | What payroll decides |
|---|---|---|
| A job **on** the log that the tech flagged (`items` with `confirmationStatus: 'disputed'`) | "Take this off / fix it": duplicate, not my job, wrong hours, wrong week, not finished | Remove it, fix it, or keep it and pay it |
| A job the tech **added** because it was missing (`missingAssignmentReports`) | "Put this on my log, I did it" | Approve and add the pay, or decline |

Both show up as "disputed", so a duplicate claim and a missing-job claim look alike. Payroll has to read the small print to tell "add this" from "remove this".

**What else is wrong today:**

1. **"Acknowledge" doesn't do anything.** It only marks the job as seen. A disputed job stays unpaid and stays in the list.
2. **There's no "this isn't a duplicate, keep it and pay it" button.** If payroll decides the tech was wrong, there's no way to put the job back into pay from this screen.
3. **Duplicates offer the wrong tools.** The only buttons are "Send back to Dispatch", which would unassign the *real* job, and "Move to History". "Remove this copy from the log" exists in the log tools but isn't offered here.
4. **Missing-job claims count toward pay before anyone approves them.** `computeWeeklyLogSettlement` adds every missing-job report's pay whether or not payroll approved it. For a Manual job, that's whatever amount the tech typed in. (I think this is a real bug and would fix it as part of this work.)
5. **There's no "decline" for a missing-job claim**, for example when the job is already on this log or was already paid in another week.
6. **The tech's dispute options are free text** ("Duplicate entry", "I did not do this job", and so on), so the admin screen can't tailor the wording or the actions.

## What the new layout would look like

Rename the **Disputed** tab to **Needs decision** and split it into two clearly titled sections.

### 1. "Missing from log: tech wants it added"

> Toby says he did this job but it isn't on his log. Check it, set the pay, then approve it or decline it.

- **Approve and add to pay**: opens the pay calculator, as it does today.
- **Decline**, with a reason:
  - "Already on this log" (pick which job)
  - "Already paid in week of …"
  - "Not this tech's job"
  - "Other" (note required)
- **Automatic warning:** if that work order number is already on any of the tech's logs, show "Already on the week of Oct 12" before payroll decides.
- **Pay rule:** it only counts toward pay once approved (fixes item 4 above).

### 2. "On the log: tech wants it removed or fixed"

Each claim gets its own title, a one-line explanation and its own buttons.

| Tech picked | Title payroll sees | Question to answer | Buttons |
|---|---|---|---|
| This is a duplicate | **Possible duplicate** | "Is this the same job as another one on the log?" The matching job is shown beside it. | **Duplicate: remove this copy** (the job itself is untouched) · **Not a duplicate: keep and pay** |
| I didn't do this job / Another tech did it | **Not this tech's job** | "Who should be paid for it?" | **Send back to Dispatch** · **Keep on this tech: pay** · **Close with no pay** (moves to History) |
| Pay / hours are wrong | **Pay correction** | "What should the pay be?" | **Fix pay** (opens the calculator) → marks it resolved |
| Wrong week / date | **Wrong week** | "Which week does it belong to?" | **Move to week …** (existing move tool) · **Keep: it's correct** |
| Job isn't finished | **Not finished** | "Does it need a return visit?" | **Send back to Dispatch for revisit** · **Keep and pay** |
| Other | **Other: read note** | The tech's note | **Keep and pay** · **Remove from log** · **Send back to Dispatch** |

**Every card:**
- Shows the tech's note.
- Shows a "Decided: …" label after a decision, with who decided and when.
- Writes the decision to the audit log.
- Optionally notifies the tech ("Payroll removed the duplicate of WO 18000777").

### 3. Tech side, so both screens use the same words

- **Dispute options become:** "This is a duplicate" · "I didn't do this job" · "Another tech did this job" · "Pay or hours are wrong" · "Wrong week or date" · "Job isn't finished" · "Other".
- **The missing-job button reads "Job missing from my log"**, with a line explaining that payroll will review it before it's paid.
- **The tech sees the decision** on their log: "Kept and paid", "Removed as duplicate", "Declined: already on week of …".

### 4. Post-approval tickets (Payroll audit → Adjustments)

These use the same titles. "Missing job" tickets get Approve and Decline instead of a single "Resolve".

## Data changes (small, no migration)

- **Weekly log items:** add `disputeKind` (`duplicate`, `not_mine`, `pay`, `wrong_week`, `unfinished`, `other`). The existing `disputeReason` text stays. Older disputes are mapped from their text, so no data has to be rewritten.
- **Disputed items and missing-job reports:** add `resolution: { decision, note?, by, at }`.
  - "Keep and pay" clears the dispute, so the job counts toward pay again.
  - "Duplicate: remove" deletes the item from the log (the job itself is untouched).
- **Pay total:** a missing-job report counts toward pay only when `isAudited` (approved).
- **No rule changes expected.** Payroll admins can already update weekly logs. I'll confirm this with the rules emulator.

## Decisions for you

1. **Who decides?** Payroll admins only, or dispatch admins too? Default: payroll and super admin.
2. **Notify the tech** of each decision? Default: yes, in-app only.
3. **Missing-job pay before approval:** stop counting it until approved? Default: yes. This changes the totals on any open logs that have unapproved missing jobs.

## Order of work

1. Pay rule fix (unapproved missing jobs) plus tests on the settlement math.
2. `disputeKind` and `resolution` fields, with mapping for older disputes.
3. Admin "Needs decision" tab: two sections, new cards and buttons.
4. Tech wording, and showing the tech the decision.
5. Post-approval tickets get the same treatment.
6. Run end-to-end on the test data: a duplicate, a not-mine, and a missing job approved and declined.
