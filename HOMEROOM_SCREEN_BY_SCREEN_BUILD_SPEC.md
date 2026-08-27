# Homeroom Exact Screen-by-Screen Build Specification

## Read this first

This is not a redesign brief. It is a construction specification for making the production Homeroom application look like the supplied Claude Design reference.

The literal visual source is:

`design_handoff_homeroom_redesign/Canvas.dc.html`

The target is the rendered screens inside that file. Claude Code must not treat them as a mood board, a suggested design system, or an invitation to make a similar interface. Build the same interface around the production data and behavior.

The application at `main` commit `263d1bc` has most of the correct functionality. Do not rewrite the app or change the data model unless a functional bug prevents the specified UI. This is a visual replacement pass.

## Absolute rules

1. Render `Canvas.dc.html` before editing.
2. Work on one route at a time.
3. Render the production route with representative data at the same viewport after editing.
4. Compare screenshots side by side and with a 50% opacity overlay.
5. Do not mark a route complete because its tokens or component names appear correct.
6. Do not add a color, fill, border, shadow, radius, badge, pill, card, icon, instructional sentence, or empty-state illustration unless it is explicitly authorized in this file.
7. If this specification does not authorize a visual treatment, use transparent background, zero radius, zero shadow, ink/muted text, and a hairline separator.
8. Preserve the user's product decisions:
   - Students cannot create tasks, projects, ideas, or project steps.
   - Assigned calendar events remain visible in the shared family agenda with student indicators.
   - Advanced assignment options exist but remain secondary.
9. The app page surface is white `#FFFFFF`. The gray-beige area surrounding the examples in Canvas is the design-document stage, not the product UI.
10. The SVG wordmark is the only mark shown in headers. The mascot is favicon/app icon only.

## Visual source precedence

When instructions conflict, use:

1. The visible rendered screen in `Canvas.dc.html`.
2. The exact inline style on the corresponding element in `Canvas.dc.html`.
3. This screen-by-screen specification.
4. The supplied SVG assets.
5. Existing working interaction and data behavior.
6. Design README prose.
7. `HOMEROOM_PIXEL_MATCH_CORRECTION.md`.
8. `HOMEROOM_UX_MIGRATION.md`.
9. Existing production styling.

The older migration file is not a visual authority. In particular, ignore its cream-background direction and its invented subject-color direction.

---

# Part I — Exact shared visual grammar

## 1. Color map

### Neutral colors

| Token | Value | Exact use |
| --- | --- | --- |
| White | `#FFFFFF` | Every normal page background; large Parent containers are also white |
| Ink | `#1A1A1A` | Primary text, ordinary open-task identity ticks, major rules |
| Muted | `#6B6B6B` | Metadata, navigation, secondary copy |
| Faint | `#A9ACB2` | Passive controls, minute totals, very quiet helper text |
| Hairline | `#E1E3E6` | 1px dividers, progress tracks, completed-task identity ticks |
| Dashed | `#C7C2B8` | Dashed underline/input rules only |

Remove `#FAF7F2` from all visible page surfaces. Do not substitute another off-white.

### Semantic/accent colors

| Color | Value | Exact authorized use |
| --- | --- | --- |
| Cobalt | `#1657FF` | System links shown cobalt, starts-soon state, family calendar, default student accent |
| Crimson | `#E8264B` | Live-now state, roll marks, pending review, destructive/error text |
| Tennis | `#D8F609` | Logo/favicons, student accent choice, completion sparkles only |
| Magenta | `#F0179E` | Student/project accent choice only |
| Sea foam | `#2FD9A8` | Student/project accent choice only |
| Poppy | `#FF9500` | Student accent choice/completion sparkles only |
| Violet | `#B15CFF` | Student accent choice only |
| Bright orange | `#FF5E00` | Student accent choice only |

### Delete the invented subject palette

Do not use any of these colors on week-board tasks:

`#5C7A6E`, `#B5734A`, `#8A4A4A`, `#6E7A4A`, `#A98A3E`, `#7A5C8A`, `#4A7A5C`, `#7A6A5C`, `#8A8272`, `#C97B4A`.

`src/lib/subjectColors.ts` must no longer control student or parent task-row styling.

### Exact identity-tick algorithm

For every student and parent assignment row:

```text
if completed or excused: #E1E3E6
else if project task: student/project accent
else if historical student-authored item: student accent
else: #1A1A1A
```

The subject appears as muted text metadata. Math, ELA, Latin, Science, History, Art, Scouts, Handwriting, and Other do not receive distinct colors.

## 2. Typography

Use Inter for all interface text except the two cases below. Use Syncopate 700 only for:

- a student's name;
- a project title.

Never use Syncopate for page titles, navigation, weekdays, buttons, labels, report headings, or form fields.

| Element | Family/weight | Size | Tracking/case |
| --- | --- | --- | --- |
| Student week name | Syncopate 700 | `19px` desktop | uppercase, `0.03em` |
| Parent student-board name | Syncopate 700 | `17px` | uppercase, `0.04em` |
| Project title | Syncopate 700 | `14px` | uppercase, `0.03em` |
| Mobile selected day | Inter 700 | `16px` | uppercase |
| Parent card title | Inter 700 | `17px` | normal case |
| Settings mini-card title | Inter 700 | `15px` | normal case |
| Weekday, student | Inter 700 | `13px` | uppercase, `0.04em` |
| Weekday, parent | Inter 700 | `11px` | uppercase |
| Student task title | Inter 400 | `12.5–13px` | normal case |
| Parent task title | Inter 400 | `12px` | normal case |
| Student metadata | Inter 400 | `10.5px` | normal case |
| Parent metadata/calendar time | Inter 400/700 | `10–11px` | as shown |
| Parent nav | Inter 400/600 | `12–12.5px` | normal case |
| Section label | Inter 700 | `11px` | uppercase, `0.10em` |
| Faint total/helper | Inter 400 | `10.5–11px` | normal case |

