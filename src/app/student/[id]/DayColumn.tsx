"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatDayDateLine, formatDayWeekdayName, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { bucketDayInstances } from "@/lib/instanceGrouping";
import { AssignmentRow } from "./AssignmentRow";
import { DayCompleteTakeover } from "./DayCompleteTakeover";
import type { StudentInstance } from "./types";

function SortableRow({
  instance,
  prefersReducedMotion,
  isLast,
  accentColor,
  onToggle,
  onOpenDetails,
}: {
  instance: StudentInstance;
  prefersReducedMotion: boolean;
  isLast: boolean;
  accentColor: string;
  onToggle: (origin: { x: number; y: number }) => void;
  onOpenDetails: () => void;
  // Open-bucket rows are never pendingReview (§6's ordering), so this
  // variant has no need for the approve-via-passcode prop at all.
}) {
  // dnd-kit owns this wrapper's transform (drag position + reorder FLIP);
  // Framer Motion's animations inside AssignmentRow stay on a separate node
  // so the two never fight over the same element's transform. The whole row
  // is the drag target now (no separate handle glyph) — a small activation
  // distance (set on the DndContext's sensor below) lets a plain click still
  // reach the title/arrow buttons; only a real drag past that threshold
  // starts a reorder, same trick ParentWeekBoard's rows use.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <AssignmentRow
        instance={instance}
        interactive
        prefersReducedMotion={prefersReducedMotion}
        isLast={isLast}
        accentColor={accentColor}
        onToggle={onToggle}
        onOpenDetails={onOpenDetails}
      />
    </div>
  );
}

function DraggableProjectRow({
  instance,
  interactive,
  prefersReducedMotion,
  isLast,
  accentColor,
  onToggle,
  onOpenDetails,
  onApproveViaPasscode,
}: {
  instance: StudentInstance;
  interactive: boolean;
  prefersReducedMotion: boolean;
  isLast: boolean;
  accentColor: string;
  onToggle: (origin: { x: number; y: number }) => void;
  onOpenDetails: () => void;
  onApproveViaPasscode: (passcode: string, origin: { x: number; y: number }) => Promise<void>;
}) {
  // §7: "move between days" is the student's own project task's right on
  // any day, not just today's own reorder (SortableRow above, which only
  // ever governs today's cell). This is a plain cross-day draggable in the
  // outer, band-level DndContext StudentWeekView owns — the same mechanism
  // a Projects-band backlog task already uses to land on a day in the
  // first place (see BacklogTaskRow in ProjectsBand.tsx).
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <AssignmentRow
        instance={instance}
        interactive={interactive}
        prefersReducedMotion={prefersReducedMotion}
        isLast={isLast}
        accentColor={accentColor}
        onToggle={onToggle}
        onOpenDetails={onOpenDetails}
        onApproveViaPasscode={onApproveViaPasscode}
      />
    </div>
  );
}

