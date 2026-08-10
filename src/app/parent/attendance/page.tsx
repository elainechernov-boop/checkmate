import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { loadAttendanceRange, summarizeAttendance } from "@/lib/attendance";
import { formatDayLabel, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { toggleAttendanceDay, toggleLearningPeriodClaimed } from "./actions";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; lp?: string }>;
}) {
  const { studentId: studentIdParam, lp: lpIdParam } = await searchParams;
  const [students, learningPeriods] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  const student = students.find((s) => s.id === studentIdParam) ?? students[0] ?? null;
  const lp = learningPeriods.find((l) => l.id === lpIdParam) ?? learningPeriods[0] ?? null;

  const days = student && lp ? await loadAttendanceRange(prisma, student.id, lp.startDate, lp.endDate) : [];
  const summary = summarizeAttendance(days);

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-10 py-12 text-[#161616]">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Attendance</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Every school day with completed parent-assigned work is suggested present (§8) — click a day to confirm or
        correct it. The app is prep; official attendance is still claimed in Blue Ridge&rsquo;s Parent Portal.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-[#6B6B6B]">Student</label>
          <select name="studentId" defaultValue={student?.id} className="rounded border border-[#E1E3E6] px-2 py-1.5">
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#6B6B6B]">Learning period</label>
          <select name="lp" defaultValue={lp?.id} className="rounded border border-[#E1E3E6] px-2 py-1.5">
            {learningPeriods.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
          View
        </button>
      </form>

      {!student || !lp ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          Add a student and a{" "}
          <Link href="/parent/calendar" className="underline">
            learning period
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <p style={{ color: COLORS.text }}>
              {summary.presentCount}/{summary.schoolDayCount} school days present
            </p>
            <form action={toggleLearningPeriodClaimed}>
              <input type="hidden" name="learningPeriodId" value={lp.id} />
              <input type="hidden" name="claimed" value={String(summary.allClaimed)} />
              <button
                type="submit"
                className="rounded border px-3 py-1.5"
                style={{
                  borderColor: summary.allClaimed ? COLORS.text : COLORS.hairline,
                  background: summary.allClaimed ? COLORS.text : "white",
                  color: summary.allClaimed ? "white" : COLORS.muted,
                }}
              >
                {summary.allClaimed ? "✓ All days claimed" : "Claim all days in this LP"}
              </button>
            </form>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const dateISO = toISODate(day.date);
              const label = day.claimed ? "Present" : day.countable ? (day.autoSuggested ? "Suggested" : "—") : day.type;
              return (
                <form key={dateISO} action={toggleAttendanceDay}>
                  <input type="hidden" name="dateISO" value={dateISO} />
                  <input type="hidden" name="claimed" value={String(day.claimed)} />
                  <button
                    type="submit"
                    disabled={!day.countable}
                    className="w-full rounded border p-2 text-left text-xs transition-colors"
                    style={{
                      borderColor: day.claimed ? COLORS.text : day.autoSuggested ? COLORS.amber : COLORS.hairline,
                      background: day.claimed ? COLORS.text : "white",
                      color: day.claimed ? "white" : day.countable ? COLORS.text : COLORS.mutedFaint,
                      opacity: day.countable ? 1 : 0.55,
                      cursor: day.countable ? "pointer" : "default",
                    }}
                  >
                    <div className="font-medium">{formatDayLabel(day.date)}</div>
                    <div>{label}</div>
                  </button>
                </form>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