Do not use large dashboard typography. Most visible information is between 10px and 17px.

## 3. Radius map

| Element | Radius |
| --- | --- |
| Parent family-calendar outer container | `12px` |
| Parent student-board outer container | `12px` |
| Compact calendar-event block | `3px` |
| Live dot, pager dot, student initial | `999px` |
| Password field only, if a bounded field is required | maximum `8px` |
| Every other visible UI element | `0` |

Remove `rounded`, `rounded-sm`, `rounded-lg`, and `rounded-xl` from ordinary task rows, project rows, day types, inline editors, menus, text controls, delete targets, error feedback, undo feedback, assignment forms, and settings lists.

The rounded phone frames in Canvas are presentation mockups. They are not product components.

## 4. Shadow map

Only the large Parent family-calendar and student-board containers may use:

```css
box-shadow: 0 1px 3px rgba(0,0,0,.06);
```

No other element receives a shadow. Remove `shadow`, `shadow-lg`, drop shadows, and colored focus shadows from menus, rows, toasts, inline panels, and settings.

Celebration sparkles may retain their glow because they are animation, not interface chrome.

## 5. Lines and fills

- Standard divider: `1px solid #E1E3E6`.
- Major student section divider: `2px solid #1A1A1A`.
- Inline entry rule: `1px dashed #C7C2B8`.
- Standard editable field rule: `1px solid #E1E3E6` or dashed when explicitly shown.
- Time callout: `1.5px` top and bottom only, no left/right border, no radius.
- Student progress: `3px` track and fill, square ends.
- Calendar event: pale cobalt fill `rgba(22,87,255,.07)` plus `3px solid #1657FF` left border.
- Live fill: `rgba(232,38,75,.10)`.
- Soon fill: `rgba(22,87,255,.08)`.
- Ordinary tasks, projects, inputs, day cells, details, menus, lists: transparent.

## 6. Shared page frame

### Desktop

- Background: white.
- Maximum content width: `1400px` for matching the reference composition.
- Student page padding: `26px 30px 30px` at 1400px.
- Parent page horizontal padding: approximately `30px`; preserve the reference's 20px vertical gap between major sections.
- Do not put the whole app in a rounded outer card.
- Do not draw the 1px border around the entire student screen; that border is the specimen boundary in Canvas.

### Mobile

- Background: white edge-to-edge.
- Horizontal padding: `14px` at 390px and `16px` at 430px.
- Top padding: `16px`.
- No mobile card conversion.

---

# Part II — Screen specifications

## Screen 1 — Family password gate `/gate`

### Files

- `src/app/gate/page.tsx`
- `src/app/gate/actions.ts` only if needed to preserve feedback
- shared surface/input styles

### Desktop and mobile composition

Use a white viewport. Center one narrow column both horizontally and vertically. The column width is `280px` desktop and `calc(100vw - 32px)` up to a maximum of `280px` mobile.

Order:

1. Wordmark centered, width approximately `150px`, auto height.
2. `Family password` label after `28px`, Inter 500, `11px`, uppercase, `0.08em`, muted.
3. Password input, height at least `44px`, transparent or white, ink text, one hairline border or bottom rule. Maximum radius `8px`; no shadow.
4. Error immediately below, `11px` crimson, no background or icon.
5. `Enter →` after `16px`, plain ink text button, `13px`, 600. No fill, border, pill, shadow, or large black rectangle.

Do not add a card, heading paragraph, mascot, welcome copy, or footer.

### Behavior

- Autofocus input.
- Enter submits.
- Preserve `from` redirect and family cookie logic.
- Disable submission while pending without changing the visual size.
- Failure leaves focus in input and selects or clears the value consistently.

### Remove from current implementation

- Large boxed/rounded CTA styling.
- Any cream background.
- Any generic form card.

### Acceptance image

The screen should look like a nearly empty white page containing only the wordmark and a very quiet access form—not a login product page.

## Screen 2 — Student picker `/`

### Files

- `src/app/page.tsx`
- `src/components/AppShell.tsx`
- `src/components/AppShell.tsx` BrandHeader portion if retained

### Composition

White full viewport. Centered column.

1. Wordmark width `150–160px`.
2. `Who's working today?` after `28px`, Inter 400, `12px`, muted.
3. Student links after `18px`, separated by `24px` horizontally on desktop and `18px` vertically on narrow mobile.
4. Each student name: Syncopate 700, `18–19px`, uppercase, their accent color, `0.03em`, 1px dashed underline using the same accent.
5. Parent Mode link after `28px`, Inter 400, `12px`, muted, with no icon or container.

Do not show grade, avatar, initials, cards, pills, mascot, colored background areas, or descriptions.

### Mobile

Stack student names vertically if two links plus spacing exceed the viewport. Do not shrink the type below `17px` to keep them on one line.

### Behavior

- Student name opens that student's current week.
- Parent Mode opens the parent passcode gate when needed.
- Focus indicator is visible but not a permanent blue box.

## Screen 3 — Parent unlock `/parent/unlock`

Mirror Screen 1 exactly, with only these text changes:

- Small context label: `Parent Mode`.
- Input label: `Passcode`.
- Plain action: `Unlock →`.

Do not make it look more secure or more administrative through darker colors or a card.

## Screen 4 — Student week desktop `/student/[id]`

### Files

