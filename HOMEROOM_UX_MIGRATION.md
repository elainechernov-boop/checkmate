# Homeroom UI/UX audit and Claude Code implementation brief

Prepared against:

- The current `main` branch of `elainechernov-boop/checkmate` at commit `24c94bf`.
- `Canvas.dc.html`, the primary visual reference.
- The accompanying redesign handoff in `README.md`.
- The final Homeroom wordmark and favicon SVGs.
- Elaine's product decisions recorded below.

This document is both a UX recommendation and an implementation specification. The first half explains what the interface should become. The second half tells Claude Code how to change the existing application safely, in phases, using the real files in the repository.

## 1. Executive conclusion

The current repository is not a failed implementation and should not be restarted. Its data model, server actions, calendar import, roll-forward logic, reminders, review workflow, drag-and-drop system, reports, animations, and responsive pager are already substantial and currently healthy. At the time of this audit:

- `npm run lint` passes.
- All 149 tests pass.
- `npm run build` completes successfully.

The problem is that the redesign has been applied unevenly. Claude has made many accurate local changes, but the app does not yet feel like one intentionally designed system. Styling is repeated inline, several screens still use the old product model, and some interactions contradict either the new handoff or Elaine's decisions.

The cleanest direction is to make Homeroom feel like two related but deliberately different products:

1. **Student Mode is a calm completion surface.** A student sees the week, understands today's workload, opens read-only details, completes work, and receives the existing celebration. Students do not create assignments, project steps, or ideas.
2. **Parent Mode is the planning surface.** The parent creates, edits, schedules, assigns, organizes, and deletes everything. Fast daily planning happens directly in the week. Occasional advanced controls remain available without dominating every row.

That division is more TeuxDeux-like than the current hybrid. It reduces the number of verbs on the children's screen and puts complexity where it belongs.

## 2. Decisions and source-of-truth order

### Elaine's decisions

These override conflicting language in the prototype and the old specification:

1. **Students cannot create tasks.** Miles and Violet may complete assigned work, but they do not get an ad-hoc quick-entry field and do not author project steps or Someday ideas.
2. **Assigned family-calendar events remain in the shared agenda.** Small student indicators show who has received each event. The agenda remains a complete family calendar and supports assigning one event to more than one child.
3. **Advanced assignment setup is occasional.** Recurrence, multiple students, review requirements, scheduled times, and reminder lead times remain available, but they should not crowd the everyday quick-add and quick-edit experience.

### Precedence when sources disagree

Use this order:

1. Elaine's decisions in this document.
2. Behavioral rules in the redesign handoff.
3. The visual appearance and measurements in `Canvas.dc.html`.
4. Existing working functionality in the repository.
5. The older `SPEC.md`, only to fill a gap not answered above.

Do not treat the HTML prototype as production code. It contains mockup artifacts, including a few `+ Add` placeholders that contradict its own “no plus button” rule. Recreate the design with the existing Next.js, React, Tailwind, Prisma, Framer Motion, and dnd-kit architecture.

### Explicitly resolved prototype inconsistencies

- The design says both six and seven student accent colors. Use the seven-color rotation already represented by the canvas and current `theme.ts`: cobalt, magenta, sea foam, tennis, poppy, violet, bright orange.
- The design sometimes says a starts-soon callout is cobalt and elsewhere says it inherits the student accent. Use the **student's accent** for starts-soon; live-now remains fixed crimson.
- A later scheduled time is quiet metadata, not a crimson alert. Crimson is reserved for live/attention/review states.
- The canvas's outer `#EFEFEA` is the design-document stage, not the app background. Use the defined warm cream `#FAF7F2` for the application.
- Parent Mode calendar events stay visible after assignment, per Elaine's decision, even though one handoff sentence says they disappear.
- Student quick-entry, `Add a step`, `Plan it`, project creation, and Someday creation are removed from Student Mode, per Elaine's decision.

## 3. Design system

The current app relies heavily on inline color and spacing values. Before touching individual screens, create a small shared design system so later pages cannot drift.

### Color tokens

Define these as CSS custom properties in `src/app/globals.css`. TypeScript may re-export them from `src/lib/theme.ts` where runtime color values are required, but CSS should be the primary visual source.

```css
--hr-ink: #1A1A1A;
--hr-cream: #FAF7F2;
--hr-white: #FFFFFF;
--hr-muted: #6B6B6B;
--hr-faint: #A9ACB2;
--hr-hairline: #E1E3E6;
--hr-dashed: #C7C2B8;
--hr-tennis: #D8F609;
--hr-cobalt: #1657FF;
--hr-crimson: #E8264B;
--hr-magenta: #F0179E;
--hr-seafoam: #2FD9A8;
--hr-poppy: #FF9500;
--hr-violet: #B15CFF;
--hr-orange: #FF5E00;
```

Rules:

- Ink is the default text, icon, and major-rule color.
- Cream is the standard page background.
- White is reserved for Parent Mode cards and the print report.
- Muted is secondary copy; faint is tertiary copy and passive controls.
- Tennis is a brand accent, progress/burst color, or filled surface with ink text. Do not use tennis as small text on cream or white because it lacks contrast.
- Crimson is semantic: live now, review attention, errors, and destructive actions. It is never a student accent.
- Cobalt is the default system color and default student accent, but student-specific surfaces use that student's selected accent.
- Subject colors remain muted and live only in the 3px identity bar. Do not turn them into badges or colored cards.

### Accent rotation

Use this order everywhere:

```text
#1657FF → #F0179E → #2FD9A8 → #D8F609 → #FF9500 → #B15CFF → #FF5E00 → repeat
```

If a legacy database color is outside the list, the next tap should land on cobalt. Use an ink treatment for text placed on tennis; do not rely on tennis-colored small text.

### Typography

- Inter 400/500/600/700 is the interface typeface.
- Syncopate 700 is used only for a student's name and project titles.
- The SVG wordmark is never recreated as text.
- Student/project Syncopate text is uppercase with `0.03em–0.04em` tracking.
- Row titles: 13px desktop and mobile.
- Metadata: 10.5–11px.
- Parent navigation: 12–12.5px.
- Section labels: 11px, uppercase, 700, approximately `0.10em` tracking.
- Student headline: 19px desktop; day-pager headline: 16px mobile.
- Settings-page title: 24px, Inter 500 or 600. Do not use Syncopate for page titles.

### Shape and spacing

- The week grid itself has no radius, gap, individual cards, or shadows.
- Day columns are separated by 1px hairlines.
- Major section rules are 2px ink.
- Task identity bars are exactly 3px.
- Time-sensitive callouts use 1.5px top and bottom rules, a very light tint, and no card radius.
- Parent Mode's large containing cards use 12px radius and `0 1px 3px rgba(0,0,0,.06)`.
- Inputs are transparent with a bottom hairline or dashed line. Avoid rectangular input boxes except password fields and true error/confirmation surfaces.
- Maximum desktop content width is 1440px, centered.
- Use approximately 40px desktop outer padding and 16px phone padding.
- Switch from the six-column layout at approximately 1100px, not blindly at Tailwind's default `lg` breakpoint if columns become cramped.

### Shared primitives to create

Use shared components/classes rather than duplicating visual decisions:

- `AppShell`: cream background, centered max width, responsive padding.
- `BrandHeader`: wordmark and optional right-side navigation.
- `ParentNav`: the same navigation on every Parent Mode route.
- `PageHeading`: back/context link, title, description.
- `FlatField`: label plus bottom-rule input/select/textarea.
- `InlineEntry`: permanent text line with Enter/Escape behavior.
- `TextAction`: unboxed text button with consistent focus/disabled states.
- `TaskIdentityBar`: 3px semantic/subject/accent rule.
- `InlineDetailsPanel`: hairline-separated expansion beneath a row.
- `SettingsCard`: the one white, lightly shadowed 12px parent card.
- `HoverAction`: hidden on pointer-hover desktops, visible on focus and touch layouts.
- `UndoToast`: a plain text summary plus Undo action, not a menu.

Do not build an elaborate component library. These primitives exist only to keep every route visually coherent.

## 4. Global interaction rules

### Completion

- In Student Mode, clicking or tapping the **title text** completes or undoes an item.
- No checkbox is shown.
- Only today's eligible items are interactive. Prior and future items are view-only.
- An item requiring review enters pending review rather than done.
- Preserve `ItemCelebration`, `DayCompleteTakeover`, `ProjectFinishedTakeover`, the sound, and reduced-motion behavior.
- Preserve the current randomized emoji and use only the Homeroom palette for sparkles/confetti.

### Details and editing

- Clicking a row's metadata expands/collapses details directly beneath it.
- Clicking the title never opens details.
- Student details are read-only.
- Parent details expose everyday fields inline.
- Because advanced options are occasional, the compact panel contains title, subject, minutes, details, due date, and review status. A plain `More options →` link opens the restrained advanced editor for recurrence, series scope, fixed time, and reminder lead.
- Do not render the entire advanced recurrence form inside a 150–200px day column; it creates a very tall, cramped, un-TeuxDeux-like card.

### Adding

- Parent day columns always have `Type here, press Enter`.
- Enter creates; Escape clears. Blurring does not create.
- Keep focus in the field after a successful creation so the parent can enter several tasks quickly.
- There is no `+ Add` or floating plus button.
- Student day columns have no input.

### Deleting and undo

- Parent row delete is a hover/focus-revealed `×` on desktop and always visible on touch layouts.
- Deleting a single assignment occurrence should happen immediately and produce an Undo toast.
- Do not use `window.confirm` for ordinary task/idea/step deletion.
- A destructive operation affecting a full recurring series, an entire project, a student, a subject with dependencies, calendar settings, or a learning period should use a small **inline confirmation** (`Delete series? Delete · Cancel`), never a centered browser dialog.
- Keep a keyboard-focusable alternative to every hover-only action.

### Drag and mobile alternatives

- Desktop supports row reorder and cross-day move where already allowed.
- Student Mode may reorder today's assigned rows within existing separator boundaries; students cannot reschedule across days or manipulate a project backlog.
- Parent Mode may reorder and reschedule assignments.
- No drag on touch/mobile because it conflicts with day swiping.
- Mobile details panels must provide an explicit date field or `Move to…` action as the non-drag alternative.

### Async feedback

- Optimistic updates are appropriate for toggle, reorder, assign, and quick-add.
- On failure, restore previous state and show a quiet inline error or toast. Do not silently catch failures.
- Announce success/error state with an `aria-live` region where the visual update alone is ambiguous.

### Keyboard and focus

- Enter commits text entry and inline edits.
- Escape clears an unused add field or closes/cancels an open inline editor.
- `Coming Up`, menus, and popovers close on Escape and return focus to the invoking control.
- Every interactive element needs a visible focus style even when hover chrome is suppressed.

## 5. Screen-by-screen UX audit

