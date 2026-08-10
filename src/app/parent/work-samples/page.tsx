import Link from "next/link";
import type { AssignmentInstance } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { attendanceDateFor } from "@/lib/reviewActions";
import { evaluateWorkSampleEligibility, type WorkSampleEligibility } from "@/lib/workSamples";
import { flagWorkSampleAction, unflagWorkSampleAction } from "./actions";

type InstanceWithSubject = AssignmentInstance & { subject: { name: string } | null };

export default async function WorkSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; lp?: string }>;
}) {
  const { studentId: studentIdParam, lp: lpIdParam } = await searchParams;
  const [students, learningPeriods] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  const student = students.find((s) => s.id === studentIdParam) ?? students[0] ?? null;
  const lp = learningPeriods.find((l) => l.id === lpIdParam) ?? learningPeriods[0] ?? null;

  let items: { instance: InstanceWithSubject; date: Date; eligibility: WorkSampleEligibility }[] = [];
  if (student && lp) {
    const resolved = await prisma.assignmentInstance.findMany({
      where: { studentId: student.id, status: { in: [InstanceStatus.done, InstanceStatus.excused] } },
      include: { subject: { select: { name: true } } },
      orderBy: { completedAt: "desc" },
    });
    const inRange = resolved
      .map((instance) => ({ instance, date: attendanceDateFor(instance) }))
      .filter((row): row is { instance: InstanceWithSubject; date: Date } => !!row.date && row.date >= lp.startDate && row.date <= lp.endDate);

    items = await Promise.all(
      inRange.map(async (row) => ({ ...row, eligibility: await evaluateWorkSampleEligibility(prisma, row.instance.id) }))
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-10 py-12 text-[#161616]">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Work samples</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Flag completed work as a Blue Ridge sample (§8). Faith-integrated subjects and non-eligible categories can&rsquo;t
        be flagged; a completion date outside the LP or not yet marked present is a warning, not a block.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-[#6B6B6B]">Student</label>
          <select name="studentId" defaultValue={student?.id} className="rounded border border-[#E1E3E6] px-2 py-1.5">
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#6B6B6B]">Learning period</label>
          <select name="lp" defaultValue={lp?.id} className="rounded border border-[#E1E3E6] px-2 py-1.5">
            {learningPeriods.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
          View
        </button>
      </form>

      {!student || !lp ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          Add a student and a{" "}
          <Link href="/parent/calendar" className="underline">
            learning period
          </Link>{" "}
          first.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">No completed work in this learning period yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map(({ instance, date, eligibility }) => (
            <WorkSampleRow key={instance.id} instance={instance} date={date} eligibility={eligibility} />
          ))}
        </div>
      )}
    </main>
  );
}

function WorkSampleRow({
  instance,
  date,
  eligibility,
}: {
  instance: InstanceWithSubject;
  date: Date;
  eligibility: WorkSampleEligibility;
}) {
  return (
    <div className="rounded border border-[#E1E3E6] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{instance.title}</p>
          <p className="mt-0.5 text-xs" style={{ color: COLORS.muted }}>
            {instance.subject?.name ?? "No subject"} · {formatComingUpDate(date)}
          </p>
        </div>
        {instance.isWorkSample && (
          <span className="shrink-0 text-xs font-medium" style={{ color: COLORS.amber }}>
            Work sample
          </span>
        )}
      </div>

      {instance.isWorkSample ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          {instance.workSampleNote && <p style={{ color: COLORS.muted }}>{instance.workSampleNote}</p>}
          <form action={unflagWorkSampleAction} className="ml-auto">
            <input type="hidden" name="instanceId" value={instance.id} />
            <button type="submit" className="text-xs" style={{ color: COLORS.muted }}>
              Unflag
            </button>
          </form>
        </div>
      ) : eligibility.hardBlocks.length > 0 ? (
        <p className="mt-2 text-xs" style={{ color: COLORS.amber }}>
          {eligibility.hardBlocks.join(" ")}
        </p>
      ) : (
        <form action={flagWorkSampleAction} className="mt-3 flex flex-col items-start gap-2 text-sm">
          <input type="hidden" name="instanceId" value={instance.id} />
          {eligibility.warnings.length > 0 && (
            <>
              <p className="text-xs" style={{ color: COLORS.amber }}>
                {eligibility.warnings.join(" ")}
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="acknowledge" required />
                Flag it anyway
              </label>
            </>
          )}
          <input
            type="text"
            name="note"
            placeholder="Optional note"
            className="w-full rounded border border-[#E1E3E6] px-2 py-1.5 text-xs"
          />
          <button type="submit" className="rounded bg-[#161616] px-3 py-1.5 text-xs text-white hover:bg-[#333]">
            Flag as work sample
          </button>
        </form>
      )}
    </div>
  );
}
