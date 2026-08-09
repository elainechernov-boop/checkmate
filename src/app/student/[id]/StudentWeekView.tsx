"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import type { Student } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, formatWeekLabel, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { isSoundMuted, setSoundMuted } from "@/lib/completionSound";
import { reorderOpenItems, toggleInstance } from "./actions";
import { DayColumn } from "./DayColumn";
import { ComingUpPanel } from "./ComingUpPanel";
import { AssignmentDetailsModal } from "./AssignmentDetailsModal";
import { ItemCelebration } from "./ItemCelebration";
import type { StudentInstance } from "./types";

const REFRESH_INTERVAL_MS = 60_000;

export function StudentWeekView({
  student,
  monday,
  today,
  instances,
  comingUp,
}: {
  student: Student;
  monday: Date;
  today: Date;
  instances: StudentInstance[];
  comingUp: StudentInstance[];
}) {
  const router = useRouter();
  const prefersReducedMotion = !!useReducedMotion();

  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [comingUpOpen, setComingUpOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [celebratedToday, setCelebratedToday] = useState(true); // avoid a flash before the effect below settles
  const [itemCelebration, setItemCelebration] = useState<{ key: number; origin: { x: number; y: number } } | null>(
    null
  );

  const todayISO = toISODate(today);
  const celebratedKey = `checkmate:celebrated:${student.id}:${todayISO}`;

  // Reset local (optimistic) state when the server hands us a fresh
  // `instances` prop (a week change or the 60s refresh) — done during
  // render, per React's guidance, rather than in an effect.
  if (instances !== syncedInstances) {
    setSyncedInstances(instances);
    setLocalInstances(instances);
  }

  useEffect(() => {
    // Browser-only reads (localStorage), deferred past hydration so the
    // server-rendered markup and the first client render still match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isSoundMuted());
    setCelebratedToday(window.localStorage.getItem(celebratedKey) === "1");
  }, [celebratedKey]);

  // §1: a light 60-second background refresh, so a morning edit appears
  // without the student touching anything.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(monday, i)), [monday]);
  const weekHasAnyItems = localInstances.length > 0;
  // The week view is Mon-Sat (§6) — on a Sunday there's no column that
  // equals "today" at all, so nothing is interactive. Say so plainly
  // (this is a fact about the real today, not about whichever week is
  // currently being browsed) instead of leaving a silent grid that reads
  // as broken.
  const todayIsSunday = today.getUTCDay() === 0;

  function handleCelebrate() {
    setCelebratedToday(true);
    window.localStorage.setItem(celebratedKey, "1");
  }

  async function handleToggle(instance: StudentInstance, origin: { x: number; y: number }) {
    const goingToOpen = instance.status !== InstanceStatus.open;
    const nextStatus = goingToOpen
      ? InstanceStatus.open
      : instance.requiresReview
        ? InstanceStatus.pendingReview
        : InstanceStatus.done;

    // The per-item "something REALLY fun" moment (§6) — a genuine, no-review
    // completion only. Entering pendingReview or undoing stays quiet: §5's
    // "the reward lands only when the work has been shown" still holds.
    if (!goingToOpen && nextStatus === InstanceStatus.done && !prefersReducedMotion) {
      setItemCelebration({ key: Date.now(), origin });
    }

    setLocalInstances((current) =>
      current.map((i) => (i.id === instance.id ? { ...i, status: nextStatus } : i))
    );

    try {
      await toggleInstance(instance.id);
    } catch {
      // Server rejected it (e.g. no longer "today") — revert.
      setLocalInstances((current) =>
        current.map((i) => (i.id === instance.id ? { ...i, status: instance.status } : i))
      );
    }
  }

  async function handleReorderOpen(orderedIds: string[]) {
    const previous = localInstances;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    setLocalInstances((current) =>
      current.map((i) => (order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i))
    );
    try {
      await reorderOpenItems(student.id, orderedIds);
    } catch {
      setLocalInstances(previous);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  }

  const selectedInstance = localInstances.find((i) => i.id === selectedInstanceId) ?? null;

  return (
    <main style={{ background: COLORS.background, color: COLORS.text }} className="min-h-screen px-10 py-10">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-sm hover:underline" style={{ color: COLORS.muted }}>
            ← Switch student
          </Link>
          <h1 className="mt-1 text-2xl font-medium" style={{ color: student.accentColor }}>
            {student.name}&rsquo;s week
          </h1>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <button onClick={() => setComingUpOpen(true)} className="hover:underline" style={{ color: COLORS.muted }}>
            Coming Up
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? "Turn completion sound on" : "Turn completion sound off"}
            className="text-base"
            style={{ color: COLORS.muted }}
          >
            {muted ? "🔈" : "🔊"}
          </button>
        </div>
      </header>

      <div className="mt-8 flex items-center gap-6 text-sm">
        <Link
          href={`/student/${student.id}?week=${toISODate(addDays(monday, -7))}`}
          className="px-1 hover:underline"
          style={{ color: COLORS.muted }}
        >
          ← Prev week
        </Link>
        <span className="font-medium">Week of {formatWeekLabel(days[0])}</span>
        <Link
          href={`/student/${student.id}?week=${toISODate(addDays(monday, 7))}`}
          className="px-1 hover:underline"
          style={{ color: COLORS.muted }}
        >
          Next week →
        </Link>
      </div>

      {todayIsSunday && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No school today — nothing here is checkable until Monday.
        </p>
      )}

      {weekHasAnyItems && (
        <div className="mt-8 grid grid-cols-6 gap-6">
          {days.map((day) => {
            const dayISO = toISODate(day);
            const dayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === dayISO);
            const isToday = dayISO === todayISO;
            return (
              <DayColumn
                key={dayISO}
                day={day}
                isToday={isToday}
                interactive={isToday}
                instances={dayInstances}
                studentName={student.name}
                prefersReducedMotion={prefersReducedMotion}
                celebrated={celebratedToday}
                onCelebrate={handleCelebrate}
                onToggle={handleToggle}
                onOpenDetails={(instance) => setSelectedInstanceId(instance.id)}
                onReorderOpen={handleReorderOpen}
              />
            );
          })}
        </div>
      )}

      <ComingUpPanel
        open={comingUpOpen}
        onClose={() => setComingUpOpen(false)}
        items={comingUp}
        prefersReducedMotion={prefersReducedMotion}
      />

      <AssignmentDetailsModal
        instance={selectedInstance}
        onClose={() => setSelectedInstanceId(null)}
        prefersReducedMotion={prefersReducedMotion}
      />

      {itemCelebration && (
        <ItemCelebration
          key={itemCelebration.key}
          origin={itemCelebration.origin}
          onDone={() => setItemCelebration(null)}
        />
      )}
    </main>
  );
}
