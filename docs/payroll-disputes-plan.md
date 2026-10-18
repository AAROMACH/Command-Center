# Payroll disputes: simple version

**Rule:** every flagged job asks payroll **one yes/no question**. Each button says in plain words what will happen. Nothing is paid or removed without a click.

## What payroll sees

The **Disputed** tab becomes **Needs a decision (3)**. Each flagged job is one card with the same layout:

> **Toby Tech · WO 18000777 · Week of Oct 12**
> Toby says: **"This job is missing from my log."**
> *His note: "Did the Lakeside camera swap Tuesday."*
>
> **Did Toby do this job?**
> [ **Yes: add it and pay him** ]  [ **No: don't pay it** ]

## The only four card types

Techs choose from four options, so payroll only ever sees four questions:

| Tech says | Question payroll answers | Yes does | No does |
|---|---|---|---|
| **Missing from my log** | Did they do this job? | Adds it to the log and opens the pay box | Leaves it off the log; asks for a short reason |
| **This is a duplicate** | Is it the same job twice? (both copies shown side by side) | Removes the extra copy; the real job stays and is paid | Keeps both and pays both |
| **I didn't do this job** | Did someone else do it? | Takes it off their log and sends it back to Dispatch | Keeps it on their log and pays it |
| **Pay or date is wrong** | Is the tech right? | Opens the pay or week box to fix it | Keeps it as it is |

The tech's note (for example "Wrong date" or "hours off") always shows on the card. There is no separate "Other" category.

## Guardrails

1. **The app checks first.** It shows "⚠ This job is already on Toby's week of Oct 5" or "⚠ No matching job found" on the card, so payroll doesn't have to dig.
2. **Every click is confirmed in plain words.** For example: "Remove the extra copy of WO 18000777 from Toby's week of Oct 12? He'll still be paid once for this job."
3. **"No" needs a short reason**, so the tech can see why.
4. **The log can't be approved while any card is undecided.** The Approve button says "Decide the 2 flagged jobs first".
5. **Unapproved jobs aren't counted toward pay** until payroll says Yes. This fixes a current bug where missing jobs count toward pay before anyone checks them.
6. **Decisions can be changed** until the log is approved, with a "Change decision" link on the card.
7. **Everything is recorded:** who decided, when, and why. The tech sees the result on their log, e.g. "Payroll: removed duplicate copy".

## What goes away

These old buttons are removed because they were confusing:
- **"Acknowledge"**, which did nothing.
- **"Send back to Dispatch" on duplicates**, which would have unassigned the real job.
- **"Move to History"**, which is replaced by the clear Yes/No outcomes.

## Build order

1. Pay fix plus the block on approving a log with undecided cards.
2. The four card types with Yes/No buttons, confirmations and auto-checks.
3. The tech side: four options and the decision shown on their log.
4. Post-approval tickets use the same cards.

## Defaults (change any of these)

- **Who decides:** payroll admins and super admins.
- **The tech gets an in-app notice** of each decision.
