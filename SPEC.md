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

**Student Mode (default on launch).** A picker shows the two students. Selecting one opens that student's week view. Students can: view their week, check items off (or into "Show Mom" for review-flagged items — with time tracking on, "checking off" means timing the task and pressing Finish, §15), uncheck (same day only), open the "Coming Up" panel showing the next 14 days of due dates, and — inside their own Projects only (§7) — create, edit, schedule, move, and delete their own tasks. Parent-assigned work is untouchable: no adding, editing, moving, deleting, or rescheduling.

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

**Unfinished work rolls forward automatically (TeuxDeux behavior).** At the first load of each new day, every item still open from a previous day moves to the current day's column and its rolledCount increments. Rolling skips non-school days. Rolled items are visually marked: a small superscript in the item's row showing days carried (·· for two days, ×4 beyond three), so a task that's been pushed all week is quietly conspicuous. The kids never manage overdue lists — today's column is always the whole truth — but the roll marks keep procrastination visible to them and to the parent. Rolled items land at the top of their new day, oldest first — debts before new work — but that's only where they start: the parent can drag them anywhere in the day like any other row, and the student sees her order (§14).

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

**Layout.** Six columns, Monday–Saturday of the current week, today's column highlighted with a hairline border and slightly larger day label. Saturday is usually empty but is where unfinished work sometimes gets moved. Horizontal swipe/arrow to page between weeks (past weeks read-only). Each item is a single line, flush with the day label above it — no checkbox, no color dot: **the title itself is the completion control.** Clicking it completes or undoes the item (with time tracking on, §15, the first tap on an open item opens its timer instead, and the timer's Finish button completes it; undo is unchanged); a small subject name + estimated time sits in muted text underneath (more legible to a kid than a color they'd have to memorize), and a small arrow after the title opens a read-only details popup (subject, notes, estimated time, due date, status) — parent-assigned work stays uneditable by students (§2). Row order within a day is parent-set and locked (§14) — the student's whole week, every day, is display-only; there is no drag handle anywhere in Student Mode.

**The completion moment (the signature — build this with care):**
1. Clicking the title draws a strikethrough line left-to-right across it over ~280ms with an ease-out curve
2. Simultaneously the text color fades to muted gray with a single, small spring scale pulse
3. A soft, short completion sound (subtle "tick," toggleable via the header sound icon)
4. A one-time reward: a fun critter (an emoji, freshly randomized every time — no two completions look the same) launches from the checked item itself and rises up and off the top of the screen — clear of the day columns rather than sweeping back across them — over about 1.7s, unhurried enough to actually enjoy. Skipped for pendingReview and for undo; the reward lands only when the work is actually, genuinely done.
5. Completed items sink below open items in the column with an animated reorder
6. **Day-complete moment:** when the last open item in today's column is checked, the whole screen takes it over — confetti rains across the full viewport and a big "[Student] finished the day!" message pops in, ~2.3s, then gone. Once per day, today only.
7. Undo: clicking a completed item today reverses the animation; clicking a pendingReview item withdraws it back to open. Yesterday and earlier are locked for students.
8. Respect the `prefers-reduced-motion` setting: replace the strike/critter/confetti with a simple crossfade (a soft full-screen flash + static text for the day-complete moment; the per-item critter is skipped outright).

**Item states in the column, top to bottom:** open items — rolled items (with their day-count marks), today's parent-assigned work, and project tasks, all interleaved in parent-set order (§14; rolled items start at the top when they roll, §5) → pendingReview items ("Show Mom," half-struck, holding, an amber raised-hand mark under the title) → completed items (muted, struck). The column reads as a work queue: the parent's plan for the day, then waiting-on-Mom, then done.

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

Grades/scoring, file attachments, curriculum links, mobile/tablet layout, notifications, real-time live updates (the 60-second refresh is enough), multi-family accounts, charter fund/order tracking, review requirements on student-created tasks.

(§12, added post-v1, covers one narrow slice of "notifications" — an in-app reminder popup for assignments with a fixed clock time. True OS-level push notifications, delivered when Checkmate isn't open, remain out of scope. §15, also post-v1, brings "time tracking" in: a per-task timer for students and a time dashboard for the parent.)

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

---

## 12. Time-sensitive assignments & reminders (post-v1)

Most assignments are due sometime that day — missing the day is what §5's roll-forward exists to make visible. A few assignments instead happen at a fixed clock time (an online Latin class once a week, a co-op meeting), where missing the *moment* is the real risk. This section adds a narrow, opt-in escalation for exactly that case, layered on top of §3-§6 without changing them for ordinary assignments.

**Marking an assignment time-sensitive.** In the New Assignment sheet (§4) and the edit sheet's fields, an optional "This happens at a set time" toggle reveals a clock-time picker and a reminder lead — 10 minutes before / 30 minutes before / 1 hour before. Like `requiresReview`, this lives on the series so a recurring class carries it every week, copies down onto each materialized instance, and is overridable per occurrence under the same "this only / this and following / all" rules as everything else in §4.

**Data model additions (§3).**
- `AssignmentSeries` and `AssignmentInstance` both gain: `isTimeSensitive` (Bool, default false), `scheduledTime` (nullable string, `"HH:MM"` 24-hour, interpreted as local wall-clock time — the app doesn't model real timezones, matching how `dueDate` is already a plain calendar date with no time component), `reminderMinutesBefore` (nullable Int: 10 / 30 / 60).

**In the student view (§6).** A time-sensitive item sits among its day's open items wherever the parent placed it (§14) and, like everything in Student Mode, is not draggable. Column ordering stays: open (parent-set order, time-sensitive included) → pendingReview → completed. Its scheduled time shows beneath the title in the same amber already reserved for roll marks and "Show Mom" (§9's two-color budget is unchanged — no new color is introduced for this).

**The reminder popup.** While the student's tab is open, a lightweight background check (separate from the 60-second data refresh) watches today's still-open time-sensitive items. When the wall clock enters the reminder window — opening `reminderMinutesBefore` minutes ahead of `scheduledTime` and staying open until 15 minutes after, so a student who opens the app a little late still gets nudged rather than silently missing it — a full-screen takeover interrupts whatever they're doing ("🕐 Latin starts in 10 minutes — go get ready!"), requiring a single tap to acknowledge and dismiss rather than auto-fading like the completion/day-complete moments. It fires at most once per item per day (tracked client-side) and never for an item that's already done, pending review, or excused.

This is in-app only, per the tradeoff in §10's note: it requires Checkmate to be open on the student's machine at the time, not a true OS-level push notification delivered while the app is closed.

## 13. Photo/text import — turning an agenda into assignments (post-v1)

Teacher agendas and weekly checklists arrive as a photo of a printed page, not something Checkmate can plan from directly. This adds a Parent Mode-only path that turns a photo or a pasted block of text, plus a short instruction, into draft assignments — always reviewed and edited before anything is added to the plan, never auto-committed.

**Entry point.** A new Parent Mode screen (e.g. `/parent/assignments/photo-import`), linked from wherever "+ New Assignment" already lives.

**Input.** The parent picks exactly one:
- Upload photo(s) — one or several at once, e.g. a whole week's checklists in one batch.
- Paste text directly.

**Transcription step (photo only).** Each uploaded photo is sent to Claude's vision API for transcription — not parsing — into plain text, shown back in an editable textarea per photo so the parent can fix any misread text before anything is turned into assignments. Pasted text skips this step and goes straight to the box.

**Instruction + parse.** The parent adds a short free-text instruction ("science work for week of 9/13, split into Tues/Thurs assignments"). The transcribed/pasted text plus instruction go to Claude along with the family's actual Subject and Student names as context, and come back as structured draft assignments: title, subject, student, and either a due date or a recurrence pattern (a day-of-week set, matching §4's "Weekly on…" model).

**Draft review.** Every parsed row appears in an editable list, using the same fields as the New Assignment form (§4), before anything is created. The parent can edit, delete, or add rows here — nothing reaches a student's day unparsed or unreviewed.

**Commit.** Confirmed rows are created through the exact same path as manual entry (§4) — one AssignmentSeries (or standalone AssignmentInstance) per row, materialized per §3's rule. No new data model: a confirmed draft is indistinguishable from a hand-typed assignment, so it inherits rolling, review, attendance, and reporting for free.

**Data model additions:** none. The draft parse is ephemeral request/response state, never persisted unless and until the parent confirms it.

**Out of scope:** auto-committing without review, remembering or re-using past photos, OCR beyond what Claude's vision model already handles, and any marker in the UI distinguishing a photo-imported assignment from a hand-typed one once confirmed — it's just an assignment.

## 14. Manual ordering, locked from the student's side (post-v1)

Row order within a day used to be split: the parent could drag to reorder her own planning view, and separately a student could drag today's own open items into whatever order suited them. That second half goes away — order is entirely the parent's call, and it stays put wherever she leaves it.

**Parent Mode.** Unchanged from §5/§9: drag any row — instance or separator — within a day's cell to set its position, any day, any status. That order is the one and only order; it's what the student sees too.

**Student Mode.** No drag anywhere in the week view, on any day, for any row — parent-assigned instances and the student's own project tasks alike (§7's project-task ownership is otherwise unchanged: still create, edit, move between days, unschedule, delete — just not reorder in place). The row order the parent set (or, absent that, plain creation order) is what renders, full stop.

