import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";

export default async function Home() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <AppShell center>
      <BrandHeader align="center" wordmarkWidth={160} wordmarkHeight={34} />
      <p className="mt-4 text-sm" style={{ color: COLORS.muted }}>
        Who&rsquo;s working today?
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-10">
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

      <Link href="/parent/unlock" className="mt-14 text-sm hover:underline" style={{ color: COLORS.muted }}>
        Parent Mode
      </Link>
    </AppShell>
  );
}
