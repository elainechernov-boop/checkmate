import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { buildHSTReport } from "@/lib/hstReport";
import { formatComingUpDate } from "@/lib/dates";
import { formatTotalMinutes } from "@/lib/estimatedMinutes";
import { COLORS } from "@/lib/theme";
import { PrintButton } from "../../PrintButton";

const CATEGORY_LABEL: Record<WorkSampleCategory, string> = {
  math: "Math",
  languageArts: "ELA",
  science: "Science",
  socialStudies: "History",
  none: "—",
};

export default async function HSTReportPage({
  params,
}: {
  params: Promise<{ studentId: string; lpId: string }>;
}) {
  const { studentId, lpId } = await params;

  const [student, lp] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.learningPeriod.findUnique({ where: { id: lpId } }),
  ]);
  if (!student || !lp) notFound();

  const report = await buildHSTReport(prisma, studentId, lpId);
  // Scales each subject's bar relative to the largest one this LP — there's
  // no fixed "hours capacity" to measure against, only a relative sense of
  // where the time actually went.
  const maxCategoryMinutes = Math.max(0, ...report.hoursByCategory.map((c) => c.minutes));

  return (
    <main className="min-h-screen bg-[#FFFFFF] px-10 py-12 text-[#1A1A1A] print:bg-white print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/parent/reports" className="text-sm text-[#6B6B6B] hover:underline">
          ← Back to reports
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto mt-8 max-w-2xl print:mt-0 print:max-w-none">
        <h1 className="text-2xl font-medium">{report.student.name} — HST Meeting Prep</h1>
        <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
          {report.learningPeriod.name} · {formatComingUpDate(report.learningPeriod.startDate)} –{" "}
          {formatComingUpDate(report.learningPeriod.endDate)}
          {report.learningPeriod.hstMeetingDate && (
            <> · HST meeting {formatComingUpDate(report.learningPeriod.hstMeetingDate)}</>
          )}
        </p>

        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
            Hours by subject
          </h2>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            {report.hoursByCategory.map(({ category, minutes }) => (
              <div key={category} className="border-b pb-1.5" style={{ borderColor: COLORS.hairline }}>
                <div className="flex justify-between">
                  <dt style={{ color: COLORS.muted }}>{CATEGORY_LABEL[category]}</dt>
                  <dd>{minutes > 0 ? formatTotalMinutes(minutes) : "—"}</dd>
                </div>
                <span aria-hidden className="mt-1 block h-[3px]" style={{ background: COLORS.hairline }}>
                  <span
                    className="block h-full"
                    style={{
                      width: `${maxCategoryMinutes > 0 ? Math.round((minutes / maxCategoryMinutes) * 100) : 0}%`,
                      background: COLORS.cobalt,
                    }}
                  />
                </span>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
            Completed work by subject
          </h2>
          {report.completedBySubject.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: COLORS.mutedFaint }}>
              No completed, subject-tagged work in this learning period yet.
            </p>
          ) : (
            <div className="mt-2 space-y-4">
              {report.completedBySubject.map((group) => (
                <div key={group.subjectName}>
                  <h3 className="text-sm font-medium">{group.subjectName}</h3>
                  <ul className="mt-1 text-sm" style={{ color: COLORS.muted }}>
                    {group.items.map((item, index) => (
                      <li key={index} className="flex justify-between border-b py-1" style={{ borderColor: COLORS.hairline }}>
                        <span>{item.title}</span>
                        <span>{formatComingUpDate(item.completionDate)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </article>
    </main>
  );
}
