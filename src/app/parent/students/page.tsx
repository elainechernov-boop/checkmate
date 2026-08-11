import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createStudent, deleteStudent, updateStudent } from "./actions";

export default async function StudentsPage() {
  const students = await prisma.student.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-6 text-[#161616] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Students</h1>

      <div className="mt-8 space-y-4">
        {students.map((student) => (
          <form
            key={student.id}
            action={updateStudent}
            className="flex items-center gap-3 rounded border border-[#E1E3E6] bg-white p-4"
          >
            <input type="hidden" name="id" value={student.id} />
            <input
              type="color"
              name="accentColor"
              defaultValue={student.accentColor}
              className="h-9 w-9 shrink-0 rounded border border-[#E1E3E6]"
              aria-label={`${student.name}'s accent color`}
            />
            <input
              type="text"
              name="name"
              defaultValue={student.name}
              required
              className="w-40 rounded border border-[#E1E3E6] px-3 py-2"
              aria-label="Name"
            />
            <input
              type="text"
              name="gradeLevel"
              defaultValue={student.gradeLevel}
              required
              className="w-40 rounded border border-[#E1E3E6] px-3 py-2"
              aria-label="Grade level"
            />
            <button
              type="submit"
              className="rounded bg-[#161616] px-3 py-2 text-sm text-white hover:bg-[#333]"
            >
              Save
            </button>
            <button
              type="submit"
              formAction={deleteStudent}
              className="rounded border border-[#E1E3E6] px-3 py-2 text-sm text-[#B5451B] hover:border-[#B5451B]"
            >
              Delete
            </button>
          </form>
        ))}
      </div>

      <form
        action={createStudent}
        className="mt-8 flex items-center gap-3 rounded border border-dashed border-[#E1E3E6] bg-white p-4"
      >
        <input
          type="color"
          name="accentColor"
          defaultValue="#6B6B6B"
          className="h-9 w-9 shrink-0 rounded border border-[#E1E3E6]"
          aria-label="Accent color"
        />
        <input
          type="text"
          name="name"
          placeholder="Name"
          required
          className="w-40 rounded border border-[#E1E3E6] px-3 py-2"
        />
        <input
          type="text"
          name="gradeLevel"
          placeholder="Grade level"
          required
          className="w-40 rounded border border-[#E1E3E6] px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-[#161616] px-3 py-2 text-sm text-white hover:bg-[#333]"
        >
          + Add student
        </button>
      </form>
    </main>
  );
}
