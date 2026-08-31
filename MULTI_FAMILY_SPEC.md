# CHECKMATE — Multi-Family Beta Specification v1.0 · August 2026

Companion to [SPEC.md](SPEC.md), which remains the source of truth for how the app behaves. This document covers a different question: how Checkmate stops being one family's private tool and becomes something a handful of other homeschooling families can log into safely, without your family's data, access, or daily use being put at risk in the process.

Decisions locked in for this spec (confirmed with the user 2026-08-31):

- **Multi-tenant, single deployment.** One Railway app, one Postgres database, shared by every family. Not "each family deploys their own copy."
- **You host and pay for everyone.** No family sets up their own Railway account.
- **Blue Ridge Academy-specific features (attendance, 4-category work samples, learning periods, "HST" report) become an optional, configurable module** — not ripped out, not left hardcoded.
- **Scale for now: a handful of friend families**, added by you, informally. But the architecture should not have to be redone if this later becomes a paid product for strangers — it should just stay small in scope, not small in ambition.

This is a real architecture change, not a config flag: today there is no `Family` model at all. Every table is implicitly "the one family," access is one password from an environment variable, and `Student.name` / `Subject.name` are globally unique. Treat this as seriously as SPEC.md's original build — phase by phase, committing after each phase, per [CLAUDE.md](CLAUDE.md).

**Standing constraint across every phase:** your own family is a live production user of this app right now. No phase may break their login, their data, or their daily routine. Where a phase touches production data, it must include a backfill/migration step that leaves your family exactly where they are today, invisibly, before anything new is exposed.

---

## Phase 1 — Tenant foundation: the `Family` model and data scoping

Add the tenant model everything else hangs off:

```
model Family {
  id        String   @id @default(cuid())
  name      String   // "The Chernovs" — display name, shown in Parent Mode
  slug      String   @unique // reserved for a future per-family URL; unused in v1 login flow
  createdAt DateTime @default(now())
  plan      String   @default("beta") // free-text now ("beta"); becomes a real enum when billing exists
}
```

Add `familyId` (FK, `onDelete: Restrict`) to every model that is currently implicitly single-family: `Student`, `Subject`, `Project`, `ProjectIdea`, `AssignmentSeries`, `AssignmentInstance`, `SchoolDay`, `LearningPeriod`, `DaySeparator`, `FamilyCalendarSettings`, `DismissedCalendarEvent`, `CalendarEventAssignment`, `UndoLogEntry`. (`RecurrenceRule` and `RemovedOccurrence` stay scoped indirectly through their series — no direct `familyId` needed there.)

Convert global uniqueness to per-family uniqueness:
- `Student.name @unique` → `@@unique([familyId, name])`
- `Subject.name @unique` → `@@unique([familyId, name])`
- `FamilyCalendarSettings` (today a true singleton table) → `@@unique([familyId])`, one row per family instead of one row ever.

**Migration, in order:**
1. Add `Family`, insert exactly one row for your existing family.
2. Add `familyId` columns as nullable, backfill every existing row with that one family's id, then make the columns required.
3. Add the new `@@unique` constraints.
4. Verify row counts and spot-check the app end-to-end against production data before moving on — this is the step where a mistake would actually hurt your family, not a hypothetical new one.

**Exit criteria:** the schema supports many families; exactly one exists; your family's app behaves identically to today.

## Phase 2 — Real auth: per-family login instead of one shared env-var password

Today `FAMILY_PASSWORD` and `PARENT_PASSCODE` are single global secrets in environment variables ([src/app/gate/actions.ts](src/app/gate/actions.ts), [src/app/parent/unlock/actions.ts](src/app/parent/unlock/actions.ts)) — that model breaks the moment a second family exists, since they'd all share your family's password.

