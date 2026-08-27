# Handoff: Homeroom redesign (student week + Parent Mode)

## Overview
Homeroom (renamed from "Checkmate") is a private daily task tracker for a homeschooling family: one parent planning, two kids checking off work each morning. This handoff redesigns the two core screens — the student's own week view, and the parent's planning board — plus every popup in the app, to match TeuxDeux's interaction language as closely as possible: plain text, hover-reveal secondary actions, always-open inputs instead of "Add" buttons, and no full-screen dialogs. It also introduces a new brand (name, logo, color system) and a student-editable accent color.

## About the design files
The files in this bundle (`Canvas.dc.html`, `Checkmate Student Week.dc.html`, `Homeroom Logo.dc.html`) are **HTML design references** — prototypes showing the intended look, states, and interactions, not production code to copy directly. Your task is to **recreate these designs inside the existing Next.js/React codebase** (`elainechernov-boop/checkmate`), using its existing components, server actions, and Tailwind setup — not to port the HTML wholesale. `Canvas.dc.html` is the single most complete visual reference (every state, on one page); `Checkmate Student Week.dc.html` is a clickable version of the student week screen useful for confirming exact behavior (hover-reveal, drag, the name-color-cycle tap).

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy in `Canvas.dc.html` are final — recreate pixel-close using the codebase's existing Tailwind/inline-style patterns (see `src/lib/theme.ts`, which this redesign replaces — see Design Tokens below).

## Logo & favicon
- `assets/homeroom-wordmark.svg` — the "homeroom" lettering (hand-drawn, near-black). This is **the only logo mark that appears at the top of every screen** — student week and Parent Mode alike, no paired icon next to it there.
- `assets/homeroom-favicon.svg` — the checkmark-face mark alone (tennis-ball-green body, white eyes, ink checkmark/pupils). **This is the file to register as the site favicon / PWA / dock icon** — `<link rel="icon" type="image/svg+xml" href="...">` in the document head (and export raster sizes from it for any manifest/touch-icon needs). It is not used anywhere else in the UI.
- Both source SVGs ship with empty `<defs>` — the mascot's three paths (`face`/`eyes`/`check-and-pupils`) need explicit `fill` attributes (`#D8F609` / `#FFFFFF` / `#0B0B0C`) or they render solid black. Already fixed in the copy of `assets/homeroom-favicon.svg` in this bundle — if you re-export from the original design tool, reapply that fix.

## Screens / views

### 1. Student week (`src/app/student/[id]/StudentWeekView.tsx` + `DayColumn.tsx` + `AssignmentRow.tsx`)
**Purpose:** the one screen a kid opens each morning to see and check off that day's work.
**Layout:** wordmark image top-left, ~18–22px tall. Below it, a header row: student's name (tappable, see Interactions) + date range + streak/today count + prev/next-week links, plain text, bottom border 2px solid ink. Below that, a 6-column CSS grid (`repeat(6, minmax(0,1fr))`, no gap — columns separated by a 1px hairline `border-left`), one per Mon–Sat. Below the grid: a "Projects" band (horizontal row of quiet cards) and a "Someday" ideas list, both under a 2px ink top border.
**Components per day column** (order matters — mirrors `DayColumn.tsx`'s existing bucket order):
  1. Weekday name (uppercase, 13px/700, 0.04em tracking) + date + "done/total" count.
  2. A thin **minutes-progress bar** under the count — not an assignment-count bar, a *minutes-done ÷ minutes-total* bar for that day, in the student's accent color (new — see "New feature" below for the color rule; see Projects' own progress bar for the visual precedent this reuses).
  3. Rolled-forward items first, each with a small "»"/"»»" roll mark in crimson.
  4. **Time-sensitive callout cards** for anything "live now" or "starts within 60 min" — not a plain row: `border-top`/`border-bottom: 1.5px solid`, tinted background, a small label above the title ("LIVE NOW" / "Starts in N min"), a 6px pulsing dot only when live. Crimson for live-now, cobalt for starts-soon. Anything further out stays a plain row with a quiet "Today at H:MM" chip in its meta line.
  5. Plain open rows: a 3px color bar (subject color, or the item's own/student's accent for a project task or self-typed item) + title (13px) + meta line (10.5px muted).
  6. Separator dividers (hairline + small uppercase label) exactly where the parent placed them.
  7. Pending-review rows: title + inline "✋ Mom" + "🔑" (passcode-approve), crimson, 10.5px.
  8. Completed rows: struck-through, muted gray bar and text.
  9. **Only on today's column:** a permanent blank input, placeholder "Type here, press Enter" — no "+" anywhere.
  10. Minutes-total footer.
