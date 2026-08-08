import { submitParentPasscode } from "./actions";

export default async function ParentUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF7F2] px-6">
      <form action={submitParentPasscode} className="w-full max-w-xs">
        <h1 className="mb-8 text-center text-2xl font-medium text-[#1A1A1A]">Parent Mode</h1>
        <label htmlFor="passcode" className="sr-only">
          Parent passcode
        </label>
        <input
          id="passcode"
          type="password"
          name="passcode"
          autoFocus
          required
          placeholder="Passcode"
          className="w-full rounded border border-[#DDD6CB] bg-white px-4 py-2.5 text-[#1A1A1A] outline-none focus:border-[#1A1A1A]"
        />
        {error && <p className="mt-3 text-sm text-[#B5451B]">Incorrect passcode.</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded bg-[#1A1A1A] px-4 py-2.5 text-white transition hover:bg-[#333]"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}
