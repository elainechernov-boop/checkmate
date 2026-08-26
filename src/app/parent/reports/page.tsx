import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";

async function goToReport(formData: FormData) {
  "use server";
  const studentId = String(formData.get("studentId") ?? "");
  const lpId = String(formData.get("lp") ?? "");
  if (!studentId || !lpId) return;
  redirect(`/parent/reports/${studentId}/${lpId}`);
}

/** §8's HST Meeting Prep report — pick a student and learning period, land
 * on a print-ready page (Safari's Print to PDF does the rest). */
export default async function ReportsPage() {
  const [students, learningPeriods] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10 lg:py-12" style={{ background: COLORS.background, color: COLORS.text }}>
      <Link href="/parent" className="text-sm hover:underline" style={{ color: COLORS.muted }}>
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">HST Meeting Prep report</h1>
      <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
        Per student, per learning period: hours completed in Math, ELA, History, and Science, plus a full
        completed-work log by subject.
      </p>

      {students.length === 0 || learningPeriods.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: COLORS.muted }}>
          Add a student and a{" "}
          <Link href="/parent/calendar" className="underline">
            learning period
          </Link>{" "}
          first.
        </p>
      ) : (
        <form action={goToReport} className="mt-6 flex flex-wrap items-end gap-4 text-sm">
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Student
            </label>
            <select name="studentId" className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline, color: COLORS.text }}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Learning period
            </label>
            <select name="lp" className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline, color: COLORS.text }}>
              {learningPeriods.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            Build report →
          </button>
        </form>
      )}
    </main>
  );
}
