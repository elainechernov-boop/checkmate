import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AssignmentForm } from "./AssignmentForm";

export default async function NewAssignmentPage() {
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-6 text-[#161616] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">New assignment</h1>

      {students.length === 0 || subjects.length === 0 ? (
        <p className="mt-8 text-sm text-[#6B6B6B]">
          Add at least one student and one subject before creating an assignment.
        </p>
      ) : (
        <AssignmentForm students={students} subjects={subjects} />
      )}
    </main>
  );
}