### 5.1 Family password gate — `/gate`

**Current:** Functional but generic: a rounded boxed password field and a full-width black button on white.

**Recommended:**

- Cream full-page background.
- Centered wordmark at approximately 150–160px wide.
- One restrained password field, preferably a bottom-rule treatment with enough height for usability.
- Plain ink `Enter →` action rather than a large black rectangle.
- Incorrect-password text directly beneath the field in crimson.
- Preserve autofocus, Enter submission, `from` redirect, cookie behavior, and all security logic.
- Do not add marketing copy, mascot imagery, illustrations, or a card around the form.

### 5.2 Student picker — `/`

**Current:** Already close to the correct direction.

**Recommended:**

- Cream background; wordmark centered at 150–160px.
- `Who's working today?` in small muted Inter.
- Student names in Syncopate using each accent; dashed underline indicates the link.
- Maintain generous separation between names.
- Parent Mode remains a small muted link below.
- Do not show the favicon mascot in the page UI.
- At phone width, stack student names vertically if horizontal spacing becomes cramped.

### 5.3 Parent passcode gate — `/parent/unlock`

Use the same visual grammar as `/gate`, with `Parent Mode` as the small uppercase context label. Preserve the separate passcode and session behavior. Use `Unlock →` as the plain action.

### 5.4 Student week — `/student/[id]`

This is the most important screen. It should feel calm enough to use every morning without explanation.

#### Header

- Wordmark top-left, 18–20px tall.
- Keep secondary actions quiet at top-right. A small top-level `⋯` menu is acceptable for Coming Up, sound, switching student, and Parent Mode; row-level kebab menus are not.
- Main header beneath it:
  - Student name in Syncopate, accent-colored, dashed underline, tap-to-cycle.
  - Visible week range beside the name; the current implementation omits this and must restore it.
  - Streak and today's done count on the right.
  - Previous/next week as plain text links.
  - If browsing another week, show a quiet Today link.
- The streak/count uses the student's accent rather than fixed cobalt.
- Omit `0-day streak`; show only today's count when streak is zero.
- Remove instructional copy such as “Tap Miles's own name…” from the production interface. The dashed underline and title/aria label are enough.

#### Week grid

- Six equal Mon–Sat columns with no gap.
- 1px left rules; optionally suppress the first column's left rule at the outer edge.
- Today's weekday and progress use the student accent.
- Day header: weekday, then `Sep 10 · 1/5 done`.
- Progress bar measures estimated minutes done divided by estimated minutes total.
- **Do not invent 30 minutes for an unestimated item.** Exclude null estimates from minute totals. If a day has no estimated minutes, hide the minutes bar/total and rely on the item count.
- Keep all columns aligned to the tallest column so minute totals settle at the bottom on desktop.
- For an empty today, show one faint `Nothing due.` line. Leave empty past/future columns silent rather than repeating six empty-state messages.

#### Task order

Render in this order:

1. Rolled-forward open work, oldest debt first.
2. Time-sensitive items and normal open work, respecting parent-placed separators.
3. Pending-review work.
4. Completed/excused work.

Calendar context may sit above the assignment sequence for that day, but it must remain visually distinct and read-only.

#### Standard task row

- 3px identity bar.
- Title at 13px ink.
- Metadata immediately after or just beneath the title at 10.5–11px muted.
- Parent-assigned subject rows use the muted subject color bar.
- Project tasks use the student's accent bar and project name metadata.
- Clicking title completes; clicking metadata expands details.
- Completed: gray bar, muted title, real wrapping strikethrough, no metadata.
- Pending review: no full strikethrough; slightly faded title plus `✋ Mom` and anchored key action in crimson.
- Roll marker uses crimson `»`, `»»`, etc., without a badge.
- Student has no delete, edit, add, plan, reschedule, or cross-day drag actions.

#### Time-sensitive states

- `live`: crimson 1.5px top/bottom rules, light crimson tint, pulsing 6px dot, `LIVE NOW`.
- `soon`: student-accent rules/tint/text, no pulse, `Starts in N min`.
- `later`: ordinary row with quiet `Today at H:MM` metadata.
- `past`: ordinary styling unless the task itself is complete; do not keep a past time in alert crimson.
- Keep the 60-minute starts-soon threshold.
- Live lasts from scheduled start through scheduled start plus estimated duration. If no duration is set, use a single documented fallback only for live-state computation, not for workload totals.

#### Details panel

- Student panel is read-only.
- Show only fields that exist: notes/details, subject/project, due date, estimate, time, and status.
- Do not render a meaningless `Status: Not done yet` block as the only content for a bare row; if there is no useful detail, metadata should not appear clickable.
- Collapse when the metadata is clicked again, Escape is pressed, or another row opens.
- Prefer one expanded row per day or per screen rather than many simultaneous open panels.

#### Student permissions and projects

Elaine's decision changes the prototype substantially:

- Remove the day quick-entry input.
- Remove `Start a new project`, `Add a step`, `Plan it`, project/step delete, project reorder, cross-day project-task drag, and Someday creation from Student Mode.
- Remove the Someday section from Student Mode.
- Keep a quiet, read-only Projects band only if active projects are useful for motivation. Recommended content:
  - Project title in Syncopate.
  - Target date.
  - Student-accent progress bar.
  - Read-only next/backlog steps, without controls.
  - Collapsed finished projects.
- If the read-only backlog proves distracting, the clean fallback is to show only project title, progress, and target date; scheduled project steps already appear in the week.
- Students may still complete a scheduled project step through its title like any assigned task.

