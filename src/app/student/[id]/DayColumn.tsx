"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentInstance } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatDayLabel } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { bucketDayInstances } from "@/lib/instanceGrouping";
import { AssignmentRow } from "./AssignmentRow";
import { ConfettiBurst } from "./ConfettiBurst";

type InstanceWithSubject = AssignmentInstance & { subject: { id: string; name: string } | null };

export function DayColumn({
  day,
  isToday,
  interactive,
  instances,
  accentColor,
  prefersReducedMotion,
  celebrated,
  onCelebrate,
  onToggle,
}: {
  day: Date;
  isToday: boolean;
  interactive: boolean;
  instances: InstanceWithSubject[];
  accentColor: string;
  prefersReducedMotion: boolean;
  celebrated: boolean;
  onCelebrate: () => void;
  onToggle: (instance: InstanceWithSubject) => void;
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const wasAllDone = useRef<boolean | null>(null);

  const { rolled, open, pendingReview, completed } = bucketDayInstances(instances);
  const orderedRows = [...rolled, ...open, ...pendingReview, ...completed];
  const allDone = instances.length > 0 && open.length === 0 && pendingReview.length === 0 && rolled.length === 0;

  useEffect(() => {
    if (!isToday) return;
    // Fire the day-complete moment exactly on the transition into "all done",
    // not on every render where it's already true (§6 step 5).
    if (allDone && wasAllDone.current === false && !celebrated) {
      setShowConfetti(true);
      onCelebrate();
    }
    wasAllDone.current = allDone;
  }, [allDone, isToday, celebrated, onCelebrate]);

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
        {showConfetti && (
          <ConfettiBurst
            color={accentColor}
            reducedMotion={prefersReducedMotion}
            onDone={() => setShowConfetti(false)}
          />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {orderedRows.length === 0 && (
          <p className="py-1 text-center text-sm" style={{ color: COLORS.mutedFaint }}>
            Nothing due.
          </p>
        )}
        {orderedRows.map((instance) => (
          <AssignmentRow
            key={instance.id}
            instance={instance}
            interactive={interactive && instance.status !== InstanceStatus.excused}
            prefersReducedMotion={prefersReducedMotion}
            onToggle={() => onToggle(instance)}
          />
        ))}
      </div>
    </div>
  );
}