**Projects band:** ~240px cards — name in the headline font (see Typography) + "by <date>" + a 3px progress bar (accent color) + backlog task rows with an inline "Plan it" link + a permanent "Add a step" input. A collapsed "▸ Finished (N)" link below.
**Ideas list:** plain rows with an inline "→ Start project" link + a permanent "Type an idea, press Enter" input.

### 2. Parent Mode (`src/app/parent/ParentWeekBoard.tsx` + `src/lib/familyCalendar.ts`)
**Purpose:** the parent's planning surface — assign work, see the family's outside calendar overlaid, approve pending-review items.
**Layout:** same wordmark treatment top-left, then a plain nav row: "This Week" (active) · "Students" · "Subjects" · "Reports" · a muted "⋯" for the rest (calendar-import settings, the passcode-unlock gate). Below it, stacked white cards (`border-radius: 12px`, one subtle shadow):
  1. **"This Week — Family Calendar"** — one shared 6-column agenda (not duplicated per student, which is what the code does today — the single biggest structural fix). Each event: title, time/"All day", hover-✕ dismiss, two small circular per-student initial chips (tap, or drag the row onto a board below, to assign it there — it then disappears from this shared agenda).
  2. **Each student's own complete 6-day board**, one card per kid, name in their own accent color and the headline font. Every day: its day-type tag if not a normal school day ("Field trip", "Sick day"), any calendar event assigned to that kid that day (inline, hover-✕ to unassign back to the shared agenda), separators, plain rows (hover-delete), a **permanent blank "Type here, press Enter" input on every single day** (not just today — a parent plans ahead across the whole week, and not gated behind a "+ Add" button the way the current code has it). A pending-review row gets inline "Approve"/"Return" text links (no passcode needed on the parent's own side). Minutes totals per board.

### 3. Settings pages (Students, Subjects, Reports, Family Calendar settings)
Same plain-text/hairline language, no boxed buttons: a list of rows + one permanent "Add ___, press Enter" input at the bottom of each list, matching the rest of the app. Reports shows per-subject hours as plain rows + a thin progress bar per student, with a plain-text "Export as PDF work sample →" link.

### 4. Mobile (student week + Parent Mode)
Below the 6-column breakpoint, both screens swap the grid for one day at a time: a centered day label + small dot row (tap a dot, or swipe, to change days) replaces the grid, same wordmark up top. Same rows, same rules — only two differences from desktop: no drag (it would fight the swipe gesture), and delete is **always-visible**, not hover-reveal (no hover on touch).

