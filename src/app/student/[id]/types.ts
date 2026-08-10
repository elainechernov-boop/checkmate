import type { AssignmentInstance, Project } from "@/generated/prisma/client";

export type StudentInstance = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  series: { estimatedMinutes: number | null } | null;
  project: { id: string; name: string } | null;
};

// A project plus its undated backlog tasks (§7) — scheduled tasks show up
// as ordinary StudentInstance rows in the week grid instead.
export type StudentProject = Project & {
  backlogTasks: StudentInstance[];
};