**Repeating items reorder forward.** Dragging one occurrence of a repeating series to a new position within its day doesn't just move that one day — it re-applies the same position to that series' other future occurrences too (skipping anything already completed or individually detached via "this assignment only," the same carve-outs §4/§5 already respect), and remembers the position on the series itself so instances materialized later land there from the start instead of always at the bottom of their day. Moving a one-off (non-series) item, or moving an item that's been detached from its series, only ever affects that single day, same as today.

**Editing never moves a task.** Saving an edit — any scope, any field — leaves the row exactly where it was in its day. Two things follow from that. "This and following" and "add a repeat" don't delete and regenerate the occurrences they touch (a regenerated row would land at the bottom of its day and lose its status, roll marks, and logged time); they carry the existing rows over to the new series in place, and the new series inherits the old one's remembered `sortOrder`. And saving an edit without changing the date doesn't rewrite it, which would reset a rolled-forward task's original due date. The one real exception is an actual move: a task moved to a different day — by dragging it there, by changing its date in the edit panel, or by the Reschedule Helper — lands at the bottom of that day, like any newly arrived row, rather than in a stale slot from the day it left; the helper moves a day's tasks in their on-screen order, so they arrive in that order. Everything already on the day it lands on stays put.

**Data model additions (§3).** `AssignmentSeries` gains `sortOrder` (Int, nullable — the row index its instances should land at within their day; null means no preference yet, i.e. keep appending new instances at the bottom, unchanged from today).

