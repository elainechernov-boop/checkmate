# CHECKMATE — Homeschool Assignment Tracker
## Build Specification v1.0 · August 2026

A private web app for one family: the parent plans assignments weeks ahead (including repeating ones) from her own Mac, and the same data appears instantly on the kids' machine, where each student opens a clean daily list every morning and checks things off with a satisfying completion animation. The app also maintains the attendance log and work-sample records Blue Ridge Academy requires each learning period. Installed via Safari's "Add to Dock" on every Mac, it looks and launches like a native app.

Design north star: **TeuxDeux, not Trello.** Days as columns, tasks as plain text lines, an undated projects band below the week, one beautiful completion moment. No boards, no cards, no labels-on-labels, no gamification.

---

## 1. Platform & architecture

- **Private web app**, one shared database — sync is automatic because everyone reads the same source. Parent plans from her Mac; kids see changes on next load (plus a light 60-second background refresh of the week view, so a morning edit appears without them touching anything).
- **Stack:** Next.js (App Router) + TypeScript, Prisma ORM, **PostgreSQL**, Tailwind CSS, Framer Motion for the completion animation. This is the stack Claude Code is most fluent in — fewest surprises, fastest iteration.
- **Hosting: Railway** (~$5/month): the app and a managed Postgres database with automatic daily backups in one project, deployed by connecting a GitHub repository. Render is the equivalent alternative.
- **Access & security:** the app lives at a private URL. A single family password (stored as an environment variable, entered once per browser, remembered via a long-lived session cookie) gates the whole app. Parent Mode has its own passcode on top. No user accounts, no email, no third-party auth. Nothing is indexed or public; the database accepts connections only from the app.
- **Mac experience:** on each Mac, open the URL in Safari → File → Add to Dock. This creates a standalone app with its own icon and no browser chrome. Design and test against Safari first.
- Desktop-only layout (min-width ~1100px). No mobile design in v1.

## 2. Users & modes

**Student Mode (default on launch).** A picker shows the two students. Selecting one opens that student's week view. Students can: view their week, check items off (or into "Show Mom" for review-flagged items), uncheck (same day only), open the "Coming Up" panel showing the next 14 days of due dates, and — inside their own Projects only (§7) — create, edit, schedule, move, and delete their own tasks. Parent-assigned work is untouchable: no adding, editing, moving, deleting, or rescheduling.

**Parent Mode (passcode).** Everything: create/edit assignments and series, move and delete items, approve or return "Show Mom" work, manage the school calendar and learning periods, mark attendance, flag work samples, run reports, reschedule.

## 3. Data model

**Student**
- id, name, gradeLevel, accentColor (one subtle color per kid, used sparingly)