#### Coming Up

- Keep the right-side slide-in panel.
- Use cream background, one left hairline, no card rows.
- A subtle backdrop is optional; avoid a heavy modal effect.
- Group by date with plain task lines and 3px subject/project rules.
- Read-only. Close on outside click, Close, or Escape, and restore focus.

#### Celebrations and reminders

- Preserve the current celebration and takeover components.
- Full-screen is allowed for reminder, day complete, and project complete because these are meaningful moments rather than utility dialogs.
- Reminder acknowledgement remains a clear real button because interruption requires a deliberate response.
- Respect reduced motion exactly as the current implementation does.

### 5.5 Student mobile week

- At widths below the week breakpoint, show one day at a time.
- Wordmark at approximately 16px tall.
- Centered `Wed · Sep 10` in the student accent with arrows and six 5px dots.
- Swipe left/right and dot taps change days.
- Do not render a second duplicate day heading inside the column; the pager heading is the day heading.
- No drag on mobile.
- Student rows retain title-completion and metadata-expansion behavior.
- No quick-entry field.
- Touch targets should be at least 44px tall even when the visible text is compact.
- Projects, if retained, stack beneath the selected day as read-only summaries.

### 5.6 Parent week — `/parent`

#### Global header/navigation

- Wordmark left, 22px tall.
- Right nav: `This Week · Students · Subjects · Reports · ⋯`.
- Add Projects as either a top-level item if parent project planning is frequent after this redesign, or the first item inside `⋯`. Recommended initially: keep it inside `⋯` to preserve the canvas hierarchy.
- Undo should not permanently consume nav space. Show a contextual Undo toast after a reversible action.
- Use this same header on **every** Parent Mode route, not only `/parent`.

#### Week navigation

- Place week range and previous/next controls in one quiet row above the agenda card.
- Avoid three widely separated links floating without a date anchor.
- Show Today only when browsing another week.

#### Shared family agenda

- One white 12px card above all student boards.
- Heading: `This Week — Family Calendar`; small source/context label on the right.
- Six day columns desktop, one selected day mobile.
- Calendar event: quiet cobalt tint, 3px cobalt left rule, title, time/all-day, hover/focus delete.
- Keep every event visible after assignment.
- Student initials are compact circular toggles:
  - Filled accent circle when not assigned.
  - Outlined/accent active state when assigned.
  - Clicking an active initial should unassign it; clicking an inactive initial assigns it.
- Remove repeated instructional text such as `drag to a kid, or` from every event. Put one faint instructional sentence beneath the agenda heading or rely on tooltips.
- Desktop drag onto a student board assigns the event to that student using the event's actual date.
- The event can be assigned to both children.
- Hover `×` hides the imported event globally from Homeroom; make the difference between hide and unassign clear in accessible labels.

#### Student planning cards

- One white 12px card per student.
- Student name in Syncopate using that student's accent, with week range beside it.
- Six day columns separated by hairlines.
- Parent “today” may remain fixed cobalt, as in the canvas; student name remains their personal accent.
- Day-type tag is quiet inline text (`Field trip`, `Sick day`) rather than a badge.
- Clicking the day header opens a small inline/anchored plain-text day-type chooser. Avoid a wide boxed select replacing the whole header.
- Assigned calendar events appear in the correct day and have hover/focus `×` to unassign. They remain in the shared agenda above.
- Assignment rows use the same visual anatomy as Student Mode.
- Metadata click expands the parent editor.
- Permanent `Type here, press Enter` input on every day.
- Parent review actions are inline `Approve · Return`; no passcode.
- Show per-day minute total at the bottom only when estimates exist. Do not split into visually competing `assignment` and `project time` footers unless Elaine later asks for that accounting distinction.

#### Parent quick-add

- Enter creates a one-off parent assignment on that student/date.
- New row appears optimistically and input stays focused.
- Default fields: parent-created, open, no subject, no estimate, no review.
- Metadata should show a quiet `Add details` rather than literal ellipsis characters.
- The row can then be expanded to add common details.

#### Parent row editor

The current `EditPanel` is comprehensive but too large for a day column. Replace it with two levels:

1. **Compact inline details** beneath the row:
   - Title.
   - Subject.
   - Estimate.
   - Notes/details.
   - Due date.
   - Requires review.
   - Delete this occurrence.
   - `More options →`.
2. **Advanced assignment route/panel** for:
   - Fixed scheduled time.
   - Reminder lead.
   - Recurrence.
   - Recurring-series scope and end conditions.
   - Series-wide deletion.

Common inline fields should commit on Enter or blur, with visible save/error state. For a recurring item, ask scope inline before committing a change that can affect the series; default visually to `This assignment only` but do not silently alter an entire series.

This is the one recommended departure from the handoff's “every field in the same panel.” It preserves the no-modal principle while avoiding an unusably tall form inside a narrow column.

#### Separators

- Existing separators remain hairline + uppercase label.
- Replace the permanently visible dashed `⠿ Separator` box with a quiet text action such as `— Add divider`, revealed on hover/focus desktop and visible on touch.
- Creating a divider happens inline at its destination.
- Keep Morning/Afternoon/Evening presets as plain text shortcuts, plus free text.
- No pill buttons or bordered chips.

#### Parent mobile architecture

The current implementation pages one day but stacks every student's board. The canvas implies a cleaner approach: one student and one day at a time.

Recommended mobile layout:

