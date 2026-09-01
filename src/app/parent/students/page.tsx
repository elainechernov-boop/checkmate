import { getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { StudentsBoard } from "./StudentsBoard";

export default async function StudentsPage() {
  const prisma = await getScopedPrisma();
  const [family, students] = await Promise.all([
    getCurrentFamily(),
    prisma.student.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="students" showComplianceLinks={family.complianceModuleEnabled} />
      </BrandHeader>
      <PageHeading title="Students" />
      <StudentsBoard students={students} />
    </AppShell>
  );
}
