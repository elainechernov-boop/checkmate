import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDays, defaultWeekStart, parseISODate } from "@/lib/dates";
import { ParentWeekBoard } from "./ParentWeekBoard";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const monday = week ? parseISODate(week) : defaultWeekStart(new Date());
  const weekEnd = addDays(monday, 6);

  const [students, subjects, instances] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assignmentInstance.findMany({
      where: { dueDate: { gte: monday, lt: weekEnd } },
      include: {
        subject: { select: { id: true, name: true } },
        series: {
          select: {
            id: true,
            endCondition: true,
            endDate: true,
            endCount: true,
            estimatedMinutes: true,
            recurrence: { select: { frequency: true, daysOfWeek: true, interval: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Parent Mode</h1>
        <nav className="flex items-center gap-8 text-sm">
          <Link href="/parent/students" className="px-1 text-[#6B6B6B] hover:underline">
            Students
          </Link>
          <Link href="/parent/subjects" className="px-1 text-[#6B6B6B] hover:underline">
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

      <ParentWeekBoard students={students} subjects={subjects} monday={monday} instances={instances} />
    </main>
  );
}