- `src/app/student/[id]/StudentWeekView.tsx`
- `src/app/student/[id]/DayColumn.tsx`
- `src/app/student/[id]/AssignmentRow.tsx`
- `src/app/student/[id]/ProjectsBand.tsx`
- `src/lib/subjectColors.ts`

This is the highest-priority pixel match.

### A. Page top

- White background.
- Padding `26px 30px 30px` at 1400px.
- Wordmark top-left, height exactly `18px`.
- Wordmark has `16px` space below it.
- Student utility `⋯` may remain top-right, but use a single faint `16px` glyph. Do not let it alter the wordmark/header alignment.

### B. Main week header

One flex row, baseline aligned, space-between. Bottom padding `18px`. Bottom border `2px solid #1A1A1A`.

Left group:

- Student name: Syncopate 700, `19px`, uppercase, `0.03em`, student's accent.
- Name includes `’s Week` exactly.
- 1px dashed underline in the same accent.
- Gap to week range: `14px`.
- Week range: Inter 400, `12px`, muted; format `Sep 8 – 13`.

Right group:

- Gap `16px`.
- Streak/today count: Inter 700, `12px`, uppercase, `0.04em`, student accent.
- Previous/next links: Inter 400, `12px`, uppercase, `0.04em`, muted.
- Do not use icons except the text arrows.
- If showing Today for an off-week view, use text `Today`, not a calendar emoji.

Do not render the Canvas annotation explaining color cycling.

### C. Week grid

- Six equal columns Monday–Saturday.
- `grid-template-columns: repeat(6,minmax(0,1fr))`.
- Gap `0`.
- Begin directly below the header; do not add the current `32px` top margin. Canvas places the grid immediately after the header/annotation area. With the annotation removed, use no more than `6px` breathing room before the grid.
- Each day column: `padding: 10px 12px 0`.
- Each column has a 1px left hairline. Suppressing the first left rule is acceptable only if overlay comparison proves the outside edge is cleaner.
- No column fill, radius, shadow, or hover surface.
- Columns stretch to a common height so minute totals align at the bottom.

### D. Day header

Order:

1. Weekday: `13px`, 700, uppercase, `0.04em`; ink except today uses student accent.
2. Date/count: `10.5px`, muted, uppercase; `2px` top padding; format `Sep 10 · 1/5 done`.
3. Progress track: margin `5px 0 6px`, height `3px`, hairline background, square ends.
4. Progress fill: height `3px`, student accent, square ends; width is estimated minutes done / estimated minutes total.

If no real estimates exist, do not invent time. Hide the progress track and minute total.

### E. Ordinary assignment row

- Display flex, align-start, gap `7px`.
- Padding `6–8px 0` depending on whether metadata wraps; keep all ordinary rows visually consistent within a viewport.
- Bottom border `1px solid #E1E3E6`.
- Background transparent.
- Radius `0`.
- Shadow `0`.
- Identity tick width `3px`, square, self-stretch, minimum height `22–24px`.
- Ordinary open task tick: ink.
- Title: `12.5–13px`, Inter 400, ink, line-height approximately `1.35`.
- Metadata: `10.5px`, muted, inline after the title when it fits; format `· Subject · 25 min`.
- Do not make metadata a chip or separate gray capsule.

### F. Completed row

- Tick becomes hairline gray.
- Title becomes muted.
- Real wrapping line-through.
- Hide ordinary metadata.
- Keep the same row padding and bottom hairline.
- No filled gray background.

### G. Rolled row

- Normal open-row anatomy.
- Tick is student accent only if it is a project/self item; otherwise ink.
- Crimson `»` or `»»` appears immediately after the title at `10.5px`, 700.
- No badge, tinted background, or left crimson inset shadow.

### H. Project task row

- Tick: student/project accent.
- Project name metadata uses the same accent at `10.5px`.
- Row itself remains transparent and square.

### I. Pending-review row

- Normal transparent row.
- Tick follows ordinary/project mapping.
- Title remains readable, not fully struck through.
- Append `✋ Mom` and the key action in crimson at `10.5px`, 700.
- Do not create a crimson card, banner, inset shadow, or badge.

### J. Live-now callout

- Margin approximately `6px 0`.
- Padding `7px 0`.
- Straight `1.5px solid #E8264B` top and bottom borders.
- No left/right border.
- No radius.
- Background `rgba(232,38,75,.10)`.
- Internal gap `8px`.
- Live dot: 6px circle, crimson, pulse unless reduced motion.
- Label: `10px`, 700, uppercase, `0.03em`, crimson.
- Title: `12.5px`, ink.
- Do not add an ordinary subject tick inside the callout unless visible in the reference state.

### K. Starts-soon callout

- Same square structure.
- Border `#1657FF`.
- Background `rgba(22,87,255,.08)`.
- Label cobalt; no pulsing dot.
- Title ink.
- Text `Starts in N min`.
- Do not inherit arbitrary subject color.

### L. Later/past scheduled task

- Render as an ordinary transparent row.
- Time is quiet metadata.
- Do not use a rounded time chip.
- Do not use crimson unless the event is actually live or pending review.

### M. Separator

- Row padding `8px 0 4–5px`.
- Hairline extends left and right.
- Label centered, Inter 700, `9–9.5px`, uppercase, `0.06–0.08em`, muted.
- No pill, background, radius, icon, or border box.

### N. Empty day

- Past/future empty days show whitespace.
- Today may show one faint `Nothing due.` at `11–12px`.
- No illustration, rounded empty-state panel, or colored message.

### O. Student permissions

Student page must not render:

- `Type here, press Enter`;
- `Add a step`;
- `Start a new project`;
- `Type an idea`;
- `Plan it`;
- delete controls;
- edit controls;
- cross-day scheduling controls.