1. Parent Mode context and plain student tabs (`Miles · Violet`).
2. Day pager for the selected student.
3. That day's assigned calendar events and assignments.
4. Permanent parent input.
5. Shared agenda collapsed to the selected day above the student list, with initials for assignment.

Changing student should preserve the selected day. Changing day should preserve the selected student. No drag; use initials, inline date fields, and visible delete/unassign actions.

### 5.7 Students settings — `/parent/students`

**Current:** Flat list but still exposes a native color well and Save/Delete buttons on every row.

**Recommended:**

- Use the shared Parent header/nav and page heading.
- Plain hairline list, maximum width approximately 640px.
- Each row displays Syncopate/accent name, grade, and quiet actions.
- Click name or grade to edit inline; Enter/blur saves.
- Replace the arbitrary color picker with `Change color` that cycles the fixed palette, matching Student Mode. A tiny accent line can preview it.
- Hover/focus delete; inline confirmation because deleting a student is materially destructive.
- Permanent add row at the bottom with Name and Grade fields; Enter on the final required field creates.
- No black Save button and no card around each student.

### 5.8 Subjects settings — `/parent/subjects`

- Shared Parent header/nav and page heading.
- Plain row per subject: name, report category, faith-integrated status.
- Click a value to edit it inline; autosave on commit.
- Keep native select/checkbox semantics when editing, but show them only during edit rather than permanently presenting a settings form for every row.
- Hover/focus delete with dependency-aware inline confirmation/error.
- Permanent add-subject line at bottom.
- Keep the HST-category explanation, but shorten it and place it under the page title.

### 5.9 Reports landing — `/parent/reports`

**Current:** A sparse two-select form that jumps to the report.

**Recommended:**

- Shared Parent header/nav.
- Show a student section for each child, with learning-period selector in the section header.
- Plain subject-hour rows and thin progress bars using the student's accent.
- `Open HST meeting report →` as the text action.
- Keep empty/setup guidance contextual.
- Do not call the HST report a “work sample PDF”; it is a meeting-prep/activity report.

### 5.10 Print report — `/parent/reports/[studentId]/[lpId]`

- White print background regardless of app cream.
- Screen-only back and Print/PDF actions at the top.
- Wordmark may appear small in the printed header, but no favicon mascot.
- Student name, learning period, date range, and meeting date form the report header.
- Hours by subject remain exact rows with thin progress bars in the student's accent, not fixed cobalt.
- Completed-work log remains grouped by subject with completion dates.
- Ensure page breaks do not strand a subject heading at the bottom of a page.
- Preserve semantic HTML and print CSS.

### 5.11 Calendar and learning-period settings — `/parent/calendar`

- Shared Parent header/nav.
- Three white settings cards are appropriate here: family calendar, school-day range, learning periods.
- Family iCal URL contains a secret token. Once connected, show a masked/truncated value plus `Replace` rather than exposing the entire URL by default.
- Hidden events remain plain rows with `Show again`.
- `Remove calendar` requires inline confirmation.
- Range marking uses bottom-rule date/select fields and one plain Apply action.
- Learning-period rows show name/date range/meeting date, click-to-edit or restrained inline fields.
- Permanent add-learning-period row at the bottom.
- Deletion uses inline confirmation.
- Do not use centered modals.

### 5.12 Parent Projects — `/parent/projects`

Elaine's no-student-creation decision makes this page the complete project-authoring surface. The current page only creates projects and assigns a report subject; it is not sufficient.

Recommended structure:

- Shared Parent header/nav.
- One section per student.
- Active project cards visually match the Projects band: Syncopate title, target date, 3px student-accent progress, plain task lines.
- Parent can:
  - Create/rename/delete/reorder a project.
  - Set target date and HST subject.
  - Add/edit/delete/reorder backlog steps.
  - Schedule a step once or with a recurrence.
  - Move/unschedule a step.
  - Mark/restore project status where appropriate.
  - Manage that student's Someday ideas and promote an idea to a project.
- Use permanent entry lines: `Start a new project, press Enter`, `Add a step`, and `Type an idea, press Enter`.
- `Plan it` opens an inline date first; `Repeat…` reveals recurring choices only on demand.
- Advanced recurrence controls remain plain text/native fields, not filled pills.
- Finished projects collapse under `▸ Finished (N)`.
- Student Mode receives a read-only project summary from this data.

Authorization implication: move project/idea mutations out of student-owned client flows and require a valid Parent Mode session on the server. UI removal alone is not an authorization boundary.

### 5.13 Advanced new assignment — `/parent/assignments/new`

Keep this route because occasional complex creation deserves a dedicated, calm surface.

- Shared Parent header/nav.
- Visible essentials: title, students, subject, due date.
- Student selection is plain text/accent toggles, not large filled cards.
- Put details, minutes, fixed time/reminder, recurrence/end, and review requirement inside a collapsed `More options` disclosure.
- If any advanced field is populated, keep the disclosure open.
- Submit with a restrained `Create assignment →` action. A real button is acceptable, but it should not look like a large generic black CTA.
- Preserve multi-student copy behavior and all validation.

### 5.14 Menus, popovers, panels, takeovers, and toasts

- **Parent `⋯`:** thin hairline menu, no shadow-heavy floating card; contains Projects, New assignment, and Calendar/settings as appropriate.
- **Student `⋯`:** Coming Up, sound, switch student, Parent Mode.
- **Approval passcode:** anchored under the key, plain digits/input and hairline, no backdrop or shadow.
- **Coming Up:** slide-in, plain rows.
- **Undo:** contextual toast, not a nav menu.
- **Reminder/day/project takeovers:** preserve as the intentional full-screen exceptions.
- **Native `window.confirm`:** eliminate from user-facing flows and replace with Undo or inline confirmation.