export function DayColumn({
  day,
  isToday,
  interactive,
  instances,
  studentName,
  accentColor,
  prefersReducedMotion,
  celebrated,
  onCelebrate,
  onToggle,
  onOpenDetails,
  onReorderOpen,
  onApproveViaPasscode,
  enableDrag = true,
}: {
  day: Date;
  isToday: boolean;
  interactive: boolean;
  instances: StudentInstance[];
  studentName: string;
  accentColor: string;
  prefersReducedMotion: boolean;
  celebrated: boolean;
  onCelebrate: () => void;
  onToggle: (instance: StudentInstance, origin: { x: number; y: number }) => void;
  onOpenDetails: (instance: StudentInstance) => void;
  onReorderOpen: (orderedIds: string[]) => void;
  onApproveViaPasscode: (instance: StudentInstance, passcode: string, origin: { x: number; y: number }) => Promise<void>;
  // The mobile single-day pager owns this touch surface for horizontal
  // paging (SwipeDayPager) — a row-level touch-drag listener underneath it
  // would fight the page-swipe gesture for the same pointer, so the pager
  // passes false here and every row renders plain (tap-only) instead.
  enableDrag?: boolean;
}) {
  const [showTakeover, setShowTakeover] = useState(false);
  const wasAllDone = useRef<boolean | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // §7 drag-to-day: this whole column is one drop target in the outer,
  // band-level DndContext (StudentWeekView) that a Projects-band backlog
  // task can land on — entirely separate from the DndContext below, which
  // only ever governs today's own open-item reorder.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: toISODate(day) });

  const { rolled, timeSensitive, open, pendingReview, completed } = bucketDayInstances(instances);
  const allDone =
    instances.length > 0 &&
    open.length === 0 &&
    timeSensitive.length === 0 &&
    pendingReview.length === 0 &&
    rolled.length === 0;
  const totalRows = rolled.length + timeSensitive.length + open.length + pendingReview.length + completed.length;
  // The column's true bottom-to-top order (rolled -> time-sensitive -> open
  // -> pendingReview -> completed, §6/§12) regardless of which bucket a row
  // is rendered from — only this one row skips its trailing divider.
  const orderedRows = [...rolled, ...timeSensitive, ...open, ...pendingReview, ...completed];
  const lastRowId = orderedRows.length > 0 ? orderedRows[orderedRows.length - 1].id : null;

  useEffect(() => {
    if (!isToday) return;
    // Fire the day-complete moment exactly on the transition into "all done",
    // not on every render where it's already true (§6 step 5).
    if (allDone && wasAllDone.current === false && !celebrated) {
      setShowTakeover(true);
      onCelebrate();
    }
    wasAllDone.current = allDone;
  }, [allDone, isToday, celebrated, onCelebrate]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = open.findIndex((i) => i.id === active.id);
    const newIndex = open.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderOpen(arrayMove(open, oldIndex, newIndex).map((i) => i.id));
  }

  function plainRow(instance: StudentInstance) {
    const rowInteractive = interactive && instance.status !== InstanceStatus.excused;
    const rowProps = {
      instance,
      interactive: rowInteractive,
      prefersReducedMotion,
      isLast: instance.id === lastRowId,
      accentColor,
      onToggle: (origin: { x: number; y: number }) => onToggle(instance, origin),
      onOpenDetails: () => onOpenDetails(instance),
      // Available even on a non-today column — a pendingReview item holds
      // its original day rather than rolling (§5), but parent approval
      // isn't gated by the student-only "today only" interactivity rule.
      onApproveViaPasscode: (passcode: string, origin: { x: number; y: number }) =>
        onApproveViaPasscode(instance, passcode, origin),
    };

    // Own project task, still open (or rolled, which is still status
    // "open") — draggable to another day regardless of which day this is,
    // the bug this fixes (§7's "move between days" wasn't reachable once a
    // task left the backlog for anywhere but today). Today's own open
    // items already get this via SortableRow instead, so this only ever
    // fires for a non-today cell.
    if (enableDrag && !interactive && instance.project && instance.status === InstanceStatus.open) {
      return <DraggableProjectRow key={instance.id} {...rowProps} />;
    }

    return <AssignmentRow key={instance.id} {...rowProps} />;
  }

  return (
    <div
      ref={setDroppableRef}
      className="rounded border p-3 transition-colors"
      style={{
        borderColor: isOver ? accentColor : isToday ? COLORS.text : COLORS.hairline,
        borderWidth: isToday ? 1.5 : 1,
        background: isOver ? "#F1F2F4" : "rgba(255,255,255,0.6)",
      }}
    >
      <div className="relative flex items-start justify-between">
        {/* TeuxDeux's two-line day header (§9): a tiny uppercase date line,
            the weekday name large and bold directly beneath it — the two
            sit close together, with almost all the visual weight on the
            weekday name. Today's name picks up the student's own accent
            color instead of the near-black default. */}
        <div className="flex flex-col leading-tight">
          <span
            className="font-medium uppercase"
            style={{ color: COLORS.muted, fontSize: "0.6rem", letterSpacing: "0.06em" }}
          >
            {formatDayDateLine(day)}
          </span>
          <span
            className="font-bold uppercase"
            style={{
              color: isToday ? accentColor : COLORS.text,
              fontSize: isToday ? "1.5rem" : "1.15rem",
              fontStretch: "condensed",
            }}
          >
            {formatDayWeekdayName(day)}
          </span>
        </div>
        {showTakeover && (
          <DayCompleteTakeover
            studentName={studentName}
            reducedMotion={prefersReducedMotion}
            onDone={() => setShowTakeover(false)}
          />
        )}
      </div>

      <div className="mt-2 flex flex-col">
        {totalRows === 0 && (
          <p className="py-1 text-center text-sm" style={{ color: COLORS.mutedFaint }}>
            Nothing due.
          </p>
        )}

        {rolled.map(plainRow)}
        {/* §12: pinned above the student's own drag-order, and — like
            rolled — rendered as plain (non-sortable) rows so it can't be
            dragged out of place. */}
        {timeSensitive.map(plainRow)}

        {enableDrag && interactive && open.length > 0 ? (
          // Explicit `id` makes dnd-kit's internal aria-describedby id
          // deterministic — without it, dnd-kit derives it from a
          // module-level counter that isn't SSR-safe, causing a harmless
          // but real hydration-attribute mismatch (same fix already used
          // in ParentWeekBoard.tsx).
          <DndContext
            id={`day-${toISODate(day)}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={open.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {open.map((instance) => (
                <SortableRow
                  key={instance.id}
                  instance={instance}
                  prefersReducedMotion={prefersReducedMotion}
                  isLast={instance.id === lastRowId}
                  accentColor={accentColor}
                  onToggle={(origin) => onToggle(instance, origin)}
                  onOpenDetails={() => onOpenDetails(instance)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          open.map(plainRow)
        )}

        {pendingReview.map(plainRow)}
        {completed.map(plainRow)}
      </div>
    </div>
  );
}
