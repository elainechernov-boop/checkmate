import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COLORS } from "@/lib/theme";
import { createStudent, deleteStudent, updateStudent } from "./actions";

export default async function StudentsPage() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10 lg:py-12" style={{ background: COLORS.background, color: COLORS.text }}>
      <Link href="/parent" className="text-sm hover:underline" style={{ color: COLORS.muted }}>
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Students</h1>

      <div className="mt-8 max-w-lg">
        {students.map((student) => (
          <form
            key={student.id}
            action={updateStudent}
            className="flex items-center gap-3 border-b py-3 text-sm"
            style={{ borderColor: COLORS.hairline }}
          >
            <input type="hidden" name="id" value={student.id} />
            <input
              type="color"
              name="accentColor"
              defaultValue={student.accentColor}
              className="h-6 w-6 shrink-0 border-0 bg-transparent p-0"
              aria-label={`${student.name}'s accent color`}
            />
            <input
              type="text"
              name="name"
              defaultValue={student.name}
              required
              className="w-32 border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline, color: COLORS.text }}
              aria-label="Name"
            />
            <input
              type="text"
              name="gradeLevel"
              defaultValue={student.gradeLevel}
              required
              className="w-32 border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline, color: COLORS.text }}
              aria-label="Grade level"
            />
            <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
              Save
            </button>
            <button type="submit" formAction={deleteStudent} className="ml-auto" style={{ color: COLORS.crimson }}>
              Delete
            </button>
          </form>
        ))}

        <form action={createStudent} className="flex items-center gap-3 border-b border-dashed py-3 text-sm" style={{ borderColor: COLORS.hairline }}>
          <input
            type="color"
            name="accentColor"
            defaultValue="#1657FF"
            className="h-6 w-6 shrink-0 border-0 bg-transparent p-0"
            aria-label="Accent color"
          />
          <input
            type="text"
            name="name"
            placeholder="Name"
            required
            className="w-32 border-b bg-transparent py-1 outline-none"
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
          />
          <input
            type="text"
            name="gradeLevel"
            placeholder="Grade level"
            required
            className="w-32 border-b bg-transparent py-1 outline-none"
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
          />
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            + Add student
          </button>
        </form>
      </div>
    </main>
  );
}