## 6. Accessibility and usability requirements

- All hover-revealed actions must also appear on keyboard focus and be permanently visible on touch layouts.
- Use `:focus-visible` consistently.
- Touch targets are at least 44px even when visible typography is smaller.
- Color never carries meaning alone: live includes text/dot/rules; pending includes `Mom`; day types include labels; assigned calendar initials have accessible pressed state.
- Student accent cycling control needs an aria label announcing the current and next color.
- Calendar initial toggles use `aria-pressed`.
- Menus/popovers/panels manage focus and Escape.
- Drag operations have explicit non-drag alternatives.
- Preserve `prefers-reduced-motion` behavior.
- Avoid low-contrast tennis-colored text.
- Use `aria-live` for async failures and successful destructive Undo availability.
- Password and passcode fields keep proper labels even when labels are visually hidden.

## 7. Current-code findings that Claude Code must account for

1. `src/lib/theme.ts` and numerous components duplicate visual tokens in JavaScript/inline styles. Consolidate without breaking runtime accent calculations.
2. `src/app/globals.css` currently sets a white app background. Change application surfaces to cream while preserving the print report's white background.
3. `StudentWeekView.tsx` omits the week range, uses fixed cobalt for the streak, and contains student project/idea mutation flows.
4. `DayColumn.tsx` currently invents a 30-minute estimate for untimed work. Workload totals should use actual estimates only.
5. `AssignmentRow.tsx` uses fixed cobalt for starts-soon and crimson for later/past time labels. Apply the semantic rules in this brief.
6. `ProjectsBand.tsx` and `IdeasList.tsx` are fully student-editable. Convert the student project display to read-only and move authoring to Parent Projects.
7. `projectActions.ts` and `projectIdeaActions.ts` are student-route server actions. Parent-only task creation must be enforced server-side, not just hidden.
8. `ParentWeekBoard.tsx` already has the correct shared-agenda relation and multi-student indicators, but each event repeats instructional copy and the mobile layout stacks all student boards.
9. `AssignmentEditPanel.tsx` renders every advanced field inside the narrow day column. Split everyday inline editing from occasional advanced editing.
10. `ParentWeekBoard.tsx` exposes a visually heavy dashed Separator handle in every day.
11. Parent settings routes do not share the parent wordmark/navigation shell.
12. Parent Projects cannot currently author project steps, although students will no longer be allowed to do so.
13. Reports landing is only a selector form; the canvas calls for visible report summaries.
14. Several components use `window.confirm`; replace as specified.
15. Many action failures are silently rolled back with no message. Add quiet feedback.
16. The existing `CalendarEventAssignment` relation already supports an event assigned to multiple students; preserve it.
17. The current test suite is healthy. Do not trade functional coverage for a visual rewrite.

## 8. File-by-file implementation map

### Foundation

- `src/app/globals.css`: tokens, shared focus/input/action classes, cream background, print overrides.
- `src/lib/theme.ts`: runtime token exports and accent rotation; keep one-to-one with CSS values.
- `src/app/layout.tsx`: fonts/metadata remain; simplify body styling to shared shell.
- `src/components/*`: add the minimal shared primitives and reuse existing `DayPagerControls`/`SwipeDayPager`.
- `public/homeroom-wordmark.svg`, `public/homeroom-favicon.svg`, manifest/icon metadata: preserve final assets and placement rules.

### Student

- `src/app/student/[id]/StudentWeekView.tsx`: header/date/stat colors, remove student authoring/cross-day project management, mobile structure.
- `DayColumn.tsx`: real minute totals, empty states, student-permission simplification, no student input.
- `AssignmentRow.tsx`: time semantics, detail behavior, one-open-row coordination, no student edit/delete controls.
- `ProjectsBand.tsx`: replace with read-only project summary or split into a read-only component.
- `IdeasList.tsx`: remove from Student Mode.
- `projectActions.ts`, `projectIdeaActions.ts`: remove unused student mutations or make them parent-authorized and relocate callers.
- `ComingUpPanel.tsx`, `ApprovalPasscodePopover.tsx`: focus/Escape/visual polish.
- Celebration/takeover components: palette/QA only; do not redesign their behavior.
- `src/lib/estimatedMinutes.ts`: separate real workload totals from any reminder-only fallback.
- `src/lib/reminders.ts`: retain 60-minute computation; callout colors are presentation responsibility.

### Parent week

- `src/app/parent/page.tsx`: shared parent shell/nav and week heading.
- `ParentWeekBoard.tsx`: agenda polish, compact inline editor integration, divider control, totals, mobile student/day selection.
- `AssignmentEditPanel.tsx`: reduce to essentials or split compact and advanced variants.
- `ParentNavMenu.tsx`: shared nav placement and menu polish.
- `UndoMenu.tsx`: convert to Undo toast behavior/name.
- `planner-actions.ts`, calendar actions, undo actions: preserve behavior; add authorization/error support as needed.

### Parent subpages

