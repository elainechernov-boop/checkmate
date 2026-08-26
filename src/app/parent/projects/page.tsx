import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { createProjectForStudentAction, deleteProjectAction, setProjectSubjectAction } from "./actions";

type ProjectRow = Awaited<ReturnType<typeof loadProjects>>[number];

async function loadProjects() {
  return prisma.project.findMany({
    include: {
      subject: { select: { id: true, name: true } },
      instances: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** §7 "Parent Mode sees all projects and can edit or delete anything
 * inappropriate, but the default posture is hands-off." No plan-editing
 * here — just visibility, subject tagging for HST reports (§8), and delete. */
export default async function ParentProjectsPage() {
  const [students, subjects, projects] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadProjects(),
  ]);

  return (
    <main className="min-h-screen bg-[#FFFFFF] px-4 py-6 text-[#1A1A1A] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Projects</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Student-initiated projects (§7). Tag a subject to include a project&rsquo;s finished work in HST reports —
        untagged projects stay out of compliance reporting entirely.
      </p>

      {students.length > 0 && (
        <form action={createProjectForStudentAction} className="mt-6 flex flex-wrap items-end gap-4 border-b pb-4 text-sm" style={{ borderColor: COLORS.hairline }}>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Student
            </label>
            <select
              name="studentId"
              required
              defaultValue={students[0]?.id}
              className="mt-1 border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline }}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Project name
            </label>
            <input
              name="name"
              required
              placeholder="Learn Clair de Lune"
              className="mt-1 w-full border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline }}
            />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Target date (optional)
            </label>
            <input
              type="date"
              name="targetDate"
              className="mt-1 border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline }}
            />
          </div>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            + New project
          </button>
        </form>
      )}
      <p className="mt-2 text-xs" style={{ color: COLORS.mutedFaint }}>
        Write in the name — the student adds and schedules the tasks themselves from their own Projects band.
      </p>

      {projects.length === 0 && <p className="mt-8 text-sm text-[#6B6B6B]">No student projects yet.</p>}

      {students.map((student) => {
        const studentProjects = projects.filter((p) => p.studentId === student.id);
        if (studentProjects.length === 0) return null;
        return (
          <section key={student.id} className="mt-8">
            <h2
              className="uppercase"
              style={{ color: student.accentColor, fontFamily: "var(--font-syncopate)", fontWeight: 700, fontSize: 15, letterSpacing: "0.03em" }}
            >
              {student.name}
            </h2>
            <div className="mt-2 max-w-xl">
              {studentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} subjects={subjects} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function ProjectCard({ project, subjects }: { project: ProjectRow; subjects: { id: string; name: string }[] }) {
  const doneCount = project.instances.filter((i) => i.status === "done" || i.status === "excused").length;

  return (
    <div className="border-b py-3" style={{ borderColor: COLORS.hairline }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium" style={{ textDecoration: project.status === "completed" ? "line-through" : undefined }}>
            {project.name}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: COLORS.muted }}>
            {project.status === "completed" ? "Finished" : project.status === "archived" ? "Archived" : "Active"} ·{" "}
            {doneCount}/{project.instances.length} task(s) done
            {project.targetDate && ` · target ${formatComingUpDate(project.targetDate)}`}
          </p>
        </div>
        <form action={deleteProjectAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <button type="submit" className="shrink-0 text-xs font-medium" style={{ color: COLORS.crimson }}>
            Delete
          </button>
        </form>
      </div>

      <form action={setProjectSubjectAction} className="mt-2 flex items-center gap-2 text-xs">
        <label style={{ color: COLORS.muted }}>HST subject</label>
        <input type="hidden" name="projectId" value={project.id} />
        <select
          name="subjectId"
          defaultValue={project.subjectId ?? ""}
          className="border-b bg-transparent py-1 outline-none"
          style={{ borderColor: COLORS.hairline }}
        >
          <option value="">Untagged (excluded from reports)</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
          Save
        </button>
      </form>
    </div>
  );
}
