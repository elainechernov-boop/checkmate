import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) notFound();

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <Link href="/" className="text-sm text-[#6B6B6B] hover:underline">
        ← Switch student
      </Link>
      <h1 className="mt-4 text-2xl font-medium">{student.name}&rsquo;s week</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">The week view arrives in Phase 3.</p>
    </main>
  );
}
