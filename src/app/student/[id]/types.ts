import type { AssignmentInstance, DaySeparator, Project, ProjectIdea } from "@/generated/prisma/client";

export type StudentInstance = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  series: { estimatedMinutes: number | null } | null;
  project: { id: string; name: string } | null;
};

// A project plus its undated backlog tasks (§7) — scheduled tasks show up
// as ordinary StudentInstance rows in the week grid instead. `progress`
// covers every task the project has ever had (backlog + scheduled +
// done), for the band's own progress bar (Canvas.dc.html).
export type StudentProject = Project & {
  backlogTasks: StudentInstance[];
  progress: { done: number; total: number };
};

// §7's "someday" scratch list — plain text, no relations of its own.
export type { ProjectIdea };

// §6's "Morning/Afternoon/Evening" divider — plain, no relations of its own.
export type { DaySeparator };
