import type { AssignmentInstance } from "@/generated/prisma/client";

export type StudentInstance = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  series: { estimatedMinutes: number | null } | null;
};
