import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#FFFFFF] px-6 text-[#1A1A1A]">
      <Image src="/homeroom-wordmark.svg" alt="homeroom" width={160} height={34} className="h-9 w-auto" priority />
      <p className="mt-4 text-sm text-[#6B6B6B]">Who&rsquo;s working today?</p>

      <div className="mt-10 flex gap-10">
        {students.map((student) => (
          <Link
            key={student.id}
            href={`/student/${student.id}`}
            className="border-b border-dashed pb-1 uppercase transition-colors hover:border-solid"
            style={{
              color: student.accentColor,
              borderColor: student.accentColor,
              fontFamily: "var(--font-syncopate)",
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: "0.03em",
            }}
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