## Interactions & behavior — write this carefully, it's the actual brief
1. **Completing work:** click/tap the row's title text. No checkbox, ever. Struck-through + muted = done.
2. **Adding anything:** type into the one permanent blank input for that list and press Enter. There is no "+" button anywhere in the redesigned app — not for a new assignment (student or parent side), not for a project, not for an idea.
3. **Secondary actions (delete) only reveal on hover**, over a row you're allowed to delete. Per-row hover state controlling opacity (not CSS-only `:hover`, if you need touch parity — reveal on tap-and-hold, or make it always-on below `sm`).
4. **No centered/full-screen modals for utility actions.** There is no "..." menu anywhere, on any row — every row has at most: title (click = complete), meta line (click = expand/collapse an inline details panel), and hover-✕ (delete). Specifically:
   - `AssignmentDetailsModal` / `ProjectDetailsModal` → click the row's **meta line** (never the title) to expand a plain panel directly beneath the row: notes/subject/due date/status as plain text. Click it again, or click elsewhere, to collapse — no backdrop, nothing else dims. For a student this panel is read-only. For a parent, every field in that same panel is simply always click-to-edit inline (a field turns into a text input on click) — there's no separate "edit mode" toggle.
   - `NewProjectModal` → the permanent "Start a new project, press Enter" input at the end of the Projects band.
   - `PlanTaskModal` → clicking "Plan it" on a backlog task turns that same spot into an inline date field (Enter commits) in place, never a sheet.
   - `EditAssignmentModal` (parent) → identical inline-expand/edit pattern, on the parent's own board.
   - `ApprovalPasscodePopover` → keep as a small anchored popover (already close to right) — strip chrome to plain digits + a hairline, no shadow/backdrop.
   - `ComingUpPanel` → a slide-in panel is fine (TeuxDeux has no direct equivalent) but strip its internal rows to plain text, no boxes.
   - `UndoMenu` → a plain text "Undo" link/toast, not a menu.
5. **Keep the completion celebration exactly as it is today** — a random emoji shoots from the tapped row with a trailing sparkle stream, plus a sound (`ItemCelebration.tsx`). This is the one deliberate exception to "no chrome": "one satisfying completion moment" is the actual design goal, not something to flatten away. Same for `ReminderTakeover`, `DayCompleteTakeover`, `ProjectFinishedTakeover` — full-screen moments, keep them. The **only** change: recolor the sparkle trail to the brand palette (tennis-ball green, magenta, cobalt, sea foam, poppy) instead of generic confetti colors. The emoji itself can stay random/generic.
6. **Time-sensitive computation** (new logic): given `scheduledTime` + estimated duration, compute one of `live` (pulsing dot, "LIVE NOW"), `soon` (within 60 min, "Starts in N min"), `later` (a quiet time chip on a normal row), or `past`. Reference: `timeBadge()` in `Checkmate Student Week.dc.html`'s logic class — port the same thresholds into `src/lib/reminders.ts`.
7. **Family calendar drag-and-drop:** an agenda event is a native HTML5 drag source (`draggable`, `dragstart` sets the event id); each day cell on each student's board is a drop target. Dropping assigns that event to that student+day — it renders inline there and disappears from the shared agenda. Replaces the current per-student-duplicated-feed behavior; `ParentWeekBoard.tsx`'s existing `CALENDAR_EVENT_PREFIX` drag-id scheme is the right *mechanism* to adapt, only *where the event renders* changes.
8. **Name color, no picker UI:** tap a student's own name (shown as tappable via a dashed underline, in their current accent color) and it advances to the next color in a fixed rotation — see below. No swatches, no color well, no dots.

## New feature: student-editable accent color
Tapping a student's own name cycles it through this fixed order: `#1657FF` (cobalt, default) → `#F0179E` (magenta) → `#2FD9A8` (sea foam) → `#D8F609` (tennis-ball) → `#FF9500` (poppy) → `#B15CFF` (violet) → back to cobalt. Whichever it lands on becomes, **on that student's own board only**:
- Their name's text color in the header.
- Today's day-name color and its top rule.
- The day-minutes-progress bar's fill color (see Screens §1.2).
- The 3px color bar next to their own typed/project-task rows.
- The "starts soon" callout's border/text (the "live now" crimson is a fixed semantic alert color and never changes, regardless of accent).
Persist to the `Student.accentColor` field that already exists (`prisma/seed.ts` seeds it as admin-only today) — add a server action the student's own client can call, and thread the returned color through exactly where `student.accentColor` already flows in `AssignmentRow.tsx`/`DayColumn.tsx`.

