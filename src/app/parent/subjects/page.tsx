import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { createSubject, deleteSubject, updateSubject } from "./actions";

const CATEGORY_OPTIONS = Object.values(WorkSampleCategory);

export default async function SubjectsPage() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Subjects</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Work-sample category maps to Blue Ridge&rsquo;s four eligible categories (§8). Faith-integrated
        subjects are excluded from work samples.
      </p>

      <div className="mt-8 space-y-4">
        {subjects.map((subject) => (
          <form
            key={subject.id}
            action={updateSubject}
            className="flex flex-wrap items-center gap-3 rounded border border-[#DDD6CB] bg-white p-4"
          >
            <input type="hidden" name="id" value={subject.id} />
            <input
              type="text"
              name="name"
              defaultValue={subject.name}
              required
              className="w-36 rounded border border-[#DDD6CB] px-3 py-2"
              aria-label="Name"
            />
            <select
              name="workSampleCategory"
              defaultValue={subject.workSampleCategory}
              className="rounded border border-[#DDD6CB] px-3 py-2"
              aria-label="Work sample category"
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
              className="rounded bg-[#1A1A1A] px-3 py-2 text-sm text-white hover:bg-[#333]"
            >
              Save
            </button>
            <button
              type="submit"
              formAction={deleteSubject}
              className="rounded border border-[#DDD6CB] px-3 py-2 text-sm text-[#B5451B] hover:border-[#B5451B]"
            >
              Delete
            </button>
          </form>
        ))}
      </div>

      <form
        action={createSubject}
        className="mt-8 flex flex-wrap items-center gap-3 rounded border border-dashed border-[#DDD6CB] bg-white p-4"
      >
        <input
          type="text"
          name="name"
          placeholder="Name"
          required
          className="w-36 rounded border border-[#DDD6CB] px-3 py-2"
        />
        <select
          name="workSampleCategory"
          defaultValue={WorkSampleCategory.none}
          className="rounded border border-[#DDD6CB] px-3 py-2"
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
          className="rounded bg-[#1A1A1A] px-3 py-2 text-sm text-white hover:bg-[#333]"
        >
          + Add subject
        </button>
      </form>
    </main>
  );
}