- `students/page.tsx` and actions: inline editing, fixed accent cycle, add line, confirmation.
- `subjects/page.tsx` and actions: inline editing, add line, dependency-safe deletion feedback.
- `calendar/page.tsx` and actions: shared shell, masked URL, cards, inline confirmations.
- `reports/page.tsx`: visible student/period summaries.
- `reports/[studentId]/[lpId]/page.tsx`: accent bars and print polish.
- `projects/page.tsx` and actions: full parent project/idea/step authoring.
- `assignments/new/page.tsx`, `AssignmentForm.tsx`: essential fields plus collapsed advanced disclosure.
- Add an advanced edit route/component only if it is cleaner than reusing the new-assignment form; preserve server edit semantics and series-scope choices.

### Authorization

- Add/reuse a server-side `requireParentSession` helper based on the signed parent cookie.
- Read the installed Next.js 16 documentation before using cookie APIs, per `AGENTS.md`.
- Apply the check inside parent-only server actions, especially project and idea mutation. Middleware protects pages, but the actions themselves must not rely solely on a hidden UI.

## 9. Phased Claude Code plan

Do not ask Claude Code to “redesign the whole app” in one prompt. Work through these phases and commit after each. Every phase ends with `npm run lint`, `npm test`, and `npm run build`.

### Phase 0 — baseline and conflict rules

1. Read `AGENTS.md`, `SPEC.md`, and this document.
2. State the conflict order from section 2 before editing.
3. Confirm the current baseline tests/build pass.
4. Create a feature branch.
5. Make no UI changes in this phase.

### Phase 1 — shared design foundation

1. Add CSS variables and small shared primitives.
2. Create shared AppShell/ParentNav/PageHeading/FlatField/TextAction styles.
3. Move global background to cream.
4. Preserve fonts, wordmark, favicon, metadata, and runtime accent behavior.
5. Refactor only enough existing code to prove the primitives on the root picker and parent header.

### Phase 2 — Student Mode and permissions

1. Implement the exact student header, grid, rows, time states, true minute totals, mobile pager, and read-only details.
2. Remove student quick-entry and all project/idea authoring controls.
3. Keep today-only reorder within separators, but remove student cross-day project manipulation.
4. Convert Projects to read-only and remove Someday from Student Mode.
5. Preserve celebrations, reminders, review/passcode, sound, polling, and reduced motion.
6. Remove/guard now-unreachable student mutation actions.

### Phase 3 — Parent week desktop and mobile

1. Polish shared agenda while keeping events visible and multi-assignable.
2. Polish student planning cards and quick entry.
3. Replace the oversized inline edit form with compact essentials plus More options.
4. Simplify divider creation.
5. Implement mobile student selection plus day paging, with no drag.
6. Add visible async errors and Undo toast.

### Phase 4 — Parent Projects

1. Move complete project, idea, and step authoring into `/parent/projects`.
2. Support parent create/edit/delete/reorder/plan/unschedule functionality.
3. Require parent authorization in server actions.
4. Keep legacy project data working.
5. Confirm student view remains read-only.

### Phase 5 — all remaining routes

1. Gate, picker, parent unlock.
2. Students.
3. Subjects.
4. Calendar/learning periods.
5. Reports landing and print report.
6. New/advanced assignment.
7. Apply shared Parent header/nav everywhere.

### Phase 6 — interaction, accessibility, and visual QA

1. Remove remaining `window.confirm` and inconsistent boxed/pill UI.
2. Verify focus, Escape, touch visibility, non-drag alternatives, `aria-live`, and reduced motion.
3. Add focused tests for student authorization, parent project actions, real minute totals, calendar multi-assignment, and mobile state selection.
4. Perform viewport QA and compare against the canvas.
5. Do not finish until every acceptance item in section 10 passes.

## 10. Acceptance matrix

Test at minimum:

- 1440×900 desktop.
- 1100×800 narrow desktop/week-grid boundary.
- 430×932 large phone.
- 390×844 standard phone.
- Safari/WebKit first; Chromium second.

### Global

- [ ] Cream page background; white only for parent cards and print.
- [ ] Wordmark used correctly; mascot only as favicon/app icon.
- [ ] Inter everywhere except student names/project titles.
- [ ] No unintended rounded task cards, filled badges, floating plus buttons, or row kebab menus.
- [ ] No utility centered/full-screen dialogs.
- [ ] No native confirm dialogs.
- [ ] Hover actions also work by focus and remain visible on touch.
- [ ] All parent pages share the wordmark/nav shell.
- [ ] No horizontal overflow at tested widths.

### Student

- [ ] Week range visible.
- [ ] Accent cycles through fixed palette and applies to name/today/progress/soon.
- [ ] Student cannot create, edit, delete, schedule, or move tasks across days.
- [ ] Student can complete/undo today's eligible work and reorder today's list within separators.
- [ ] Title completes; metadata expands.
- [ ] Minute totals exclude missing estimates.
- [ ] Live, soon, later, and past states have correct semantic colors.
- [ ] Pending review and passcode approval work.
- [ ] Projects are read-only; Someday authoring is absent.
- [ ] Coming Up, reminder, celebrations, sound, polling, and reduced motion still work.
- [ ] Mobile pager has no drag and no duplicate day header.

### Parent week

- [ ] Shared agenda shows all events even after assignment.
- [ ] Initial toggles assign/unassign one or both students.
- [ ] Desktop drag assigns to a student; event retains its true date.
- [ ] Hide and unassign are distinct and recoverable.
- [ ] Every parent day has permanent Enter-to-add input.
- [ ] Quick-add remains focused and handles errors.
- [ ] Common details edit inline; advanced options do not explode the day column.
- [ ] Single occurrence delete produces Undo.
- [ ] Dividers are quiet and usable.
- [ ] Parent mobile selects one student and one day; no drag.

