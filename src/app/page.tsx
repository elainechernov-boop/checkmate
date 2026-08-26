import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#FAF7F2] px-6 text-[#1A1A1A]">
      <Image src="/homeroom-wordmark.svg" alt="homeroom" width={160} height={34} className="h-9 w-auto" priority />
      <p className="mt-4 text-sm text-[#6B6B6B]">Who&rsquo;s working today?</p>

      <div className="mt-10 flex gap-6">
        {students.map((student) => (
          <Link
            key={student.id}
            href={`/student/${student.id}`}
            className="rounded-lg border border-[#E1E3E6] bg-white px-8 py-6 text-lg font-medium transition hover:border-[#1A1A1A]"
            style={{ borderTopColor: student.accentColor, borderTopWidth: 3 }}
          >
            {student.name}
          </Link>
        ))}
      </div>

      <Link href="/parent/unlock" className="mt-14 text-sm text-[#6B6B6B] hover:underline">
        Parent Mode
      </Link>
    </main>
  );
}
