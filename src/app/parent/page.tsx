import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDays, formatDayLabel, formatWeekLabel, mondayOf, parseISODate, toISODate } from "@/lib/dates";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const monday = week ? parseISODate(week) : mondayOf(new Date());
  const days = Array.from({ length: 5 }, (_, index) => addDays(monday, index));
  const weekEnd = addDays(monday, 5);

  const [students, instances] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.assignmentInstance.findMany({
      where: { dueDate: { gte: monday, lt: weekEnd } },
      include: { subject: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Parent Mode</h1>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/parent/students" className="text-[#6B6B6B] hover:underline">
            Students
          </Link>
          <Link href="/parent/subjects" className="text-[#6B6B6B] hover:underline">
            Subjects
          </Link>
          <Link
            href="/parent/assignments/new"
            className="rounded bg-[#1A1A1A] px-3 py-1.5 text-white hover:bg-[#333]"
          >
            + New assignment
          </Link>
        </nav>
      </div>

      <div className="mt-8 flex items-center gap-4 text-sm">
        <Link href={`/parent?week=${prevWeek}`} className="text-[#6B6B6B] hover:underline">
          ← Prev week
        </Link>
        <span className="font-medium">Week of {formatWeekLabel(days[0])}</span>
        <Link href={`/parent?week=${nextWeek}`} className="text-[#6B6B6B] hover:underline">
          Next week →
        </Link>
      </div>

      {students.length === 0 && (
        <p className="mt-10 text-sm text-[#6B6B6B]">
          Add a student to start planning.{" "}
          <Link href="/parent/students" className="underline">
            Add one now
          </Link>
          .
        </p>
      )}

      {students.map((student) => (
        <section key={student.id} className="mt-10">
          <h2
            className="text-sm font-medium uppercase tracking-wide"
            style={{ color: student.accentColor }}
          >
            {student.name}
          </h2>
          <div className="mt-3 grid grid-cols-5 gap-4">
            {days.map((day) => {
              const dateStr = toISODate(day);
              const dayInstances = instances.filter(
                (instance) =>
                  instance.studentId === student.id &&
                  instance.dueDate &&
                  toISODate(instance.dueDate) === dateStr
              );

              return (
                <div key={dateStr} className="rounded border border-[#DDD6CB] bg-white p-3">
                  <div className="text-xs font-medium text-[#6B6B6B]">{formatDayLabel(day)}</div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {dayInstances.map((instance) => (
                      <li key={instance.id}>
                        {instance.title}
                        <span className="text-[#6B6B6B]"> — {instance.subject?.name ?? "No subject"}</span>
                        {instance.requiresReview && (
                          <span className="ml-1 text-[#B5451B]">Show Mom</span>
                        )}
                      </li>
                    ))}
                    {dayInstances.length === 0 && <li className="text-[#B8AF9F]">Nothing due.</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