### Projects/settings/reports

- [ ] Parent can fully author project plans; student cannot.
- [ ] Student and subject settings use inline rows and permanent add lines.
- [ ] Calendar secret is masked after connection.
- [ ] Learning-period and destructive actions use inline confirmation.
- [ ] Reports landing shows useful summaries, not only two selects.
- [ ] Print report is clean, paginated, and uses the student accent.
- [ ] Advanced assignment form hides occasional fields until requested.

### Regression

- [ ] Lint passes.
- [ ] All existing tests pass.
- [ ] Production build passes.
- [ ] Existing database records require no destructive reset.
- [ ] Roll-forward, recurrence materialization, review, reminders, calendar import, HST report data, and celebrations behave as before unless this document explicitly changes them.

## 11. Exact prompts to give Claude Code

Place this file at the repository root as `HOMEROOM_UX_MIGRATION.md`. Then use these prompts one at a time.

### Prompt 1 — baseline

```text
Read AGENTS.md, SPEC.md, and HOMEROOM_UX_MIGRATION.md completely. HOMEROOM_UX_MIGRATION.md is the authority for the redesign and overrides SPEC.md where it explicitly conflicts, especially student permissions, visual design, calendar-assignment behavior, and advanced-edit placement.

Do Phase 0 only. Inspect the current repository and report the exact files you expect each later phase to touch. Run lint, tests, and build. Do not edit application code yet. Stop after giving me the baseline and phase map.
```

### Prompt 2 — design foundation

```text
Implement Phase 1 of HOMEROOM_UX_MIGRATION.md only. Build the shared tokens and minimal UI primitives, update the global app background, and prove them on the root student picker and shared Parent header. Do not redesign the student week or parent boards yet. Preserve behavior. Run lint, tests, and build, then commit this phase and stop. Report screenshots/viewport checks and the commit hash.
```

### Prompt 3 — Student Mode

```text
Implement Phase 2 of HOMEROOM_UX_MIGRATION.md only. Treat Student Mode as completion-only: no task, project-step, project, or Someday authoring. Keep today-only completion and reorder, read-only details, celebrations, review/passcode, reminders, polling, sound, and reduced-motion behavior. Follow the exact visual/interaction rules and acceptance list. Remove or server-guard unreachable mutation paths rather than merely hiding buttons. Run lint, tests, build, and focused Student Mode viewport checks; commit and stop.
```

### Prompt 4 — Parent week

```text
Implement Phase 3 of HOMEROOM_UX_MIGRATION.md only. Keep the family agenda complete after assignment with multi-student indicators. Redesign the parent boards, quick-entry, compact inline editing, dividers, Undo feedback, and the recommended one-student/one-day mobile layout. Preserve all data behavior and desktop drag-and-drop. Run lint, tests, build, and all parent-week acceptance checks; commit and stop.
```

### Prompt 5 — Projects

```text
Implement Phase 4 of HOMEROOM_UX_MIGRATION.md only. Parent Projects becomes the sole complete authoring surface for projects, ideas, backlog steps, scheduling, recurrence, reordering, and deletion. Student Mode remains read-only. Add real server-side Parent Mode authorization to these mutations, preserving legacy records. Run lint, tests, build, and focused authorization/project tests; commit and stop.
```

### Prompt 6 — remaining screens

```text
Implement Phase 5 of HOMEROOM_UX_MIGRATION.md only, route by route. Apply the shared Parent shell to every parent page and finish gate, picker, unlock, Students, Subjects, Calendar, Reports, print report, and new/advanced assignment. Keep advanced assignment fields collapsed by default. Run lint, tests, build, and the route acceptance matrix; commit and stop.
```

### Prompt 7 — final QA

```text
Perform Phase 6 and the entire acceptance matrix in HOMEROOM_UX_MIGRATION.md. Do not add new features. Fix visual drift, focus/touch/accessibility problems, silent action failures, native confirm dialogs, mobile overflow, and regressions. Verify 1440×900, 1100×800, 430×932, and 390×844, prioritizing Safari/WebKit. Run lint, all tests, and production build. Commit only after every applicable acceptance item passes, then give me a concise exception list for anything that could not be verified.
```

## 12. Recommended `CLAUDE.md` addition

Add this short instruction near the top of the repository's `CLAUDE.md` while the migration is active:

```md
For all Homeroom UI work, read `HOMEROOM_UX_MIGRATION.md` completely before editing. It overrides `SPEC.md` where it explicitly conflicts. Work one numbered phase at a time, preserve existing behavior unless the migration says otherwise, run lint/tests/build, commit the phase, and stop for review. Do not port the `.dc.html` prototype wholesale.
```

## 13. Remaining non-blocking product questions

The recommendations above choose defaults so implementation can proceed. Elaine may change these later without invalidating the structure:

1. **Read-only Projects on Student Mode:** recommended yes, showing title/progress/target and perhaps next steps; alternative is to hide the band entirely because scheduled project tasks already appear in the week.
2. **Today-only student reorder:** recommended keep, because choosing work order gives autonomy without permitting creation/rescheduling.
3. **Zero streak:** recommended omit the streak phrase rather than displaying `0-day streak`.
4. **Accent palette:** recommended keep all seven options represented in the current theme/canvas.
5. **Parent Projects navigation:** recommended keep inside `⋯` initially; promote to top-level if it becomes a daily destination.

These are polish choices. They do not block the six-phase architecture above.
