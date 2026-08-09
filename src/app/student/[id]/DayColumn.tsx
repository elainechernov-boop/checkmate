"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatDayLabel, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { bucketDayInstances } from "@/lib/instanceGrouping";
import { AssignmentRow } from "./AssignmentRow";
import { DayCompleteTakeover } from "./DayCompleteTakeover";
import type { StudentInstance } from "./types";

function SortableRow({
  instance,
  prefersReducedMotion,
  onToggle,
  onOpenDetails,
}: {
  instance: StudentInstance;
  prefersReducedMotion: boolean;
  onToggle: (origin: { x: number; y: number }) => void;
  onOpenDetails: () => void;
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
        onToggle={onToggle}
        onOpenDetails={onOpenDetails}
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
  prefersReducedMotion,
  celebrated,
  onCelebrate,
  onToggle,
  onOpenDetails,
  onReorderOpen,
}: {
  day: Date;
  isToday: boolean;
  interactive: boolean;
  instances: StudentInstance[];
  studentName: string;
  prefersReducedMotion: boolean;
  celebrated: boolean;
  onCelebrate: () => void;
  onToggle: (instance: StudentInstance, origin: { x: number; y: number }) => void;
  onOpenDetails: (instance: StudentInstance) => void;
  onReorderOpen: (orderedIds: string[]) => void;
}) {
  const [showTakeover, setShowTakeover] = useState(false);
  const wasAllDone = useRef<boolean | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { rolled, open, pendingReview, completed } = bucketDayInstances(instances);
  const allDone = instances.length > 0 && open.length === 0 && pendingReview.length === 0 && rolled.length === 0;
  const totalRows = rolled.length + open.length + pendingReview.length + completed.length;

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
    return (
      <AssignmentRow
        key={instance.id}
        instance={instance}
        interactive={interactive && instance.status !== InstanceStatus.excused}
        prefersReducedMotion={prefersReducedMotion}
        onToggle={(origin) => onToggle(instance, origin)}
        onOpenDetails={() => onOpenDetails(instance)}
      />
    );
  }

  return (
    <div
      className="rounded border bg-white/60 p-3"
      style={{
        borderColor: isToday ? COLORS.text : COLORS.hairline,
        borderWidth: isToday ? 1.5 : 1,
      }}
    >
      <div className="relative flex items-center justify-between">
        <span
          className="font-medium"
          style={{ color: isToday ? COLORS.text : COLORS.muted, fontSize: isToday ? "0.95rem" : "0.8rem" }}
        >
          {formatDayLabel(day)}
        </span>
        {showTakeover && (
          <DayCompleteTakeover
            studentName={studentName}
            reducedMotion={prefersReducedMotion}
            onDone={() => setShowTakeover(false)}
          />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {totalRows === 0 && (
          <p className="py-1 text-center text-sm" style={{ color: COLORS.mutedFaint }}>
            Nothing due.
          </p>
        )}

        {rolled.map(plainRow)}

        {interactive && open.length > 0 ? (
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
