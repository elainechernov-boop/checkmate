import { getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { SubjectsBoard } from "./SubjectsBoard";

export default async function SubjectsPage() {
  const prisma = await getScopedPrisma();
  const [family, subjects] = await Promise.all([
    getCurrentFamily(),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="subjects" showComplianceLinks={family.complianceModuleEnabled} />
      </BrandHeader>
      <PageHeading
        title="Subjects"
        description={
          family.complianceModuleEnabled
            ? "Report category is what the HST report's hours-by-subject breakdown groups by — Math, ELA, Science, and History; leave it as “none” for anything else (Latin, Art, Scouts, …)."
            : undefined
        }
      />
      <SubjectsBoard subjects={subjects} showReportCategory={family.complianceModuleEnabled} />
    </AppShell>
  );
}