## 15. Task timer & time dashboard (post-v1)

Checkmate knows what was due and what got checked off, but not how long anything took or where the school day's hours went. This section adds a per-task stopwatch on the student side and a Parent Mode dashboard that pulls apart three things a checkmark hides: time spent *working*, time *paused* mid-task, and the gaps *between* tasks. The question it exists to answer: when a school day drags on, is it the work, or the breaks between the work?

It is a measuring tool, not a motivator — no scores, streaks, or comparisons on the student side (§9). Off by default; a family turns it on in settings (`Family.timeTrackingEnabled`), and for a family that doesn't, §5 and §6 behave exactly as before.

**Student: starting a task.** In today's column, a hover-capable pointer anywhere over an open item highlights the whole row — a faint ink wash spanning the column's full width, like the live/soon band (§12). A play triangle — no label, ~10px inside a ~28px tap target — sits at the row's right edge, vertically centered on the row, in a gutter of about 24px reserved on the right of open rows, so a long title wraps short of it and nothing reflows when it appears. It follows the app's existing hover-action rule (`globals.css`): hidden until the row is hovered or focused on desktop, always visible on touch. To return §6's "flush with the day label" look, the 3px identity bar left of each Student Mode row is dropped while tracking is on; its jobs are already carried elsewhere — finished rows are muted and struck, and project tasks name their project in the student's accent on the subject line. Parent Mode keeps its bars. The line beneath the title — subject and estimate, always on its own line — is a tap target across the row's width: tapping it opens the read-only details popup (§6) with the subject, estimated time, notes, due date, and status. A row with notes or a due date but no subject or estimate shows a quiet "Details" there instead; a bare row has no line beneath it and nothing to open. Tapping the triangle (or the title, which does the same) no longer completes an open item: it opens the timer screen and **starts the clock immediately**, because forgetting to press Start is how time trackers lose their data. Only today's open items can be timed (the same rule as check/uncheck, §6) — with one exception, a Sunday head start, below. Done and pendingReview items keep their one-tap undo/withdraw and never open a timer.

