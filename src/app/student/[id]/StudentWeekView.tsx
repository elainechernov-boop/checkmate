"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import type { AssignmentInstance, Student } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, formatWeekLabel, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { isSoundMuted, setSoundMuted } from "@/lib/completionSound";
import { toggleInstance } from "./actions";
import { DayColumn } from "./DayColumn";
import { ComingUpPanel } from "./ComingUpPanel";

type InstanceWithSubject = AssignmentInstance & { subject: { id: string; name: string } | null };

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
  instances: InstanceWithSubject[];
  comingUp: InstanceWithSubject[];
}) {
  const router = useRouter();
  const prefersReducedMotion = !!useReducedMotion();

  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [comingUpOpen, setComingUpOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [celebratedToday, setCelebratedToday] = useState(true); // avoid a flash before the effect below settles

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

  function handleCelebrate() {
    setCelebratedToday(true);
    window.localStorage.setItem(celebratedKey, "1");
  }

  async function handleToggle(instance: InstanceWithSubject) {
    const goingToOpen = instance.status !== InstanceStatus.open;
    const nextStatus = goingToOpen
      ? InstanceStatus.open
      : instance.requiresReview
        ? InstanceStatus.pendingReview
        : InstanceStatus.done;

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

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  }

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
                accentColor={student.accentColor}
                prefersReducedMotion={prefersReducedMotion}
                celebrated={celebratedToday}
                onCelebrate={handleCelebrate}
                onToggle={handleToggle}
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
    </main>
  );
}
