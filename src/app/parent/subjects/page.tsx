import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { COLORS } from "@/lib/theme";
import { createSubject, deleteSubject, updateSubject } from "./actions";

const CATEGORY_OPTIONS = Object.values(WorkSampleCategory);

export default async function SubjectsPage() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10 lg:py-12" style={{ background: COLORS.background, color: COLORS.text }}>
      <Link href="/parent" className="text-sm hover:underline" style={{ color: COLORS.muted }}>
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Subjects</h1>
      <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
        Report category is what the HST report&rsquo;s hours-by-subject breakdown groups by — Math, ELA, Science, and
        History; leave it as &ldquo;none&rdquo; for anything else (Latin, Art, Scouts, …).
      </p>

      <div className="mt-8 max-w-xl">
        {subjects.map((subject) => (
          <form
            key={subject.id}
            action={updateSubject}
            className="flex flex-wrap items-center gap-3 border-b py-3 text-sm"
            style={{ borderColor: COLORS.hairline }}
          >
            <input type="hidden" name="id" value={subject.id} />
            <input
              type="text"
              name="name"
              defaultValue={subject.name}
              required
              className="w-32 border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline, color: COLORS.text }}
              aria-label="Name"
            />
            <select
              name="workSampleCategory"
              defaultValue={subject.workSampleCategory}
              className="border-b bg-transparent py-1 outline-none"
              style={{ borderColor: COLORS.hairline, color: COLORS.text }}
              aria-label="Report category"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isFaithIntegrated" defaultChecked={subject.isFaithIntegrated} />
              Faith-integrated
            </label>
            <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
              Save
            </button>
            <button type="submit" formAction={deleteSubject} className="ml-auto" style={{ color: COLORS.crimson }}>
              Delete
            </button>
          </form>
        ))}

        <form action={createSubject} className="flex flex-wrap items-center gap-3 border-b border-dashed py-3 text-sm" style={{ borderColor: COLORS.hairline }}>
          <input
            type="text"
            name="name"
            placeholder="Name"
            required
            className="w-32 border-b bg-transparent py-1 outline-none"
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
          />
          <select
            name="workSampleCategory"
            defaultValue={WorkSampleCategory.none}
            className="border-b bg-transparent py-1 outline-none"
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isFaithIntegrated" />
            Faith-integrated
          </label>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            Add subject
          </button>
        </form>
      </div>
    </main>
  );
}
