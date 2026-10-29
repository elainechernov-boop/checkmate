import { NextResponse } from "next/server";
import { getScopedPrisma } from "@/lib/prisma";
import { computeStudentStamp } from "@/lib/studentStamp";

// Not cached: the whole point is to be asked again a few seconds from now.
export const dynamic = "force-dynamic";

// The student tab's "has anything changed?" question (see studentStamp.ts).
// Sits under /student/..., so proxy.ts's family gate already covers it, and it
// reads through the family-scoped client like the page does, so a student id
// from another family is a 404 here, not a stamp.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = await getScopedPrisma();
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) return new NextResponse(null, { status: 404 });
  const stamp = await computeStudentStamp(prisma, id);
  return NextResponse.json({ stamp }, { headers: { "Cache-Control": "no-store" } });
}
