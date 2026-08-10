import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildHSTReport } from "@/lib/hstReport";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { PrintButton } from "../../PrintButton";

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

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-10 py-12 text-[#161616] print:bg-white print:px-0 print:py-0">
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
            Attendance
          </h2>
          <p className="mt-2 text-sm">
            {report.attendance.presentCount} / {report.attendance.schoolDayCount} school days present
            {report.attendance.allClaimed ? " · all claimed" : " · not all claimed yet"}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
            Work samples
          </h2>
          {report.workSamples.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: COLORS.mutedFaint }}>
              None flagged for this learning period yet.
            </p>
          ) : (
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr style={{ color: COLORS.muted }}>
                  <th className="border-b py-1 pr-3 font-medium" style={{ borderColor: COLORS.hairline }}>
                    Title
                  </th>
                  <th className="border-b py-1 pr-3 font-medium" style={{ borderColor: COLORS.hairline }}>
                    Subject
                  </th>
                  <th className="border-b py-1 font-medium" style={{ borderColor: COLORS.hairline }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.workSamples.map((sample) => (
                  <tr key={sample.id}>
                    <td className="border-b py-1 pr-3" style={{ borderColor: COLORS.hairline }}>
                      {sample.title}
                      {sample.note && (
                        <span className="block text-xs" style={{ color: COLORS.muted }}>
                          {sample.note}
                        </span>
                      )}
                    </td>
                    <td className="border-b py-1 pr-3" style={{ borderColor: COLORS.hairline }}>
                      {sample.subjectName}
                    </td>
                    <td className="border-b py-1" style={{ borderColor: COLORS.hairline }}>
                      {formatComingUpDate(sample.completionDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
