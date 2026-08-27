import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getToday } from "@/lib/dates";
import { buildHSTReport, getCurrentLearningPeriod } from "@/lib/hstReport";
import { formatTotalMinutes } from "@/lib/estimatedMinutes";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { SettingsCard } from "@/components/SettingsCard";
import { LPSelect } from "./LPSelect";

const CATEGORY_LABEL: Record<string, string> = {
  math: "Math",
  languageArts: "ELA",
  science: "Science",
  socialStudies: "History",
};

/**
 * HOMEROOM_UX_MIGRATION.md §5.9 — a visible summary per student (subject-
 * hour rows, thin accent progress bars, a learning-period selector), not
 * just a bare two-select jump form. "HST Meeting Prep report," never a
 * "work sample PDF" — it's a meeting-prep/activity report.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const today = getToday();

  const [students, learningPeriods, currentLP] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
    getCurrentLearningPeriod(prisma, today),
  ]);

  const defaultLpId = currentLP?.id ?? learningPeriods[learningPeriods.length - 1]?.id ?? null;

  const studentCards =
    learningPeriods.length === 0
      ? []
      : await Promise.all(
          students.map(async (student) => {
            const selectedLpId = params[`lp_${student.id}`] ?? defaultLpId!;
            const report = await buildHSTReport(prisma, student.id, selectedLpId);
            const maxMinutes = Math.max(0, ...report.hoursByCategory.map((c) => c.minutes));

            return (
              <SettingsCard key={student.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    className="uppercase"
                    style={{ color: student.accentColor, fontFamily: "var(--font-syncopate)", fontWeight: 700, fontSize: 16, letterSpacing: "0.03em" }}
                  >
                    {student.name}
                  </h2>
                  <LPSelect studentId={student.id} learningPeriods={learningPeriods} selectedId={selectedLpId} />
                </div>

                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {report.hoursByCategory.map(({ category, minutes }) => (
                    <div key={category}>
                      <div className="flex justify-between">
                        <span style={{ color: COLORS.muted }}>{CATEGORY_LABEL[category] ?? category}</span>
                        <span style={{ color: COLORS.text }}>{minutes > 0 ? formatTotalMinutes(minutes) : "—"}</span>
                      </div>
                      <span aria-hidden className="mt-1 block h-[3px]" style={{ background: COLORS.hairline }}>
                        <span
                          className="block h-full"
                          style={{
                            width: `${maxMinutes > 0 ? Math.round((minutes / maxMinutes) * 100) : 0}%`,
                            background: student.accentColor,
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>

                <Link
                  href={`/parent/reports/${student.id}/${selectedLpId}`}
                  className="mt-3 inline-block text-sm hover:underline"
                  style={{ color: COLORS.text }}
                >
                  Open HST meeting report →
                </Link>
              </SettingsCard>
            );
          })
        );

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="reports" />
      </BrandHeader>
      <PageHeading
        title="HST Meeting Prep report"
        description="Per student, per learning period: hours completed in Math, ELA, History, and Science, plus a full completed-work log by subject."
      />

      {students.length === 0 || learningPeriods.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: COLORS.muted }}>
          Add a student and a{" "}
          <Link href="/parent/calendar" className="underline">
            learning period
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">{studentCards}</div>
      )}
    </AppShell>
  );
}
