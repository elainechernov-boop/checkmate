import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { addDays, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { applyDayTypeRange, createLearningPeriod, deleteLearningPeriod, updateLearningPeriod } from "./actions";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_OPTIONS: { value: SchoolDayType; label: string }[] = [
  { value: SchoolDayType.schoolDay, label: "School day" },
  { value: SchoolDayType.offDay, label: "Off day" },
  { value: SchoolDayType.fieldTrip, label: "Field trip" },
  { value: SchoolDayType.sick, label: "Sick day" },
  { value: SchoolDayType.holiday, label: "Holiday" },
];
const TYPE_LABEL: Record<SchoolDayType, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  SchoolDayType,
  string
>;
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthStartFromParam(monthParam: string | undefined, today: Date): Date {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
}

function shiftMonth(start: Date, delta: number): string {
  const shifted = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; studentId?: string }>;
}) {
  const { month, studentId: studentIdParam } = await searchParams;
  const start = monthStartFromParam(month, new Date());
  const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const gridStart = addDays(start, -start.getUTCDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getUTCDay());

  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });
  const student = students.find((s) => s.id === studentIdParam) ?? students[0] ?? null;

  // SchoolDay is per-student (§5) — the bulk tool below writes the same
  // date+type for every student at once, so any one student's calendar is
  // representative of the shared parts; this view picks one to display,
  // same pattern as the attendance page.
  const [schoolDays, learningPeriods] = await Promise.all([
    student
      ? prisma.schoolDay.findMany({ where: { studentId: student.id, date: { gte: gridStart, lte: gridEnd } } })
      : Promise.resolve([]),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
  ]);
  const typeByDate = new Map(schoolDays.map((d) => [toISODate(d.date), d.type]));
  const noteByDate = new Map(schoolDays.filter((d) => d.activityNote).map((d) => [toISODate(d.date), d.activityNote]));

  const weeks: Date[][] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-10 py-12 text-[#161616]">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">School calendar</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Enter Blue Ridge&rsquo;s academic calendar once (§8) — mark off days, field trips, sick days, and holidays below,
        and define learning periods for attendance and work-sample tracking. This sets every student&rsquo;s calendar
        at once; for a single kid&rsquo;s sick day or field trip, use the day header on their own week board instead.
      </p>

      <section className="mt-8 rounded border border-[#E1E3E6] bg-white p-4">
        <h2 className="text-sm font-medium">Mark a day or range for everyone</h2>
        <form action={applyDayTypeRange} className="mt-2 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs text-[#6B6B6B]">From</label>
            <input type="date" name="startDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">To</label>
            <input type="date" name="endDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">Type</label>
            <select name="type" defaultValue={SchoolDayType.offDay} className="rounded border border-[#E1E3E6] px-2 py-1.5">
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            Apply
          </button>
        </form>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <Link
            href={`/parent/calendar?month=${shiftMonth(start, -1)}${student ? `&studentId=${student.id}` : ""}`}
            className="text-sm text-[#6B6B6B] hover:underline"
          >
            ← Prev month
          </Link>
          <h2 className="text-lg font-medium">
            {MONTH_LONG[start.getUTCMonth()]} {start.getUTCFullYear()}
          </h2>
          <Link
            href={`/parent/calendar?month=${shiftMonth(start, 1)}${student ? `&studentId=${student.id}` : ""}`}
            className="text-sm text-[#6B6B6B] hover:underline"
          >
            Next month →
          </Link>
        </div>

        {/* SchoolDay rows are per-student now — the grid below shows one
            student's calendar at a time (they're identical unless someone's
            own week-board toggle gave them an individual override). */}
        {students.length > 1 && (
          <form method="get" className="mt-3 flex items-center gap-2 text-sm">
            <input type="hidden" name="month" value={`${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`} />
            <label className="text-xs" style={{ color: COLORS.muted }}>
              Viewing
            </label>
            <select name="studentId" defaultValue={student?.id} className="rounded border border-[#E1E3E6] px-2 py-1">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}&rsquo;s calendar
                </option>
              ))}
            </select>
            <button type="submit" className="rounded border border-[#E1E3E6] px-2 py-1 hover:border-[#A9ACB2]">
              View
            </button>
          </form>
        )}

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs" style={{ color: COLORS.muted }}>
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {weeks.flat().map((day) => {
            const dateISO = toISODate(day);
            const type = typeByDate.get(dateISO) ?? SchoolDayType.schoolDay;
            const inMonth = day.getUTCMonth() === start.getUTCMonth();
            const note = noteByDate.get(dateISO);
            return (
              <div
                key={dateISO}
                className="min-h-[64px] rounded border p-1.5 text-left text-xs"
                style={{ borderColor: COLORS.hairline, opacity: inMonth ? 1 : 0.35 }}
                title={note ?? undefined}
              >
                <div style={{ color: COLORS.muted }}>{day.getUTCDate()}</div>
                {type !== SchoolDayType.schoolDay && (
                  <div style={{ color: COLORS.amber }}>{TYPE_LABEL[type]}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
          Learning periods
        </h2>
        <div className="mt-3 space-y-3">
          {learningPeriods.map((lp) => (
            <form
              key={lp.id}
              action={updateLearningPeriod}
              className="flex flex-wrap items-end gap-3 rounded border border-[#E1E3E6] bg-white p-4 text-sm"
            >
              <input type="hidden" name="id" value={lp.id} />
              <div>
                <label className="block text-xs text-[#6B6B6B]">Name</label>
                <input type="text" name="name" defaultValue={lp.name} required className="w-28 rounded border border-[#E1E3E6] px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">Start</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={toISODate(lp.startDate)}
                  required
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">End</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={toISODate(lp.endDate)}
                  required
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">HST meeting (optional)</label>
                <input
                  type="date"
                  name="hstMeetingDate"
                  defaultValue={lp.hstMeetingDate ? toISODate(lp.hstMeetingDate) : ""}
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
                Save
              </button>
              <button
                type="submit"
                formAction={deleteLearningPeriod}
                className="rounded border border-[#E1E3E6] px-3 py-2 text-[#B5451B] hover:border-[#B5451B]"
              >
                Delete
              </button>
            </form>
          ))}
        </div>

        <form
          action={createLearningPeriod}
          className="mt-4 flex flex-wrap items-end gap-3 rounded border border-dashed border-[#E1E3E6] bg-white p-4 text-sm"
        >
          <div>
            <label className="block text-xs text-[#6B6B6B]">Name</label>
            <input type="text" name="name" placeholder="LP1" required className="w-28 rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">Start</label>
            <input type="date" name="startDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">End</label>
            <input type="date" name="endDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">HST meeting (optional)</label>
            <input type="date" name="hstMeetingDate" className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            + Add learning period
          </button>
        </form>
      </section>
    </main>
  );
}