Students click the title to complete today's eligible task and click metadata to expand read-only details.

### P. Minute footer

- At column bottom, `10.5px`, faint.
- Padding top `10px`.
- Format `65 min total`.
- Hide if no estimated minutes.

### Q. Projects band

- Margin top `22px`.
- Padding top `18px`.
- Top border `2px solid #1A1A1A`.
- Section label `Projects`: `11px`, 700, uppercase, `0.10em`, muted.
- Gap below label `10px`.
- Project list is horizontal, wrapping, gap `24px`.
- Each project width `240px`.
- Each project has `16px` left padding and a 1px left hairline.
- No fill, card radius, outer border, or shadow.
- Project title: Syncopate 700, `14px`, uppercase, ink.
- Target date inline after title: Inter 400, `11px`, muted, normal case.
- Progress: 3px square track/fill.
- Because students are read-only, show backlog steps as plain `12px` rows only; omit `Plan it` and `Add a step` controls from the prototype.
- Finished control: `▸ Finished (N)`, `12px`, faint, plain text.
- Remove Someday from Student Mode per the product decision.

### Student desktop removal checklist

- Remove `rounded-sm` from `AssignmentRow`.
- Remove `getSubjectColor()` from student task identity.
- Remove `mt-8` above desktop grid if overlay shows excess whitespace.
- Replace cream with white.
- Replace calendar/time chips that are more rounded than 3px.
- Remove calendar emoji from Today link.
- Remove any project card fills/radii.

## Screen 5 — Student week mobile

Use the same route/components as Screen 4 plus `DayPagerControls` and `SwipeDayPager`.

### Top

- White edge-to-edge page, `14–16px` horizontal padding, `16px` top padding.
- Wordmark height `16px`, bottom margin `10px`.
- Utility menu faint and right aligned.

### Pager

- One horizontal row: left text arrow, centered day label, right text arrow.
- Center label: `Wed · Sep 10`, Inter 700, `16px`, uppercase, student accent.
- Arrows: `11px`, muted.
- Dot row centered below, gap `5px`, padding `6px 0 12px`.
- Six dots, each 5px circle. Active uses student accent; all others hairline.
- Do not repeat weekday/date inside `DayColumn`.

### Rows

- Same square/hairline treatment as desktop.
- No conversion to rounded mobile cards.
- Visible content can have a minimum interactive height of 44px, but achieve that through invisible hit-area/padding without drawing a box.
- Delete is irrelevant in student mode.
- No drag; swiping remains reserved for changing days.

### Projects

- Stack project summaries below the selected day.
- Keep unfilled, square, hairline-separated.

## Screen 6 — Student read-only details

### File

- `src/app/student/[id]/AssignmentRow.tsx`

Click metadata, not title, to expand.

Expanded panel:

- Appears directly under the same row.
- Margin top `8px`.
- Padding `8px 0 2px 10px`.
- Top border `1px solid #E1E3E6`.
- Background transparent.
- Radius `0`.
- Shadow `0`.
- Vertical gap `6px`.
- Detail lines `12px` ink.
- Review status `12px` crimson only when relevant.
- No heading, Close button, backdrop, modal, or card surface.

Collapse when metadata is clicked again, Escape is pressed, or another row opens.

Do not make metadata appear clickable when opening would reveal no additional information.

## Screen 7 — Student utility menu

### File

- `src/app/student/[id]/StudentWeekView.tsx` `StudentMenu`

- Anchor below top-right `⋯`.
- White background.
- 1px hairline border.
- Radius `0`.
- Shadow `0`.
- Padding `4px 0`.
- Menu items `13px` muted, `6px 12px`.
- Items: Coming Up, sound toggle, Switch student, Parent Mode.
- No icons except the existing sound indicator if it is functionally useful; do not use emoji for navigation.
- Escape/outside click closes and focus returns to trigger.

## Screen 8 — Coming Up panel

### File

- `src/app/student/[id]/ComingUpPanel.tsx`

- Slide from right.
- Width approximately `320px` desktop; full width up to `360px` mobile.
- White background.
- Left border `1px solid #E1E3E6`.
- No radius or shadow.
- Header title Inter 700, `15px`.
- Close is plain `×`, faint-to-ink hover, no rounded control.
- Group headings `10.5px`, uppercase, muted.
- Rows transparent with bottom hairline.
- 3px tick mapping follows ordinary/project rules; no subject palette.
- Read-only.

## Screen 9 — Approval passcode popover

### File

- `src/app/student/[id]/ApprovalPasscodePopover.tsx`

- Anchored beside/below key action.
- White or transparent background.
- One hairline border or bottom-rule field.
- Radius `0`.
- Shadow `0`.
- No backdrop.
- Four-digit input with plain `11–12px` label.
- Error as crimson text only.
- Escape/outside click closes and restores focus.

## Screen 10 — Celebration and takeovers

### Files

- `ItemCelebration.tsx`
- `DayCompleteTakeover.tsx`
- `ProjectFinishedTakeover.tsx`
- `ReminderTakeover.tsx`

Preserve their behavior and animation. Only enforce:

- White background where a takeover covers the page.
- Sparkle colors limited to the Homeroom palette.
- No new card/pill styling.
- The reminder acknowledgement may remain a clearly tappable control because it is an interruption, but keep it visually simple and square/near-square.
- Respect reduced motion.

## Screen 11 — Parent global header

### Files

- `src/components/AppShell.tsx`
- `src/components/ParentNav.tsx`
- `src/components/AppShell.tsx` `BrandHeader`
- `src/app/parent/ParentNavMenu.tsx`

Use on every parent route.

