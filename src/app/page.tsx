import Link from "next/link";
import { getScopedPrisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";

export default async function Home() {
  const prisma = await getScopedPrisma();
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <AppShell center>
      <BrandHeader align="center" wordmarkWidth={155} wordmarkHeight={33} />
      <p className="mt-7" style={{ color: COLORS.muted, fontSize: 12 }}>
        Who&rsquo;s working today?
      </p>

      <div className="mt-[18px] flex flex-wrap justify-center gap-x-6 gap-y-[18px]">
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

      <Link href="/parent/unlock" className="mt-7 hover:underline" style={{ color: COLORS.muted, fontSize: 12 }}>
        Parent Mode
      </Link>
    </AppShell>
  );
}
