import { notFound } from "next/navigation";
import { addDays, defaultWeekStart, parseISODate, startOfUTCDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { StudentWeekView } from "./StudentWeekView";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) notFound();

  const today = startOfUTCDay(new Date());
  const monday = week ? parseISODate(week) : defaultWeekStart(today);
  const weekEnd = addDays(monday, 6); // Mon..Sat, six columns per §6

  const comingUpStart = addDays(today, 1);
  const comingUpEnd = addDays(today, 14);

  const [weekInstances, comingUp] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { studentId: id, dueDate: { gte: monday, lt: weekEnd } },
      include: {
        subject: { select: { id: true, name: true } },
        series: { select: { estimatedMinutes: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.assignmentInstance.findMany({
      where: {
        studentId: id,
        dueDate: { gte: comingUpStart, lte: comingUpEnd },
        status: { not: "done" },
      },
      include: {
        subject: { select: { id: true, name: true } },
        series: { select: { estimatedMinutes: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  return (
    <StudentWeekView
      student={student}
      monday={monday}
      today={today}
      instances={weekInstances}
      comingUp={comingUp}
    />
  );
}