**Student: the timer screen.** A full-screen white takeover — no modal chrome, nothing else on the page — all type, centered, top to bottom:
1. The **task title**, large (Inter 600, ~28–44px fluid), with a muted "Subject" or project-name line beneath.
2. **Elapsed time**, enormous (Inter 300, tabular numerals, ~96–168px fluid): `12:34`, becoming `1:02:34` past an hour. It is the task's running total across every run, so pausing and resuming picks up where it stopped, and a task that rolled in from yesterday continues from yesterday's total.
3. **Required time**, muted, beneath it: "of 20 min," from the task's `estimatedMinutes` (omitted if it has none). A 2px hairline rule under it fills left-to-right in the student's accent as elapsed approaches the estimate. Past the estimate nothing alarms — the rule stays full and the label becomes a muted "+4 min." No red, no shake: running over is information for the parent, not a failing for the kid.
4. Two controls: a round, hairline-outlined **Pause/Play** button that converts with the clock's state (❚❚ while running, ▶ while paused — SVG glyphs, not emoji), and **Finish**, the screen's only solid element (ink fill, white text). Running shows a 6px accent dot that pulses (still, under `prefers-reduced-motion`); paused dims the digits to muted gray and shows a quiet "Paused."
5. A muted footer: "Started 9:42 AM."

A **← Back** link at top-left pauses the clock and returns to the week, so a running clock never sits behind another screen. **Finish** closes the run and applies §6's completion transition exactly as a title tap does today — pendingReview for "Show me" work (the clock stops at Finish, not at parent approval), otherwise done, with the strike, critter, and day-complete takeover playing on the week view once the timer screen dismisses. A Finish pressed within seconds of opening records no time at all (runs under 10 seconds are discarded as accidental taps) — which is also how a student checks off work they did away from the Mac; the dashboard counts those as *untimed* rather than guessing. Unchecking a done item today keeps its recorded time; timing it again continues the total. Afterward, an open item with any time logged carries a small accent dot and a muted "In progress" in its row; students never see historical times anywhere — only the running clock (and the day bar's fill, below, which is a shape, never a number).

**Student: the day bar.** The 3px bar under each day's header — a hairline track covered left-to-right by the student's accent — fills today by estimated minutes done ÷ estimated minutes total, so it only jumps when something is checked. With tracking on it fills by *time actually worked* instead, and it moves while the clock runs: the timer screen pins the same bar full-width along its top edge, so the student watches the day fill in as they work, and the week view shows it advanced on return. For one day:
- *Worked* is the time logged that day (by `TimeEntry.date`) on the day's tasks that have estimates, plus, for any such task finished with no time logged, the part of its estimate not already logged on earlier days — work checked off away from the Mac still counts as work done.
- *Remaining* is, for each still-open task with an estimate, its estimate minus all time logged on it so far, floored at zero.
- The fill is worked ÷ (worked + remaining). "Finished" means anything not open (done, pendingReview, or excused), matching the bar today.