- White page.
- Header display flex, center aligned, space-between.
- Horizontal inset `4px` inside page frame.
- Bottom padding `10px`.
- Bottom border `1px solid #E1E3E6`.
- Wordmark height exactly `22px`.
- Nav gap `20px`.
- Nav font `12.5px`.
- Active item ink/600.
- Inactive items muted/400.
- `⋯` faint.
- Do not add an additional page-level card around header/nav.
- Menu uses white, 1px hairline, zero radius/shadow.

## Screen 12 — Parent week desktop `/parent`

### Files

- `src/app/parent/page.tsx`
- `src/app/parent/ParentWeekBoard.tsx`
- `src/app/parent/AssignmentEditPanel.tsx`
- `src/app/parent/UndoMenu.tsx`

### A. Overall rhythm

- White page.
- Header followed by `20px` vertical gap.
- Major sections separated by `20px`.
- Do not place extra large page headings above the calendar; the reference moves directly from nav to content.
- Week navigation, if required, is one compact muted row and must not add a dashboard hero area.

### B. Shared family calendar outer container

- White fill on white page.
- Radius `12px`.
- Padding `20px 24px`.
- Shadow exactly `0 1px 3px rgba(0,0,0,.06)`.
- No visible border.

Header:

- Flex baseline, space-between.
- Bottom padding `12px`.
- Bottom hairline.
- Title `This Week — Family Calendar`, Inter 700, `17px`, ink.
- Context `from your Google Calendar`, `11.5px`, muted.

Calendar grid:

- Padding top `12px`.
- Six equal columns, no gap.
- Each column `0 10px` and 1px left hairline.
- Weekday `11px`, 700, ink.
- No column cards or rounded day areas.

### C. Shared calendar event

- Margin top `6px`.
- Padding `6px 7px`.
- Vertical gap `3px`.
- Radius exactly `3px`.
- Background `rgba(22,87,255,.07)`.
- Left border `3px solid #1657FF`.
- No shadow.
- Title `11.5px` ink.
- Time `10px`, 700, cobalt.
- Delete `×` `10px` faint; no visible button shape.
- Student initials 16px circles, `9px` 700, their accent.
- Use `aria-pressed` for assignment state.
- Keep event visible after assignment; indicators change state.
- One event may indicate both students.
- Do not repeat instructional prose inside every event.

### D. Student planning board outer container

One container per student:

- White fill.
- Radius `12px`.
- Padding `20px 24px`.
- Shadow exactly the approved shadow.
- Top-level margin/gap `20px`.

Board header:

- Baseline flex, gap `14px`.
- Bottom padding `12px`.
- Bottom hairline.
- Student name Syncopate 700, `17px`, uppercase, `0.04em`, student accent.
- Week range `11.5px`, muted.

Board grid:

- Padding top `10px`.
- Six equal columns, no gap.
- Day column `0 10px`.
- 1px left hairline.
- Minimum visual height approximately `150–170px` based on content, not a fixed card.

### E. Parent day header

- Weekday `11px`, 700, ink; today may use cobalt.
- Day type appended as `· Sick day` or `· Field trip` at `9px`, uppercase, faint/muted.
- No colored tag, brown tint, pill, select box, or inset shadow.
- Clicking can reveal a tiny plain inline chooser, but the resting state must match the line of text.

### F. Parent ordinary assignment

- Flex row, gap `6px`.
- Padding `5px 0`.
- Bottom hairline.
- Background transparent.
- Radius `0`.
- Tick width `3px`, height about `16px`, radius `0–2px` only if exact overlay demonstrates the Canvas's tiny tick rounding; default to square.
- Open ordinary tick ink.
- Completed tick hairline gray.
- Title `12px` ink or muted/struck when complete.
- Delete `×` appears on hover/focus desktop and always on touch; visually just the glyph.

Remove the current `rounded-sm`, subject color, day-state tint, and inset colored shadow from these rows.

### G. Assigned calendar event within student board

- Same calendar-event vocabulary: pale cobalt fill, 3px cobalt left rule, maximum 3px radius.
- Title `11px`.
- Time inline or below at `10px` cobalt.
- Hover/focus `×` unassigns from this student, but event remains above.
- No clock emoji.

### H. Separator

- Hairline/uppercase text exactly as Student separator.
- `— Add divider` is faint plain text, revealed on hover/focus desktop.
- No dashed box, handle chip, rounded control, or permanent bordered element.

### I. Parent quick entry

- Permanent at bottom of every day.
- Placeholder exactly `Type here, press Enter`.
- Margin top `5px`.
- Transparent input.
- No border except `1px dashed #C7C2B8` bottom.
- Padding `3px 0`.
- Font `11.5px` desktop.
- Radius `0`; shadow `0`.
- Enter creates; Escape clears; blur does not create; focus stays after creation.
- Do not show `+ Add`.

### J. Parent totals and pending review

- Board footer separated by a hairline with `10px` top padding and `6px` top margin.
- Total text `10.5px`, faint.
- Pending review summary `10.5px`, faint, with `Approve` cobalt and `Return` muted.
- No status card or badge.

### K. Undo and errors

- Remove black rounded `UndoToast` and crimson rounded error toast.
- Render a minimal fixed or contextual text line: `Assignment deleted · Undo`.
- `11–12px`; message muted, Undo ink or cobalt.
- Transparent background, no radius, no shadow.
- If fixed at bottom, allow a small white backing only when necessary for readability, with no visible card treatment.

## Screen 13 — Parent compact assignment editor

### Files

- `src/app/parent/AssignmentEditPanel.tsx`
- row integration in `ParentWeekBoard.tsx`

Click row metadata to expand beneath that row.

