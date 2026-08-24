import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { createSubject, deleteSubject, updateSubject } from "./actions";

const CATEGORY_OPTIONS = Object.values(WorkSampleCategory);

export default async function SubjectsPage() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-6 text-[#161616] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Subjects</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Report category is what the HST report&rsquo;s hours-by-subject breakdown groups by — Math, ELA, Science, and
        History; leave it as &ldquo;none&rdquo; for anything else (Latin, Art, Scouts, …).
      </p>

      <div className="mt-8 space-y-4">
        {subjects.map((subject) => (
          <form
            key={subject.id}
            action={updateSubject}
            className="flex flex-wrap items-center gap-3 rounded border border-[#E1E3E6] bg-white p-4"
          >
            <input type="hidden" name="id" value={subject.id} />
            <input
              type="text"
              name="name"
              defaultValue={subject.name}
              required
              className="w-36 rounded border border-[#E1E3E6] px-3 py-2"
              aria-label="Name"
            />
            <select
              name="workSampleCategory"
              defaultValue={subject.workSampleCategory}
              className="rounded border border-[#E1E3E6] px-3 py-2"
              aria-label="Report category"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isFaithIntegrated"
                defaultChecked={subject.isFaithIntegrated}
              />
              Faith-integrated
            </label>
            <button
              type="submit"
              className="rounded bg-[#161616] px-3 py-2 text-sm text-white hover:bg-[#333]"
            >
              Save
            </button>
            <button
              type="submit"
              formAction={deleteSubject}
              className="rounded border border-[#E1E3E6] px-3 py-2 text-sm text-[#B5451B] hover:border-[#B5451B]"
            >
              Delete
            </button>
          </form>
        ))}
      </div>

      <form
        action={createSubject}
        className="mt-8 flex flex-wrap items-center gap-3 rounded border border-dashed border-[#E1E3E6] bg-white p-4"
      >
        <input
          type="text"
          name="name"
          placeholder="Name"
          required
          className="w-36 rounded border border-[#E1E3E6] px-3 py-2"
        />
        <select
          name="workSampleCategory"
          defaultValue={WorkSampleCategory.none}
          className="rounded border border-[#E1E3E6] px-3 py-2"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isFaithIntegrated" />
          Faith-integrated
        </label>
        <button
          type="submit"
          className="rounded bg-[#161616] px-3 py-2 text-sm text-white hover:bg-[#333]"
        >
          + Add subject
        </button>
      </form>
    </main>
  );
}