So the bar reaches full exactly when every estimated task is finished, and never before: a task that runs over fills at its real pace instead of pinning the bar at 100% while work remains (and the bar holds just short of full, at 99%, while any estimated task is still open — even an over-running last one), and finishing early lets the leftover snap forward. Tasks without an estimate stay out of the bar, and a day with no estimates shows no bar — the §5.4 rule that never invents minutes. (That also means the bar and the timer's "of 20 min" line both depend on estimates being filled in.)

**Student: a head start on Sunday.** The week is Monday–Saturday (§6), so on a Sunday there's no "today" column. With time tracking on, a Sunday opens up the very next day: **Monday's column goes live** — hover wash, play triangle, timer, Finish, and undo all work on its open tasks — and the line under the header says so ("No school today — but you can get a head start on tomorrow's work. Tap ▶ on anything in Monday"). The time is **recorded as Sunday's work**: a run is always dated the day it actually happened, so it shows under Sunday, not Monday, and the task itself stays due Monday. Finishing a task on Sunday completes it for real (done, or pendingReview for "Show me" work, `completedAt` on Sunday); an unfinished one simply carries its time into Monday, where it reads as "In progress." Only Monday's tasks open — not Tuesday's — and only on a Sunday: no other day gets this, so Friday can't start Saturday's. The server enforces it (`canWorkOn`), for timing, finishing, and unchecking alike. The day bar counts head-start time toward the day it was for: time logged *before a task was ever due* is part of that day's work, so a task finished on Sunday reads as fully worked on Monday instead of untouched (time logged on later days of a task that rolled forward is still "earlier" work, as before).

**Data model additions (§3).**
- `TimeEntry` — one continuous run: id, familyId, studentId, `instanceId` (nullable, `onDelete: SetNull`), `title` and `subjectId` (snapshots taken at start, so deleting an assignment doesn't rewrite the history the dashboard is built on), `date` (calendar day from `getToday()` at start, so it honors `DEBUG_TODAY`), `startedAt`, `endedAt` (null while running), `lastPingAt`, `endReason` (paused / finished / switched / lapsed; null while running), `editedByParent` (Bool). Indexed on `[familyId, date]`, `[studentId, date]`, `[instanceId]`.
- `Family` gains `timeTrackingEnabled` (Bool, default false) and `schoolDayStartTime` (nullable `"HH:MM"` wall-clock, like `scheduledTime` in §12).
- Nothing changes on `AssignmentInstance` or `AssignmentSeries`: a task's time is always the sum of its entries, never a stored total, so edits and deletes can't leave one out of sync. `estimatedMinutes` is the "required time."

**Recording rules (server-enforced).**
- Start, pause, resume, and finish are server actions stamped with the server's clock. The client clock only drives the on-screen digits (offset against the server time sent at load), so a skewed Mac can't distort the record.
- Pause closes the current entry; Resume opens a new one. A task's time is the sum of its runs, and the gap between two runs is data too.
- At most one open entry per student. Starting another closes the first (`switched`) in the same transaction.
- A reload or crash returns straight to the still-running timer: it reads from the server, not from local state.
- While the timer screen is open it pings every 30 seconds. An open entry with no ping for 5 minutes (lid shut, tab closed, walked away; long enough to ride out a backgrounded Safari tab's throttled timers) is closed at its last ping with `lapsed`. The sweep runs on any read or write of that student's entries, the dashboard included — so a lapsed run is never counted up to "now" — with no scheduler. A lapsed task is simply left "In progress"; nothing reopens on its own.

**Parent: time on every task.** On the week board, a row's meta line adds actual time beside the estimate once any is logged ("Math · est 30 min · took 42 min"). The row's edit panel gains a "Time" section listing each run (start–end, duration, a quiet "auto-closed" mark for lapsed ones) with hairline inline inputs to correct start or end and a delete ×. Corrected runs are marked on the dashboard. There is no "add time": untimed work stays untimed rather than being invented after the fact.

**Parent: the Time dashboard.** A new "Time" link in Parent Mode's nav (hidden unless tracking is on), at `/parent/time`: a student switcher in the same plain-text style as the nav, and a range — This week (default) / Last week / Last 4 weeks, each a run of whole Monday–Sunday weeks so a Sunday head start shows up. A Sunday appears in the strips marked "head start," but it isn't a school day: it has no school-day start to be late for (no "waiting to start") and it's left out of the school-day averages in "The answer." For one student and one day, order that day's entries by `startedAt`; then:
- **Working** is the sum of entry durations.
- **Paused** is any gap between two consecutive entries of the *same* task.
- **Between tasks** is any other gap between consecutive entries.
- **Waiting to start** is the first entry's start minus `schoolDayStartTime` (only if that's set and the start was later; otherwise zero).
- **Day** is those four added up: from the earlier of `schoolDayStartTime` and the first start (just the first start, if unset) to the last entry's end. The four always sum to the day exactly — a property the tests assert. An open run counts up to now, so today shows live.
- **Untimed** tasks (completed with no entries) are counted, never estimated, and left out of every duration.
- Time is attributed to the `date` of each entry, so a task worked over two days splits across both.

The page reads top to bottom, hairlines and type only — no cards, no pie charts:
1. **The answer** — one sentence in large type from the range's averages ("School days ran 4h 10m on average: 2h 05m working, 1h 40m between tasks"), then a single full-width stacked bar of the same four buckets, each segment labeled with its value and share. Grayscale on purpose, distinguished by lightness *and* direct labels: Working ink, Paused mid-gray, Between tasks light gray, Waiting an outlined, unfilled segment. Color stays reserved for the student's accent (§9). A muted line beneath: "3 of 41 tasks untimed."
2. **Day by day** — one row per school day: the weekday, then a thin strip on a shared clock axis (fit to the range's earliest start and latest end, hour ticks in hairline). Ink blocks are tasks running; empty space is everything else, so a long empty stretch is the answer made visible. Hovering a block names the task and its start–end. At the right: "Work 2h 05m · Day 4h 10m · Done 1:52 PM." Clicking a day opens its ledger — each task in order with start–end, time, estimate, and difference, with the gaps written between the rows ("— 12 min between —," "— 6 min paused —"). The corrections from "time on every task" live here too.
3. **By subject** — a table of subject, tasks, total time, average per task, average estimate, and over/under, sorted by total time, each row with the same thin accent rule the Reports page uses. Beneath it, the ten tasks that most overran their estimate (task, subject, estimate, actual, overage, and days taken if it rolled). Overage counts only finished tasks that have both an estimate and logged time.
4. **Longest gaps** — the eight longest between-task gaps in the range: duration, day, and the pair ("Math → Latin"), so it's clear which transitions cost the most.

With nothing tracked yet, the page is one muted line saying so.

A running clock can't tell *working* from *sitting there* — paper work happens off-screen — so this is a pattern-finder over many days, not a minute-accurate record, and the parent's corrections exist for the glaring cases.

**Out of scope:** history or any time stats on the student side, goals/targets/alerts, comparison to prior periods, export, idle detection, "add time," and a mobile layout for the dashboard (desktop-only, §1).

**Build plan.** Four phases, each ending in a commit (CLAUDE.md), none started until asked:
- **A — Data & logic.** `TimeEntry` and the two `Family` fields (both the sqlite and postgresql migrations), the recording rules, the day-summary functions behind the four buckets, the day-bar fill function, and tests: pause/resume summing, one open entry per student, `switched`, lapse sweeping, the sub-10-second discard, the buckets summing to the day, and the bar reaching 100% only when every estimated task is finished (including an over-running task and an early finish).
- **B — Student timer.** The `timeTrackingEnabled` setting, hover wash and right-edge play triangle (dropping the Student Mode identity bar), timer screen, Finish into the §6 completion moment, the "In progress" mark, and the day bar fed by time worked (week view, plus pinned atop the timer screen).
- **C — Parent task time.** Actual time on the week board and the edit panel's Time section with corrections.
- **D — Dashboard.** `/parent/time` per the four sections above; the strips and the stacked bar stay inside §9's palette (grayscale plus the student's accent).