Panel:

- Transparent.
- Top border `1px solid #E1E3E6`.
- Margin top `6–8px`.
- Padding `8px 0 2px 9–10px`.
- Radius `0`; shadow `0`.
- Fields stack with `6px` gaps.
- Labels `10px`, uppercase, muted.
- Inputs `12px`, transparent, bottom hairline/dashed rule.
- No bordered field boxes.
- Everyday fields only: title, subject, minutes, notes, date, review.
- `More options →` as cobalt/plain text opens advanced editing.
- `Delete this assignment` as crimson `11px` text.
- Recurring scope appears inline only when a changed field requires it.
- No Save button unless a multi-field transaction truly requires it; prefer Enter/blur commits with visible quiet status.

Do not render the full recurrence/reminder form inside the narrow day column.

## Screen 14 — Parent week mobile

At mobile widths show one student and one day, not every student board stacked.

Order:

1. Parent header.
2. Plain student selector: `Miles · Violet`, `12px`; active student ink/600 or their accent, inactive muted.
3. Selected-day family agenda summary.
4. Day pager using active student's accent.
5. One student's one day board.
6. Permanent quick-entry line.

Rules:

- Keep selected day when changing student.
- Keep selected student when changing day.
- No drag.
- Use initials and explicit inline date/move actions as alternatives.
- Do not wrap the selected day in another card inside the already-present student board container.
- Rows remain square and hairline-separated.
- Calendar event radius stays at 3px.

## Screen 15 — Students `/parent/students`

### Files

- `src/app/parent/students/page.tsx`
- `src/app/parent/students/StudentsBoard.tsx`

Use Parent global header. Below it, use `24–28px` top spacing, not a dashboard hero.

Page title:

- `Students`, Inter 600, `20px` maximum.
- Optional one-line description `12px` muted; omit if not necessary.
- Content maximum width `640px`.

Each student row:

- Height determined by `12px` vertical padding.
- Bottom hairline.
- Transparent.
- No card/radius/shadow.
- Student name Syncopate 700, `14–15px`, accent, uppercase.
- Grade `12px` muted.
- `Change color` `11px` muted.
- Delete `11px` faint hover/focus action.
- Do not use a large colored circle. If a color preview is needed, use a 3px vertical tick; the colored Syncopate name already previews the color.

Editing:

- Replace text in place with bottom-rule input.
- No black Save button.
- Enter/blur saves; Escape cancels.
- Delete confirmation appears within the row: `Delete student? Delete · Cancel`, all text, no box.

Add row:

- Bottom dashed rule fields for Name and Grade.
- Plain `Add student` text action.
- No plus icon or filled CTA.

## Screen 16 — Subjects `/parent/subjects`

### Files

- `src/app/parent/subjects/page.tsx`
- `src/app/parent/subjects/SubjectsBoard.tsx`

Same page geometry as Students.

Each row:

- Bottom hairline; `12px` vertical padding.
- Subject name `13px` ink.
- Category and faith-integrated status `12px` muted.
- Transparent, square, no shadow.
- Edit values in place; native select/checkbox appear only during editing.
- Delete is faint text; inline confirmation.

New subject:

- One permanent bottom-rule input, width approximately `260–320px`.
- Placeholder `Name, press Enter`.
- No Add card or button.

The HST category explanation, if retained, is one compact `12px` muted paragraph—not a colored info panel.

## Screen 17 — Reports landing `/parent/reports`

### Files

- `src/app/parent/reports/page.tsx`
- `src/app/parent/reports/LPSelect.tsx`

Use Parent header. Keep content compact.

For each student:

- Student name Syncopate 700, `15–17px`, student accent.
- Learning-period selector appears as a bottom-rule native select, `12px`, not a rounded control.
- Subject-hour rows: flex space-between, `12px`, `3px 0`, bottom hairline.
- Subject ink; hours muted.
- Thin 3px progress track hairline with student-accent fill where useful.
- `Open HST meeting report →` plain cobalt or ink text, `11–12px`.

Do not create colorful analytics cards, large summary numbers, ring charts, legends, or subject-color bars.

If no data exists, use one muted sentence with a plain link to Calendar settings.

## Screen 18 — Print report `/parent/reports/[studentId]/[lpId]`

White screen and print surface.

Screen-only controls:

- `← Reports` and `Print / Save PDF` as plain text.
- No floating rounded toolbar.

Report header:

- Small wordmark, approximately `18px` high.
- Student name `20–22px` Inter 600 or restrained Syncopate only if the Canvas language remains balanced; do not create a large cover page.
- Learning period/date range `12px` muted.
- Hairline below header.

Content:

- Subject-hours rows `12px`, hairlines, 3px progress bars using student accent.
- Completed-work log grouped by subject.
- Subject headings `12px` 700.
- Items `11–12px` with dates muted.
- No colored subject palette.
- Prevent orphan headings in print CSS.
- No page background color or shadows in print.

## Screen 19 — Calendar settings `/parent/calendar`

### Files

- `src/app/parent/calendar/page.tsx`
- `FamilyCalendarCard.tsx`
- `LearningPeriodRow.tsx`

Canvas shows compact white 12px settings cards. Do not expand this into a large dashboard.

Use Parent header, then a compact content area.

Family Calendar card:

- Width approximately `320px` when space permits; may expand responsibly for real URL editing.
- White, 12px radius, `18px 22px` padding, approved subtle shadow.
- Title `15px` 700.
- Label `11px`, uppercase, muted.
- URL input transparent with bottom hairline, `12px`.
- Once connected, mask/truncate secret URL and show plain `Replace`.
- Hidden events are `12px` rows with bottom hairline and cobalt `Show again` at `11px`.
- Remove calendar uses crimson inline text with inline confirmation.