**Subject**
- id, name (Math, ELA, Latin, Science, History, Art, Scouts, Other), workSampleCategory (enum: math, languageArts, science, socialStudies, none — maps to Blue Ridge's four sample-eligible categories), isFaithIntegrated (Bool — see §8)

**Project** (student-created; see §7)
- id, student, name, targetDate (optional), subject (optional, parent-set — includes the project's completed work in HST logs), status: active / completed / archived

**AssignmentSeries** (the template; analogous to a recurring Google Calendar event)
- id, title, details (optional), student, subject (nil for student project series), project (optional), createdBy: parent / student
- recurrence: RecurrenceRule (nil = one-off)
- startDate, endCondition (never / onDate / afterNCount)
- estimatedMinutes (optional; used for the daily load indicator)

**RecurrenceRule**
- frequency: daily / weekdays / weekly / biweekly / monthly
- daysOfWeek: [Weekday] (for weekly/biweekly, e.g. Tue+Thu)
- interval: Int (every N weeks/months)

**AssignmentSeries** additions:
- requiresReview (Bool — "done" needs parent sign-off; see §5)

**AssignmentInstance** (what actually appears on a day; materialized from a series, or standalone)
- id, series (optional), title, details, student, subject (optional), project (optional), createdBy: parent / student
- dueDate (nullable — a nil dueDate is a project backlog item, allowed only for student-created project tasks), originalDueDate (set on scheduling; diverges when the item rolls)
- rolledCount (Int — how many days it has rolled forward)
- status: open / pendingReview / done / excused
- requiresReview (copied from series; settable per one-off)
- completedAt (when the student checked it), reviewedAt (when the parent approved, if required — the later of the two feeds the attendance log)
- isWorkSample (Bool), workSampleNote (optional)
- overrides: a per-instance edit detaches it from the series for that occurrence only (Google Calendar's "this event" vs "all events" behavior)

**SchoolDay** (the school calendar)
- date, type: schoolDay / offDay / fieldTrip / sick / holiday
- attendanceClaimed (Bool), activityNote (optional one-liner, e.g. "Field trip: La Brea Tar Pits")

**LearningPeriod**
- id, name (e.g. "LP1"), startDate, endDate, hstMeetingDate (optional)

**Materialization rule:** instances are generated from each series on a rolling 60-day horizon, regenerated when a series changes (future, non-edited instances only — never touch completed or individually edited ones). Instances are never generated on offDay/holiday/fieldTrip/sick days; the occurrence skips to the next valid day *only* for daily/weekdays frequencies, and is simply omitted for weekly-on-specific-days frequencies (Tuesday Latin doesn't happen if Tuesday is a field trip — unless the parent reschedules it, §5).

## 4. Recurrence UX (parent side)

New Assignment sheet, one screen:
- Title, student(s) (multi-select segmented control — picking more than one creates an independent copy of the assignment per student), subject (menu), details (optional), est. minutes
- Due date picker
- Repeat: **Does not repeat / Every school day / Weekly on… / Every 2 weeks on… / Monthly** — mirroring the Google Calendar menu exactly, because it's the mental model the parent already has
- Ends: Never / On date / After N times
- **"Show me the work" toggle** (sets requiresReview for the whole series or the one-off)

**Quick-add.** Clicking empty space in a day's column reveals an inline title-only field — Enter creates a bare one-off assignment for that student and date, no dialog. Clicking the resulting item opens the full edit sheet (same fields as New Assignment, minus the student picker) to fill in subject, details, or repetition.

**Editing.** Clicking any assignment in the week view opens the edit sheet, prefilled. If it belongs to a series, a scope choice appears — **"This assignment only" / "This and following" / "All in series"**, the Google Calendar pattern — and the repeat controls only apply to "and following"/"all" (a single occurrence has no recurrence of its own). Adding a repeat pattern to a previously one-off item promotes it into a new series starting on its due date.

## 5. Scheduling behavior: rolling, deadlines, and "show me"

**Unfinished work rolls forward automatically (TeuxDeux behavior).** At the first load of each new day, every item still open from a previous day moves to the current day's column and its rolledCount increments. Rolling skips non-school days. Rolled items are visually marked: a small superscript in the item's row showing days carried (·· for two days, ×4 beyond three), so a task that's been pushed all week is quietly conspicuous. The kids never manage overdue lists — today's column is always the whole truth — but the roll marks keep procrastination visible to them and to the parent. Rolled items sort to the top of the day, oldest first: debts before new work.

**Recurring series still generate on schedule.** If yesterday's math rolled and today's math generates, both appear (the rolled one marked). That pile-up is the honest signal that the plan is slipping — the app never merges or hides it.

**"Show me" review (requiresReview).** For flagged assignments, the student's check doesn't finish the job — it starts it:
1. Student clicks the item → it enters **pendingReview**: no strikethrough yet; the row shows a small raised-hand mark and the label "Show Mom." A short half-animation (the strike draws ~30% and stops) makes it feel deliberately incomplete.
2. The student physically brings the work. The parent approves in the app — from her own Mac's Parent Mode, or directly on the kids' machine via a passcode popover on the pending item (one tap, passcode, done).
3. On approval, the full completion sequence from §6 plays **on the student's screen** at next refresh — the strike finishes, the item settles. The reward lands only when the work has been shown.
4. The parent can instead send it back ("not your best work") with an optional one-line note; the item returns to open with the note beneath the title.
5. pendingReview items do NOT roll — they hold their day until approved or returned. Day-complete confetti requires every item truly done, not merely pending.

**Parent controls (Parent Mode only).** The parent can drag any item to another day — as a slim single-line row, not a card (§9) — to reschedule it; a dragged occurrence always moves just that one instance, detaching it from its series the same way "this assignment only" does (§4), so moving one day of an "every school day" series never disturbs the rest. Editing or excusing goes through the edit sheet's series-scope prompt from §4; deleting isn't built yet. Students have no move or delete — their only verbs are check and uncheck.

**Field trips and off days.** Marking a day offDay/fieldTrip/sick removes it from the roll path (items skip over it) and triggers the Reschedule Helper for anything already scheduled that day: shift to next school day / a chosen date / distribute across the week.

**Coming Up.** Multi-day project items with a future dueDate flagged "show early" appear grayed in the student's "Coming Up" panel so kids see work approaching. Keep this minimal — the week view is the teacher.

## 6. Student experience — the TeuxDeux view

**Layout.** Six columns, Monday–Saturday of the current week, today's column highlighted with a hairline border and slightly larger day label. Saturday is usually empty but is where unfinished work sometimes gets moved. Horizontal swipe/arrow to page between weeks (past weeks read-only). Each item is a single line, flush with the day label above it — no checkbox, no color dot: **the title itself is the completion control.** Clicking it completes or undoes the item; a small subject name + estimated time sits in muted text underneath (more legible to a kid than a color they'd have to memorize), and a small arrow after the title opens a read-only details popup (subject, notes, estimated time, due date, status) — parent-assigned work stays uneditable by students (§2). Today's open items can be dragged to reorder within the day — grab the row itself, no separate handle; other days are display-only, matching the existing today-only interactivity rule.

**The completion moment (the signature — build this with care):**
1. Clicking the title draws a strikethrough line left-to-right across it over ~280ms with an ease-out curve
2. Simultaneously the text color fades to muted gray with a single, small spring scale pulse
3. A soft, short completion sound (subtle "tick," toggleable via the header sound icon)
4. A one-time reward: a fun critter (an emoji, freshly randomized every time — no two completions look the same) flies clean across the whole screen, gone in just over a second. Skipped for pendingReview and for undo; the reward lands only when the work is actually, genuinely done.
5. Completed items sink below open items in the column with an animated reorder
6. **Day-complete moment:** when the last open item in today's column is checked, the whole screen takes it over — confetti rains across the full viewport and a big "[Student] finished the day!" message pops in, ~2.3s, then gone. Once per day, today only.
7. Undo: clicking a completed item today reverses the animation; clicking a pendingReview item withdraws it back to open. Yesterday and earlier are locked for students.
8. Respect the `prefers-reduced-motion` setting: replace the strike/critter/confetti with a simple crossfade (a soft full-screen flash + static text for the day-complete moment; the per-item critter is skipped outright).

**Item states in the column, top to bottom:** rolled items (with their day-count marks, oldest first) → today's open items (parent-assigned and project tasks interleaved, in the student's own drag-order) → pendingReview items ("Show Mom," half-struck, holding, an amber raised-hand mark under the title) → completed items (muted, struck). The column reads as a work queue: debts, then today, then waiting-on-Mom, then done.

## 7. Self-initiated projects (student-created)

This is TeuxDeux's undated "someday" area, turned into a planning sandbox. Below the week columns sits a **Projects band**: simple side-by-side lists, one per active project, visually quieter than the week above it.

**Creating a project.** A student clicks "+ New project," names it ("Learn Clair de Lune"), and optionally sets a target date. That's the whole form.

**Project tasks.** Inside a project, the student adds plain to-do lines. Tasks start undated in the project's list. To schedule, the student either drags a task onto a day column, or uses the task's "Plan it" control with kid-sized recurrence: **Just once / Every day / Every other day / Pick days…**, running **until the target date** by default or until a chosen date. "Practice 20 minutes" + Every other day + until Aug 21 generates the whole two-week plan in one move — this is the time-management skill the feature exists to teach, so the control must be simple enough that a 9-year-old uses it unaided.

**Ownership.** Students have full control of their own project tasks — create, edit, move between days, unschedule back to the backlog, delete. Scheduled project tasks roll forward overnight exactly like assigned work, with the same roll marks: their plan slipping is visible to them the same way. Parent-assigned items remain untouchable, and students cannot add tasks outside a project.

**Visual distinction.** Project tasks appear in the day columns as normal rows, with the project's name in the student's accent color where the subject/time line would otherwise sit — theirs at a glance, without a second visual system. Same completion animation; project tasks count toward the day-complete moment (their day is their day).

**Project completion.** When the last task in a project is checked, the project's name in the band gets its own full-width strike and settle, then the project moves to a collapsed "Finished" stack — kept, not deleted. A running record of things they taught themselves is worth more than the confetti.

**Parent visibility.** Parent Mode sees all projects and can edit or delete anything inappropriate, but the default posture is hands-off. Optionally, the parent can assign a subject to a project (piano → Art); the project's completed tasks then appear in the HST report's activity log under that subject. Untagged projects stay out of all compliance reporting, and project tasks are never work-sample eligible and never drive attendance auto-suggest.

## 8. Blue Ridge compliance module (Parent Mode)

Grounded in Blue Ridge's published requirements: the HST meets with the family approximately every 20 school days; work samples are required each learning period to represent the student's work and verify monthly attendance; for TK–8 the HST selects samples from Math, Language Arts, Science, and/or Social Studies; samples must be the student's best work and carry a completion date that appears on the attendance log for that learning period; attendance is claimed in the Parent Portal and final signed attendance is due the last day of each learning period. Work samples must be non-sectarian. **The app is the family's source of truth and prep tool; official attendance is still claimed in Blue Ridge's Parent Portal.** Verify current-year specifics against the handbook with the HST at the first meeting.

Features:

- **School calendar setup:** import/enter Blue Ridge's academic calendar once; define learning periods with start/end dates; set HST meeting dates as they're scheduled.
- **Attendance:** every schoolDay with at least one completed parent-assigned instance per student auto-suggests "present." Parent confirms days in a simple month grid (one click toggles). Days marked sick/offDay are excluded from the school-day count. A learning-period attendance view shows exactly what to transcribe into the Parent Portal, with a "claimed" checkbox per LP to track that it's done.
- **Work samples:** any completed instance can be flagged as a work sample. The flag sheet enforces the rules: subject must map to one of the four eligible categories; **subjects marked isFaithIntegrated (A Reason for Handwriting, Visual Latin's Vulgate readings) are ineligible and the app says why**; the completion date must fall inside the current LP and on a day marked present — if not, the app warns before allowing it.
- **HST Meeting Prep report (PDF export):** per student, per learning period — attendance summary (days present / school days), the work-sample list with subjects and dates, and a full log of completed assignments grouped by subject. One button, print-ready, bring it to the meeting.
- **Dashboard card:** days until LP end, attendance claimed?, work samples flagged per category (e.g. "Math ✓ · ELA ✓ · Science — · Soc. Studies —").

## 9. Visual design brief

- **Near-monochrome, every day.** Warm off-white background, near-black text, one muted gray for completed/secondary/meta text. Color in the day-to-day view appears in exactly two places: each student's accent, and a single warm amber reserved for roll marks and the "Show Mom" state. Nothing else — no per-subject color coding; a subject's *name*, written small under the title, carries that information instead (§6).
- **One typeface, used well.** A single family (e.g. system SF with deliberate weight/size contrast, or a humanist sans like Inter) — TeuxDeux's charm is typographic restraint, not decoration.
- Generous whitespace; hairline dividers only where structure demands.
- No badges, streaks, points, or persistent avatars/mascots anywhere in the day-to-day UI. The one deliberate exception: the completion moment itself (§6) is allowed to be genuinely fun — a randomized flying critter per item, a full-screen confetti takeover for the day — because that reward, not a permanent character or score, is the entire game the app plays.
- Empty day columns show a single centered line: "Nothing due." An empty week shows nothing at all — silence is the design.

## 10. Out of scope for v1

Grades/scoring, file attachments, curriculum links, time tracking, mobile/tablet layout, notifications, real-time live updates (the 60-second refresh is enough), multi-family accounts, charter fund/order tracking, review requirements on student-created tasks.

---

## 11. Build plan with Claude Code

### Prerequisites (one-time, ~30 min)
1. **Claude Code** — requires a paid Claude plan (Pro or Max). Install via Terminal with the official installer: `curl -fsSL https://claude.ai/install.sh | sh` — then run `claude` in any folder and sign in when the browser opens. (The Claude Code desktop app is the no-terminal alternative.) If the installer complains about missing tools, run `xcode-select --install` first to get Apple's command-line tools — not full Xcode.
2. **Node.js** — install with `brew install node` (install Homebrew first from brew.sh if needed). Claude Code can walk through any hiccup here; just paste it the error.
3. **Accounts:** a free GitHub account (github.com) and a Railway account (railway.app, sign in with GitHub). Railway's Hobby plan (~$5/month) covers the app and database.
4. Create the project folder: `mkdir ~/Projects/checkmate && cd ~/Projects/checkmate`
5. Save this spec into that folder as `SPEC.md`, then create a `CLAUDE.md` containing one line: *"Read SPEC.md before any work. It is the source of truth. Build phase by phase; do not start a phase until asked."*

### Phased prompts (paste into Claude Code one at a time; test between phases)

**Phase 0 — Scaffold.**
"Read SPEC.md. Scaffold a Next.js App Router project in TypeScript called checkmate with Tailwind, Prisma, and Framer Motion. Define the full Prisma schema from §3. Use SQLite locally for development and Postgres in production via DATABASE_URL. Add the family-password gate and the Parent Mode passcode from §1–2, both read from environment variables. Seed the two students and the subject list from §3, including workSampleCategory and isFaithIntegrated. Run it locally so I can see it at localhost:3000, and git init with a first commit."

**Phase 1 — Parent planner.**
"Build Parent Mode per §2 and §4: student and subject management, the New Assignment form with the recurrence controls, and a basic week grid showing instances. No animations yet."

**Phase 2 — Recurrence engine.**
"Implement §3's materialization rule and §4's edit semantics (this only / this and following / all). Write tests covering: weekdays series skipping an offDay, weekly Tue/Thu series omitting a field-trip Tuesday, per-instance edits surviving series regeneration, and end conditions."

**Phase 3 — Student week view + completion animation.**
"Build §6 exactly: the six-column week view with the item-state ordering, Coming Up panel, the 60-second background refresh, and the full completion sequence in §6 steps 1–7 including the day-complete confetti and prefers-reduced-motion fallback, using Framer Motion. Follow the visual design brief in §9 strictly — near-monochrome, one typeface, no extra chrome. Test in Safari."

**Phase 4 — Rolling, review, and rescheduling.**
"Implement §5: the daily auto-roll with rolledCount marks and skip-over of non-school days, the pendingReview 'Show Mom' flow including the half-strike animation, the parent approve/return actions (from Parent Mode and via the passcode popover on the student machine) with the full completion animation firing on approval, the Reschedule Helper, and the day-type-change flow. Write tests for: roll skipping a weekend, pendingReview holding its day, an approved item's reviewedAt feeding the attendance log, and a returned item reopening with its note."

**Phase 5 — Student projects.**
"Implement §7: the Projects band below the week, project creation, backlog tasks, drag-to-day scheduling, the Plan-it recurrence control (Just once / Every day / Every other day / Pick days, until target date), hollow accent ticks in the day columns, student edit/move/delete rights limited to their own project tasks, the project-completion strike and Finished stack, and Parent Mode's project visibility with optional subject tagging. Tests: a project series generating every-other-day until the target date, a backlog item scheduling and rolling, and permission checks that students cannot modify parent-assigned items."

**Phase 6 — Blue Ridge module.**
"Implement §8: school calendar and learning periods, attendance grid with auto-suggest and per-LP claimed tracking, work-sample flagging with the eligibility rules (including the faith-integrated exclusion and date-must-match-attendance validation), the printable HST Meeting Prep report (a clean print stylesheet is fine — Safari's Print to PDF does the rest), and the dashboard card."

**Phase 7 — Deploy.**
"Help me deploy this to Railway step by step: push the repo to GitHub, create the Railway project with a Postgres database, set DATABASE_URL and the two password environment variables, run the Prisma migration in production, and verify the live URL works. Then tell me exactly what to type where."

### Working rhythm
- After each phase, test at localhost:3000 against the relevant spec section before moving on.
- **Design iteration:** take a screenshot (⇧⌘4), drag the image into the Claude Code prompt, and say what's off ("the strikethrough is too fast; the columns feel cramped — more air between them"). Iterate until the completion moment genuinely delights — it's the whole point.
- Commit after every phase (Claude Code will do this if asked), so any regression is one `git revert` away.
- After deploying, small changes stay easy: edit locally with Claude Code, test, `git push` — Railway redeploys automatically in about a minute.

### Putting it on every Mac
On each machine (yours and the homeschool MacBook Air): open the Railway URL in Safari, enter the family password once, then **File → Add to Dock**. Checkmate now sits in the Dock with its own icon and opens in a chromeless window — indistinguishable from a native app in daily use. Nothing to install, nothing to update; every Mac always runs the latest version.
