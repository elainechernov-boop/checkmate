import { getScopedPrisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { AssignmentForm } from "./AssignmentForm";

export default async function NewAssignmentPage() {
  const prisma = await getScopedPrisma();
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav />
      </BrandHeader>
      <PageHeading title="New assignment" />

      {students.length === 0 || subjects.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: COLORS.muted }}>
          Add at least one student and one subject before creating an assignment.
        </p>
      ) : (
        <AssignmentForm students={students} subjects={subjects} />
      )}
    </AppShell>
  );
}