School-day range and learning-period cards use the same single card treatment, not nested cards.

Date/select fields:

- Transparent, bottom hairline.
- No rounded field boxes.
- Plain Apply/Add text actions.

Learning-period rows:

- Name/date range/meeting date as compact text.
- Bottom hairline.
- Inline edit and inline delete confirmation.

## Screen 20 — Parent Projects `/parent/projects`

### Files

- `src/app/parent/projects/page.tsx`
- `src/app/parent/projects/ParentProjectsBoard.tsx`

Use Parent header. This is an authoring surface, but it must still look like the student Projects band rather than a kanban/product-management app.

For each student:

- Student heading Syncopate 700, `17px`, student accent.
- Hairline under heading.
- Active projects in a wrapping horizontal row.
- Each project width approximately `240–280px`.
- Left hairline and `16px` left padding.
- No project card fill, radius, border box, or shadow.

Project:

- Title Syncopate 700, `14px`, uppercase, ink.
- Target date `11px` muted inline.
- Progress track/fill 3px square, student accent.
- Backlog step `12px`, `3–5px 0`, bottom hairline.
- `Plan it` is `11px` cobalt plain text.
- `Add a step` is a permanent dashed-bottom input.
- Editing expands inline beneath the same line with transparent fields.
- Delete/reorder controls reveal on hover/focus and remain plain glyph/text.
- No drag-handle pill or colored card state.

New project:

- Permanent line `Start a new project, press Enter`.
- Transparent, dashed bottom, no plus.

Someday ideas:

- Separate section label `Someday`, same 11px uppercase style.
- Plain rows with bottom hairline.
- `→ Start project` plain cobalt text.
- Permanent `Type an idea, press Enter` line.
- This section appears only in Parent Mode.

Finished projects collapse under `▸ Finished (N)` as faint text.

## Screen 21 — New/advanced assignment `/parent/assignments/new`

### Files

- `src/app/parent/assignments/new/page.tsx`
- `AssignmentForm.tsx`

Use Parent header. Content maximum width approximately `640px`; do not create a full-width admin form.

Page title `New assignment`, Inter 600, `20px`.

Essential fields visible:

1. Title.
2. Student selection.
3. Subject.
4. Due date.

Field construction:

- Label `10.5px`, uppercase, muted.
- Input/select `13px`, transparent, bottom hairline.
- Vertical field gap `18px`.
- No gray boxes, rounded field shells, or cards.

Student selection:

- Plain student names with small accent indication.
- Use text and `aria-pressed`; no large filled toggle cards or pills.

Advanced:

- Plain `More options →` disclosure.
- When open: details, minutes, scheduled time, reminder, recurrence/end, review requirement.
- Native checkbox/select/date/time fields remain visually bottom-rule based.
- No nested rounded panel behind advanced fields.

Submit:

- `Create assignment →`, `13px` 600 ink or cobalt plain text.
- No large black full-width button.
- Validation errors are crimson text immediately beneath relevant field.

## Screen 22 — Parent utility menu

- White.
- Hairline border.
- Zero radius and shadow.
- Items `13px` muted, `6px 12px`.
- Contains Projects, New assignment, Calendar/settings, and Lock/switch options as appropriate.
- No icons, section-card groups, or colored destructive block.

## Screen 23 — Inline confirmations

Use for student/subject/project/series/calendar/learning-period destructive actions.

Exact pattern inside the affected row:

```text
Delete project?  Delete · Cancel
```

- Prompt `11–12px` muted.
- Delete crimson/600.
- Cancel muted.
- Transparent background.
- No radius, border, shadow, dialog, or native `window.confirm`.

Single assignment occurrence/ordinary step deletion may happen immediately with plain Undo feedback.

---

# Part III — Route-specific implementation prompts

Do not ask Claude Code to do all screens at once. Give one prompt, review the rendered route, then proceed.

## Prompt 0 — install the authority rules

```text
Read HOMEROOM_SCREEN_BY_SCREEN_BUILD_SPEC.md completely. It is now the top visual authority. Canvas.dc.html is the literal rendered target; older migration documents and existing styles are not visual authorities. Do not edit yet. Report: (1) the source precedence, (2) the allowed radius map, (3) the task identity-tick algorithm, (4) the exact routes you will visually render, and (5) every invented color currently used in week-board tasks. Stop.
```

## Prompt 1 — neutralize global drift

```text
Implement only Part I of HOMEROOM_SCREEN_BY_SCREEN_BUILD_SPEC.md. Make the app surface white, remove invented subject colors from student and parent week-row identity, and enforce the radius/shadow defaults without changing screen layout yet. Do not globally remove the explicitly permitted 12px Parent containers or 3px calendar events. Run lint/tests/build. Render the student and parent week once to prove that no ordinary row is colored by subject and no ordinary row is rounded. Commit and stop.
```

## Prompt 2 — gate, picker, unlock

```text
Implement Screens 1–3 exactly. Do not touch week boards. Render /gate, /, and /parent/unlock at 390×844 and 1400×900. Compare against the specification and ensure they are quiet white screens, not card-based login pages. Run checks, commit, and stop with screenshots and remaining visual differences.
```

## Prompt 3 — student desktop

```text
Implement Screen 4 only, including Sections A–Q and its removal checklist. Seed or use representative data showing completed, ordinary, project, rolled, pending-review, live, soon, later, separator, empty day, and Projects states. Render at 1400×900 and 1100×800. Render Canvas.dc.html at the same reference scale. Compare side by side and with an opacity overlay. Iterate until page surface, header position, six-column geometry, row density, type sizes, hairlines, identity colors, callouts, and Projects silhouette match. Preserve functionality and student permissions. Run checks, commit, and stop with a state-by-state screenshot checklist.
```

