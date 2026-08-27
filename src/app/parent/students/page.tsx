import { prisma } from "@/lib/prisma";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { StudentsBoard } from "./StudentsBoard";

export default async function StudentsPage() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav current="students" />
      </BrandHeader>
      <PageHeading title="Students" />
      <StudentsBoard students={students} />
    </AppShell>
  );
}
