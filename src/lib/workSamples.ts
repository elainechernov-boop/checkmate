import type { PrismaClient } from "@/generated/prisma/client";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { startOfUTCDay } from "./dates";
import { attendanceDateFor } from "./reviewActions";

export interface WorkSampleEligibility {
  // Subject/category problems — the flag sheet refuses these outright (§8).
  hardBlocks: string[];
  // Date-vs-attendance mismatches — the app warns but still allows it (§8:
  // "if not, the app warns before allowing it").
  warnings: string[];
}

export class WorkSampleIneligibleError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(reasons.join(" "));
    this.reasons = reasons;
  }
}

/**
 * §8's work-sample rules. Subject eligibility (category + faith-integration)
 * is a hard block — there's no "why" to override, only to explain. The
 * completion-date/attendance match is a soft warning: the parent can still
 * flag it after seeing why it looks off.
 */
export function checkWorkSampleEligibility(params: {
  subject: { name: string; workSampleCategory: WorkSampleCategory; isFaithIntegrated: boolean } | null;
  completionDate: Date | null;
  learningPeriod: { startDate: Date; endDate: Date } | null;
  dayIsPresent: boolean;
}): WorkSampleEligibility {
  const hardBlocks: string[] = [];
  const warnings: string[] = [];

  if (!params.subject) {
    hardBlocks.push("This assignment has no subject, so it can't map to a work-sample category.");
  } else if (params.subject.isFaithIntegrated) {
    hardBlocks.push(`${params.subject.name} is faith-integrated — Blue Ridge requires work samples to be non-sectarian.`);
  } else if (params.subject.workSampleCategory === WorkSampleCategory.none) {
    hardBlocks.push(
      `${params.subject.name} doesn't map to one of Blue Ridge's four sample-eligible categories (Math, Language Arts, Science, Social Studies).`
    );
  }

  if (!params.completionDate) {
    hardBlocks.push("This assignment hasn't been completed yet.");
  } else {
    if (!params.learningPeriod) {
      warnings.push("No learning period covers this completion date.");
    } else if (params.completionDate < params.learningPeriod.startDate || params.completionDate > params.learningPeriod.endDate) {
      warnings.push("The completion date falls outside the current learning period.");
    }
    if (!params.dayIsPresent) {
      warnings.push("This day isn't marked present on the attendance log yet.");
    }
  }

  return { hardBlocks, warnings };
}

type WorkSamplePrisma = Pick<PrismaClient, "assignmentInstance" | "learningPeriod" | "schoolDay">;

/** Loads everything checkWorkSampleEligibility needs for one instance. */
export async function evaluateWorkSampleEligibility(
  prisma: WorkSamplePrisma,
  instanceId: string
): Promise<WorkSampleEligibility> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: { subject: true },
  });
  const completionDate = attendanceDateFor(instance);

  const learningPeriod = completionDate
    ? await prisma.learningPeriod.findFirst({
        where: { startDate: { lte: completionDate }, endDate: { gte: completionDate } },
      })
    : null;

  const dayRow = completionDate
    ? await prisma.schoolDay.findUnique({ where: { date: startOfUTCDay(completionDate) } })
    : null;

  return checkWorkSampleEligibility({
    subject: instance.subject,
    completionDate,
    learningPeriod,
    dayIsPresent: dayRow?.attendanceClaimed ?? false,
  });
}

/** The flag sheet's submit (§8) — always refuses a hard block; a soft
 * warning only blocks when the caller hasn't set `acknowledgeWarnings`
 * (the UI's "flag anyway" confirm). */
export async function flagWorkSample(
  prisma: WorkSamplePrisma & Pick<PrismaClient, "assignmentInstance">,
  instanceId: string,
  note: string | null,
  acknowledgeWarnings: boolean
): Promise<void> {
  const eligibility = await evaluateWorkSampleEligibility(prisma, instanceId);
  if (eligibility.hardBlocks.length > 0) {
    throw new WorkSampleIneligibleError(eligibility.hardBlocks);
  }
  if (eligibility.warnings.length > 0 && !acknowledgeWarnings) {
    throw new WorkSampleIneligibleError(eligibility.warnings);
  }

  await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: { isWorkSample: true, workSampleNote: note?.trim() || null },
  });
}

export async function unflagWorkSample(prisma: Pick<PrismaClient, "assignmentInstance">, instanceId: string): Promise<void> {
  await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: { isWorkSample: false, workSampleNote: null },
  });
}
