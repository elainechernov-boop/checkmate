import { submitFamilyPassword } from "./actions";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-6">
      <form action={submitFamilyPassword} className="w-full max-w-xs">
        <h1 className="mb-8 text-center text-2xl font-medium text-[#161616]">Checkmate</h1>
        <input type="hidden" name="from" value={from ?? "/"} />
        <label htmlFor="password" className="sr-only">
          Family password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Family password"
          className="w-full rounded border border-[#E1E3E6] bg-white px-4 py-2.5 text-[#161616] outline-none focus:border-[#161616]"
        />
        {error && <p className="mt-3 text-sm text-[#B5451B]">Incorrect password.</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded bg-[#161616] px-4 py-2.5 text-white transition hover:bg-[#333]"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
