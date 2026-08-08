import { prisma } from "@/lib/prisma";

export default async function ParentPage() {
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <h1 className="text-2xl font-medium">Parent Mode</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Assignment planning, recurrence, and the compliance module land in later phases.
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[#6B6B6B]">Students</h2>
        <ul className="mt-3 space-y-1">
          {students.map((student) => (
            <li key={student.id}>
              {student.name} · {student.gradeLevel}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[#6B6B6B]">Subjects</h2>
        <ul className="mt-3 space-y-1">
          {subjects.map((subject) => (
            <li key={subject.id}>
              {subject.name} — {subject.workSampleCategory}
              {subject.isFaithIntegrated ? " (faith-integrated, work-sample ineligible)" : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
