import { getScopedPrisma } from "@/lib/prisma";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { SubjectsBoard } from "./SubjectsBoard";

export default async function SubjectsPage() {
  const prisma = await getScopedPrisma();
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="subjects" />
      </BrandHeader>
      <PageHeading
        title="Subjects"
        description="Report category is what the HST report's hours-by-subject breakdown groups by — Math, ELA, Science, and History; leave it as “none” for anything else (Latin, Art, Scouts, …)."
      />
      <SubjectsBoard subjects={subjects} />
    </AppShell>
  );
}