## Prompt 4 — student mobile and secondary states

```text
Implement Screens 5–10 exactly. Render student mobile at 430×932 and 390×844, plus read-only details, utility menu, Coming Up, passcode popover, live state, and a reduced-motion state. No mobile row cards, no duplicate day header, no drag, no subject colors. Run checks, commit, and stop with screenshots.
```

## Prompt 5 — parent desktop

```text
Implement Screens 11–13 exactly. Use representative data with multiple calendar events, one event assigned to both students, completed/open/project/review tasks, day type, separator, quick entry, assigned event, compact editor, error, and Undo. Render /parent at 1400×900 and 1100×800 and compare it against the Parent Mode screen in Canvas.dc.html using overlay. Preserve only the permitted 12px outer containers and 3px calendar events. All ordinary rows must be transparent, square, black/gray, and hairline-separated. Run checks, commit, and stop with screenshots and any remaining pixel differences.
```

## Prompt 6 — parent mobile

```text
Implement Screen 14 exactly. At 430×932 and 390×844 show one student and one day, with the selected-day shared calendar context and permanent parent entry line. No drag, no stacked full student boards, no card conversion. Render and compare both students and at least two days. Run checks, commit, and stop.
```

## Prompt 7 — Students and Subjects

```text
Implement Screens 15–16 exactly. Render normal, edit, add, delete-confirmation, and error states at desktop and mobile. These are compact transparent hairline lists, not settings cards or admin forms. Run checks, commit, and stop with screenshots.
```

## Prompt 8 — Reports and print

```text
Implement Screens 17–18 exactly. Render reports landing with data and empty states, and render/print the detailed report. No subject palette or dashboard analytics cards. Verify print pagination. Run checks, commit, and stop with screenshots plus the generated print preview.
```

## Prompt 9 — Calendar settings

```text
Implement Screen 19 exactly. Render connected, disconnected, hidden-event, learning-period edit/add/delete-confirmation, and mobile states. Use the compact Canvas settings-card treatment only where specified; do not nest cards. Run checks, commit, and stop with screenshots.
```

## Prompt 10 — Projects

```text
Implement Screen 20 exactly. Render active, editing, planning, new-project, Someday, and finished states for both students. The page must look like an editable expansion of the Canvas Projects band, not a kanban board or collection of rounded project cards. Run checks, commit, and stop with screenshots.
```

## Prompt 11 — Advanced assignment and utilities

```text
Implement Screens 21–23 exactly. Render essential form, open More options, validation errors, utility menu, and each inline confirmation pattern. Remove all remaining native confirm dialogs and generic toast cards. Run checks, commit, and stop with screenshots.
```

## Prompt 12 — final visual diff

```text
Perform a visual-diff audit only. Do not add features. For every route and state listed in HOMEROOM_SCREEN_BY_SCREEN_BUILD_SPEC.md, render at the required desktop and mobile widths. Compare the core student and parent screens directly against Canvas.dc.html by overlay. Search the source for unauthorized rounded/shadow/color styling and inspect every result. Fix visible mismatches. Then run lint, tests, and production build. Report a route-by-route table with screenshot, tested states, viewport, and any visible difference that remains. Do not claim completion for a route without a render.
```

---

# Part IV — Mechanical audit commands Claude should run

These searches do not prove visual fidelity, but they catch common drift before screenshots:

```bash
rg -n "rounded|borderRadius|shadow|boxShadow" src/app src/components
rg -n "#5C7A6E|#B5734A|#8A4A4A|#6E7A4A|#A98A3E|#7A5C8A|#4A7A5C|#7A6A5C|#8A8272|#C97B4A" src
rg -n "getSubjectColor" src/app src/components
rg -n "COLORS.background|--hr-cream|#FAF7F2" src/app src/components src/lib
rg -n "window.confirm|confirm\(" src/app src/components
```

For every result, Claude must classify it as:

- explicitly authorized by this specification;
- animation-only;
- print-only;
- or visual drift to remove.

## Required screenshot matrix

| Route/state | Desktop | Mobile |
| --- | --- | --- |
| Gate | 1400×900 | 390×844 |
| Picker | 1400×900 | 390×844 |
| Parent unlock | 1400×900 | 390×844 |
| Student mixed week | 1400×900, 1100×800 | 430×932, 390×844 |
| Student details/menu/Coming Up/passcode | 1400×900 | 390×844 |
| Parent mixed week | 1400×900, 1100×800 | 430×932, 390×844 |
| Parent editor/Undo/error | 1400×900 | 390×844 |
| Students normal/edit/add/delete | 1400×900 | 390×844 |
| Subjects normal/edit/add/delete | 1400×900 | 390×844 |
| Reports data/empty | 1400×900 | 390×844 |
| Print report | print preview | n/a |
| Calendar settings states | 1400×900 | 390×844 |
| Projects states | 1400×900 | 390×844 |
| New assignment essential/advanced/error | 1400×900 | 390×844 |

# Definition of done

The work is complete only when:

- the app reads as white, black, and gray before it reads as colorful;
- ordinary tasks are black/gray lines, not colored mini cards;
- large Parent containers are the only 12px cards;
- calendar events are the only ordinary 3px filled blocks;
- all other organization comes from whitespace, type, and hairlines;
- student/project/status color appears only in the locations specified;
- the student and parent screen silhouettes align with Canvas under overlay;
- every route and state has an actual screenshot at its required viewport;
- all functional tests, lint, and production build still pass.
