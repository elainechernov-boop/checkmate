import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-6 text-[#161616] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">HST Meeting Prep report</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Per student, per learning period: attendance summary, work samples, and a full completed-work log by subject.
      </p>

      {students.length === 0 || learningPeriods.length === 0 ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          Add a student and a{" "}
          <Link href="/parent/calendar" className="underline">
            learning period
          </Link>{" "}
          first.
        </p>
      ) : (
        <form action={goToReport} className="mt-6 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs text-[#6B6B6B]">Student</label>
            <select name="studentId" className="rounded border border-[#E1E3E6] px-2 py-1.5">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">Learning period</label>
            <select name="lp" className="rounded border border-[#E1E3E6] px-2 py-1.5">
              {learningPeriods.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            Build report
          </button>
        </form>
      )}
    </main>
  );
}
