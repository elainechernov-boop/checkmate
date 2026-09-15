import { getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { PhotoImportForm } from "./PhotoImportForm";

export default async function PhotoImportPage() {
  const prisma = await getScopedPrisma();
  const [family, students, subjects] = await Promise.all([
    getCurrentFamily(),
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav showComplianceLinks={family.complianceModuleEnabled} />
      </BrandHeader>
      <PageHeading title="Import from a photo or text" />

      {students.length === 0 || subjects.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: COLORS.muted }}>
          Add at least one student and one subject before importing assignments.
        </p>
      ) : (
        <PhotoImportForm students={students} subjects={subjects} />
      )}
    </AppShell>
  );
}