## State management
- `Student.accentColor` — now student-writable via a new server action, not just parent/seed-writable.
- Per-day minutes-done/minutes-total is derived at render from the day's instances (sum `estimatedMinutes` where `status !== open`, over sum of all) — not stored.
- Time-sensitive state (`live`/`soon`/`later`/`past`) is derived at render from `now` vs. `scheduledTime` + duration, recomputed every poll (matches the existing 60s refresh in `StudentWeekView.tsx`).
- Family-calendar-event-to-student assignment needs a new relation (today's schema only has global dismiss via `DismissedCalendarEvent`, no per-student link). Add `CalendarEventAssignment { eventKey, studentId }`, mirroring the dismiss table's upsert-on-conflict pattern.
- Inline-expand/edit state (assignment/project details) is local component state (which row is expanded) — no schema change beyond making the existing fields parent-editable inline instead of via a modal form.
- Hover-reveal state is local per-row state (or CSS `:hover` where touch parity isn't needed).

## Design tokens
```
Colors
--ink:      #1A1A1A   text, icons, rules
--cream:    #FAF7F2   page background
--muted:    #6B6B6B   secondary text, meta lines
--hairline: #E1E3E6   thin rule color — replaces boxes/shadows wherever possible
--tennis:   #D8F609   brand accent — the logo's own color; sparingly in UI
--cobalt:   #1657FF   UI primary / default student accent
--crimson:  #E8264B   attention only — live-now, "Show Mom" — never a student accent, never changes
Student accent rotation (tap-to-cycle): #1657FF → #F0179E → #2FD9A8 → #D8F609 → #FF9500 → #B15CFF → #FF5E00 (bright orange)

Typography
Inter 400/500/600/700 — everything: body, rows, nav, section labels.
Syncopate 400/700 (Google Fonts, uppercase-only, wide letter-spacing) — the one "fun, wide" headline font, used ONLY for a student's own name and project titles. Nothing else. Uppercase + ~0.03–0.04em extra tracking wherever it's used (it has no real lowercase forms).
13px row titles · 10.5–11px meta/labels · ~17–22px headline (Syncopate) · 12px nav

Spacing / shape
3px color bars (not badges) for subject/project/accent identity on a row
1px hairlines between columns and under rows; 2px ink rule under major section headers
1.5px top+bottom rule (not a rounded card) for time-sensitive callouts
No border-radius on the week grid itself; 8–12px radius only on Parent Mode's white cards
```

## Assets
- `assets/homeroom-wordmark.svg`, `assets/homeroom-favicon.svg` — final, ready to use as-is (see "Logo & favicon" above for exactly where each goes).
- Both originated from user-provided SVGs exported from an external design tool.

## Files
- `Canvas.dc.html` — the complete visual reference: logo, full color palette + usage notes, type sample (including the Syncopate headline treatment), the entire student week (every state, all 6 days, minutes-trackers, name-tap-to-cycle), the entire Parent Mode screen (shared agenda + both students' full boards, permanent add-inputs on every day), Students/Subjects/Reports/Calendar-settings cards, the mobile single-day-pager pattern, the completion-burst reference, and two "popup → inline" before/after examples (student read-only vs. parent editable).
- `Checkmate Student Week.dc.html` — a clickable prototype of the student week screen (click rows, hover for delete, drag a family-calendar event, tap a name to cycle its color). Earlier explorations are preserved higher up the page for context; the direction to build is the one `Canvas.dc.html` shows.
- `Homeroom Logo.dc.html` — logo exploration history, kept for context only.

## Open questions for you
1. The 60-minute "starts soon" threshold is a mockup guess — confirm or adjust.
2. Confirm the settings/admin pages should get this same treatment (mocked briefly here) rather than staying closer to their current plain-form look.
