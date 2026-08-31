import { getScopedPrisma } from "@/lib/prisma";
import { getToday } from "@/lib/dates";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { ParentProjectsBoard } from "./ParentProjectsBoard";

/**
 * HOMEROOM_UX_MIGRATION.md §5.12 — Elaine's no-student-creation decision
 * makes this the complete project-authoring surface: create/rename/delete/
 * reorder a project, target date + HST subject, backlog steps
 * (add/edit/delete/reorder/schedule/move/unschedule), archive/restore, and
 * a student's Someday ideas (including promoting one to a project).
 * Student Mode (ProjectsBand) only ever reads this data back, read-only.
 */
export default async function ParentProjectsPage() {
  const prisma = await getScopedPrisma();
  const today = getToday();

  const [students, subjects, projects, projectIdeas] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      include: {
        subject: { select: { id: true, name: true } },
        instances: {
          where: { dueDate: null },
          include: { subject: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.projectIdea.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const projectTaskStatuses = await prisma.assignmentInstance.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, status: true },
  });
  const progressByProject = new Map<string, { done: number; total: number }>();
  for (const { projectId, status } of projectTaskStatuses) {
    if (!projectId) continue;
    const current = progressByProject.get(projectId) ?? { done: 0, total: 0 };
    current.total += 1;
    if (status === "done" || status === "excused") current.done += 1;
    progressByProject.set(projectId, current);
  }

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav />
      </BrandHeader>
      <PageHeading
        title="Projects"
        description="The complete planning surface for every student's self-directed projects and Someday ideas — students can complete a scheduled step, but everything here (creating, scheduling, and deleting) is Parent Mode only."
      />

      <ParentProjectsBoard
        students={students}
        subjects={subjects}
        projects={projects.map(({ instances, ...project }) => ({
          ...project,
          backlogTasks: instances,
          progress: progressByProject.get(project.id) ?? { done: 0, total: 0 },
        }))}
        projectIdeas={projectIdeas}
        today={today}
      />
    </AppShell>
  );
}
