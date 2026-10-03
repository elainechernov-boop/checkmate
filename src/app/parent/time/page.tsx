import Link from "next/link";
import { redirect } from "next/navigation";
import { InstanceStatus } from "@/generated/prisma/enums";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { PageHeading, ParentNav } from "@/components/ParentNav";
import { formatClockTime, formatDurationMs, formatSignedDurationMs, wallClockInstant } from "@/lib/clockTime";
import { addDays, formatComingUpDate, getToday, parseISODate, toISODate } from "@/lib/dates";
import { getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { buildDashboard, type DashboardTask } from "@/lib/timeDashboard";
import { buildAnswerView, buildAxisView, buildDayViews } from "@/lib/timeDashboardView";
import { parseTimeRangeKey, resolveTimeRange, TIME_RANGES } from "@/lib/timeRange";
import { sweepLapsedRuns } from "@/lib/timeTracking";
import { AnswerBar, DayStrips } from "./TimeCharts";

const sectionLabel = {
  color: COLORS.muted,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
} as const;

/**
 * §15 — Parent Mode's Time dashboard. Answers one question: when a school day
 * drags on, is it the work, or the breaks between the work? Four sections,
 * hairlines and type only: the answer (one sentence and one stacked bar), the
 * day-by-day strips, a by-subject table with the biggest overruns, and the
 * longest gaps between tasks.
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const prisma = await getScopedPrisma();
  const family = await getCurrentFamily();
  if (!family.timeTrackingEnabled) redirect("/parent");

  const today = getToday();
  const now = new Date();
  const rangeKey = parseTimeRangeKey(params.range);
  const { from, to } = resolveTimeRange(rangeKey, today);

  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });
  const student = students.find((candidate) => candidate.id === params.student) ?? students[0];

  const heading = (
    <PageHeading
      title="Time"
      description="Where each school day went: time spent working, time paused mid-task, and the gaps between tasks."
    />
  );

  if (!student) {
    return (
      <AppShell>
        <BrandHeader>
          <ParentNav current="time" showComplianceLinks={family.complianceModuleEnabled} />
        </BrandHeader>
        {heading}
        <p style={{ color: COLORS.muted, fontSize: 13 }}>
          Add a{" "}
          <Link href="/parent/students" className="underline">
            student
          </Link>{" "}
          first.
        </p>
      </AppShell>
    );
  }

  // ---- load: runs, the tasks they belong to, and what finished in range ----
  // Lapsed runs are swept first, so nothing quiet is counted up to "now."
  await sweepLapsedRuns(prisma, student.id, now);

  const rangeStart = wallClockInstant(toISODate(from), "00:00");
  const rangeEnd = wallClockInstant(toISODate(addDays(to, 1)), "00:00");

  const [runs, completed, subjects] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { studentId: student.id, date: { gte: from, lte: to } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.assignmentInstance.findMany({
      where: {
        studentId: student.id,
        status: { in: [InstanceStatus.done, InstanceStatus.pendingReview] },
        completedAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        id: true,
        title: true,
        status: true,
        subjectId: true,
        estimatedMinutes: true,
        completedAt: true,
        series: { select: { estimatedMinutes: true } },
      },
    }),
    prisma.subject.findMany({ select: { id: true, name: true } }),
  ]);

  const loadedIds = new Set(completed.map((instance) => instance.id));
  const otherIds = [...new Set(runs.map((run) => run.instanceId).filter((id): id is string => !!id && !loadedIds.has(id)))];
  const others =
    otherIds.length > 0
      ? await prisma.assignmentInstance.findMany({
          where: { id: { in: otherIds } },
          select: {
            id: true,
            title: true,
            status: true,
            subjectId: true,
            estimatedMinutes: true,
            completedAt: true,
            series: { select: { estimatedMinutes: true } },
          },
        })
      : [];

  const tasks: DashboardTask[] = [...completed, ...others].map((instance) => ({
    id: instance.id,
    title: instance.title,
    status: instance.status,
    subjectId: instance.subjectId,
    estimatedMinutes: instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null,
    completedAt: instance.completedAt,
  }));

  // "Untimed" means never timed at all — a task worked yesterday and finished
  // today is timed — so ask about every date, not just this range.
  const timedRows = loadedIds.size
    ? await prisma.timeEntry.findMany({
        where: { instanceId: { in: [...loadedIds] } },
        select: { instanceId: true },
        distinct: ["instanceId"],
      })
    : [];
  const timedTaskIds = new Set(timedRows.map((row) => row.instanceId).filter((id): id is string => !!id));

  const dashboard = buildDashboard({
    runs,
    tasks,
    timedTaskIds,
    subjectNames: new Map(subjects.map((subject) => [subject.id, subject.name])),
    schoolDayStartTime: family.schoolDayStartTime,
    from,
    to,
    now,
  });

  const answer = buildAnswerView(dashboard);
  const axis = buildAxisView(dashboard);
  const dayViews = buildDayViews(dashboard, tasks, now);
  const maxSubjectMs = Math.max(0, ...dashboard.subjects.map((row) => row.totalMs));

  const linkTo = (next: { student?: string; range?: string }) =>
    `/parent/time?student=${next.student ?? student.id}&range=${next.range ?? rangeKey}`;

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="time" showComplianceLinks={family.complianceModuleEnabled} />
      </BrandHeader>

      <div style={{ maxWidth: 980 }}>
        {heading}

        {/* One filter row above everything it scopes. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <div className="flex gap-4" style={{ fontSize: 13 }}>
            {students.map((candidate) =>
              candidate.id === student.id ? (
                <span key={candidate.id} style={{ fontWeight: 600 }}>
                  {candidate.name}
                </span>
              ) : (
                <Link key={candidate.id} href={linkTo({ student: candidate.id })} className="hover:underline" style={{ color: COLORS.muted }}>
                  {candidate.name}
                </Link>
              )
            )}
          </div>
          <div className="flex gap-4" style={{ fontSize: 12 }}>
            {TIME_RANGES.map((option) =>
              option.key === rangeKey ? (
                <span key={option.key} style={{ fontWeight: 600 }}>
                  {option.label}
                </span>
              ) : (
                <Link key={option.key} href={linkTo({ range: option.key })} className="hover:underline" style={{ color: COLORS.muted }}>
                  {option.label}
                </Link>
              )
            )}
          </div>
        </div>

        {!answer || !axis ? (
          <p className="mt-10" style={{ color: COLORS.muted, fontSize: 13 }}>
            No time tracked yet. When {student.name} taps ▶ on a task, it shows up here.
          </p>
        ) : (
          <>
            {/* 1 — the answer */}
            <p className="mt-6" style={{ fontSize: 21, fontWeight: 500, lineHeight: 1.3, maxWidth: 600, letterSpacing: "-0.01em" }}>
              {answer.sentence}
            </p>
            <div className="mt-4">
              <AnswerBar answer={answer} />
            </div>
            {answer.untimedLabel && (
              <p className="mt-2.5" style={{ color: COLORS.muted, fontSize: 11.5 }}>
                {answer.untimedLabel}
              </p>
            )}

            {/* 2 — day by day */}
            <h2 className="mt-8" style={sectionLabel}>
              Day by day
            </h2>
            <div className="mt-2.5">
              <DayStrips days={dayViews} axis={axis} />
            </div>

            {/* 3 — by subject, then the biggest overruns */}
            <h2 className="mt-9" style={sectionLabel}>
              By subject
            </h2>
            <div className="mt-2" style={{ fontSize: 12 }}>
              <div className="grid items-end" style={{ gridTemplateColumns: SUBJECT_COLUMNS, color: COLORS.muted, fontSize: 11, paddingBottom: 4 }}>
                <span>Subject</span>
                <span className="text-right">Tasks</span>
                <span className="text-right">Total</span>
                <span className="text-right">Avg per task</span>
                <span className="text-right">Avg estimate</span>
                <span className="text-right">Over / under</span>
              </div>
              {dashboard.subjects.map((row) => (
                <div key={row.subjectId ?? "none"} style={{ padding: "5px 0", borderTop: `1px solid ${COLORS.hairline}` }}>
                  <div className="grid" style={{ gridTemplateColumns: SUBJECT_COLUMNS, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: COLORS.text }}>{row.name}</span>
                    <span className="text-right">{row.tasks}</span>
                    <span className="text-right">{formatDurationMs(row.totalMs)}</span>
                    <span className="text-right">{formatDurationMs(row.avgPerTaskMs)}</span>
                    <span className="text-right" style={{ color: row.avgEstimateMinutes === null ? COLORS.mutedFaint : undefined }}>
                      {row.avgEstimateMinutes === null ? "—" : `${Math.round(row.avgEstimateMinutes)} min`}
                    </span>
                    <span className="text-right" style={{ color: row.overUnderMs === null ? COLORS.mutedFaint : undefined }}>
                      {row.overUnderMs === null ? "—" : formatSignedDurationMs(row.overUnderMs)}
                    </span>
                  </div>
                  <span aria-hidden className="mt-1 block h-[3px]" style={{ background: COLORS.hairline }}>
                    <span
                      className="block h-full"
                      style={{ width: `${maxSubjectMs > 0 ? Math.round((row.totalMs / maxSubjectMs) * 100) : 0}%`, background: student.accentColor }}
                    />
                  </span>
                </div>
              ))}
            </div>

            {dashboard.overruns.length > 0 && (
              <>
                <h3 className="mt-6" style={{ ...sectionLabel, fontWeight: 500 }}>
                  Most over their estimate
                </h3>
                <div className="mt-1.5" style={{ fontSize: 12 }}>
                  {dashboard.overruns.map((row) => (
                    <div
                      key={`${row.taskId ?? row.title}`}
                      className="grid"
                      style={{ gridTemplateColumns: OVERRUN_COLUMNS, padding: "4px 0", borderTop: `1px solid ${COLORS.hairline}`, fontVariantNumeric: "tabular-nums" }}
                    >
                      <span className="min-w-0 truncate" style={{ color: COLORS.text }}>
                        {row.title} <span style={{ color: COLORS.muted }}>· {row.subjectName}</span>
                      </span>
                      <span className="text-right" style={{ color: COLORS.muted }}>
                        est {formatDurationMs(row.estimateMinutes * 60_000)}
                      </span>
                      <span className="text-right">took {formatDurationMs(row.actualMs)}</span>
                      <span className="text-right" style={{ fontWeight: 500 }}>
                        {formatSignedDurationMs(row.overageMs)}
                      </span>
                      <span className="text-right" style={{ color: COLORS.muted }}>
                        {row.days > 1 ? `${row.days} days` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 4 — longest gaps */}
            {dashboard.longestGaps.length > 0 && (
              <>
                <h2 className="mt-9" style={sectionLabel}>
                  Longest gaps between tasks
                </h2>
                <div className="mt-2" style={{ fontSize: 12 }}>
                  {dashboard.longestGaps.map((gap, index) => (
                    <div
                      key={`${gap.dateISO}:${index}`}
                      className="grid"
                      style={{ gridTemplateColumns: GAP_COLUMNS, padding: "4px 0", borderTop: `1px solid ${COLORS.hairline}`, fontVariantNumeric: "tabular-nums" }}
                    >
                      <span style={{ fontWeight: 500 }}>{formatDurationMs(gap.ms)}</span>
                      <span style={{ color: COLORS.muted }}>
                        {formatComingUpDate(parseISODate(gap.dateISO))} · {formatClockTime(gap.at)}
                      </span>
                      <span style={{ color: COLORS.text }}>
                        {gap.fromLabel} → {gap.toLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

const SUBJECT_COLUMNS = "minmax(0, 2fr) repeat(5, minmax(0, 1fr))";
const OVERRUN_COLUMNS = "minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)";
const GAP_COLUMNS = "6rem 11rem minmax(0, 1fr)";