- Add hashed secrets to `Family`: `accessCodeHash`, `parentPasscodeHash` (bcrypt/scrypt, never plaintext — same spirit as today's `secretsMatch`, but hashed at rest instead of an env-var string comparison).
- Login (`/gate`) becomes: family identifier (simplest for a handful of friends — a short family code or name picker, not email/password) + access code → looks up the matching `Family`, verifies the hash.
- The session cookie changes from a boolean "family gate passed" flag to a signed token carrying `familyId`. Parent Mode's passcode check becomes per-family the same way.
- **Every existing data query and mutation across the app must be scoped to the session's `familyId`.** This is the largest-surface-area item in the whole spec — dozens of `actions.ts`/`page.tsx` files currently query `Student`, `AssignmentInstance`, etc. with no family filter at all, because there was only ever one family.
  - Don't rely on remembering to add `.where({ familyId })` in every call site by hand — that's exactly the kind of thing one missed spot turns into one family seeing another family's kids' assignments. Build a single **Prisma Client Extension** that reads the current request's `familyId` and automatically injects it into every query against tenant-scoped models, so scoping is structural, not a per-file convention someone can forget.
  - Add a test that deliberately creates two families and asserts a session for Family A can never read or write Family B's rows, across the main model types. This is the one test in this entire spec I'd consider non-optional before inviting a second real family in.

**Exit criteria:** two families can each log in with their own codes and never see each other's data, verified by an automated cross-tenant test, not just manual spot-checking.

## Phase 3 — Make the Blue Ridge-specific compliance features optional and generic

Attendance tracking, the 4 fixed work-sample categories, Learning Periods, and the "HST Meeting Prep" report are currently hardcoded throughout the app (e.g. [src/lib/hstReport.ts](src/lib/hstReport.ts), [src/app/parent/reports/page.tsx](src/app/parent/reports/page.tsx), [src/app/parent/calendar/page.tsx](src/app/parent/calendar/page.tsx)) — built for one specific charter-school program's requirements. Other homeschooling families likely don't report to Blue Ridge Academy and shouldn't see UI built around it.

- Add a `Family` setting: `complianceModuleEnabled` (Bool, default off for new families; on for yours, preserving today's behavior).
- Add a couple of family-configurable labels rather than a full form-builder: `reportLabel` (default "Progress Report," yours set to "HST Meeting Prep"), `organizationName` (optional, shown in report headers — yours "Blue Ridge Academy," others blank). Reuse the existing four work-sample categories (Math/Language Arts/Science/Social Studies) as-is — they're generic enough for most co-ops — rather than building category management.
- When `complianceModuleEnabled` is off: hide the Learning Periods, Attendance, Work Samples, and Reports nav items and routes entirely. The rest of the app (assignments, recurrence, projects, "Show Mom" review) is unaffected — none of that is Blue Ridge-specific.
- Sweep hardcoded "Blue Ridge" / "HST" strings in *user-facing copy* (not code comments, which are fine as historical context) and replace with `reportLabel`/`organizationName` or generic fallback text.

**Exit criteria:** a new family with the module off never encounters attendance/work-sample/report UI; your family's experience is unchanged with the module on.

## Phase 4 — Admin tooling to create families (manual, not self-serve)

You're adding a handful of friends by hand, not opening public signup — so build the minimum, not a full onboarding product:

- A `/admin` route gated by a separate owner-only secret (not any family's login — this must not be reachable by a family's parent passcode).
- One form: family name, access code, parent passcode, and a `complianceModuleEnabled` toggle. Submitting creates the `Family` row and its hashed secrets.
- A first-run state in Parent Mode: when a family has zero students yet, show a short setup flow (add student(s): name, grade, accent color; add subjects) instead of the empty week-view your family would otherwise see with none of your data. This is the one piece of "onboarding UX" this phase needs — everything else a new family sets up the same way you always have, from inside Parent Mode.
- Write `createFamily()` as a plain function the admin route calls, not logic inlined into the route handler — so a future self-serve signup page has something to call instead of being a rewrite. Don't build that signup page now.

**Exit criteria:** you can create a working new family end-to-end in a couple of minutes without touching the database directly.

## Phase 5 — Hosting for many families on the one deployment you already pay for

- No infrastructure change needed to *start*: the existing Railway app + Postgres (~$5/mo) comfortably holds a handful of families' worth of data. Note the trigger to revisit (meaningfully more families, or noticeably slower queries) rather than pre-scaling for load that doesn't exist yet.
- Environment variables shrink to app-wide concerns only (session signing key, the new admin secret). `FAMILY_PASSWORD`/`PARENT_PASSCODE` env vars are retired once Phase 2 ships — per-family secrets live in the database instead.
- Everyone shares one URL; which family's data you see is determined by login, the same way Slack uses one client against many workspaces. No subdomains or per-family URLs needed at this scale — Phase 1's `slug` field reserves the option without building it now.
- Backups: Railway's existing automatic daily backups now protect every family's data, not just yours — no change needed, just worth knowing.
- Add a basic per-family data export or delete path (even a simple admin action) — light privacy hygiene once other families' real data lives in your database, independent of whether this ever becomes commercial.

**Exit criteria:** multiple families' data lives safely in the one app you already run, with no new recurring cost.

## Phase 6 — Beta rollout (not code — the actual "let friends try it" part)

1. Pick 2–5 friend families. For each, gather: family display name, student name(s)/grade/accent color, subject list, and whether they want the compliance-reporting module at all (most won't).
2. Create each family via the Phase 4 admin tool; send them their login and access code, and point them at the existing Safari "Add to Dock" instructions from SPEC.md §1 — that part of onboarding doesn't change.
3. Run an informal trial window (say, 2–4 weeks) with a lightweight feedback channel — a text thread or shared doc is enough at this scale; no support ticketing needed yet.
4. Because you host everyone, you're the on-call support for every family, not just your own — decide up front how you want bug reports to reach you, and don't add a family faster than you can realistically support during the trial.

**Exit criteria:** a handful of families are actively using their own week views, independently, without touching your family's data or routine.

## Phase 7 — Deliberately deferred, but not architected against

Not part of this beta, but worth naming so Phases 1–5 don't quietly foreclose them:

- **Self-serve signup + payment.** `Family.plan` and `createFamily()` (Phase 4) exist so a future signup flow has a natural landing spot; billing (Stripe) integration itself is out of scope now.
- **Per-family custom URLs/subdomains.** `Family.slug` is reserved, unused.
- **Terms of service / privacy policy.** Not needed among friends; would be needed before this is ever opened beyond people you know personally.
- **Rate limiting / abuse protection.** Irrelevant at friend-group scale; relevant the moment signup is public.

Nothing in Phases 1–5 should need to be re-architected to add these later — that's the test for whether this spec succeeded at "buildable now, not a dead end later."

---

## Open questions to settle before Phase 1 starts

- What should the family-facing login actually ask for — a family name/code picker, or something else? (Email is explicitly out per SPEC.md's "no accounts, no email" philosophy — worth confirming that still holds for other families too.)
- Any families in the initial group who *do* want attendance/work-sample tracking (e.g. they also report to a charter school), or is it safe to assume the compliance module is Blue-Ridge-only and every other family will leave it off?
