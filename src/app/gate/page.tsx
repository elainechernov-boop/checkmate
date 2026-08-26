import Image from "next/image";
import { submitFamilyPassword } from "./actions";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFFFF] px-6">
      <form action={submitFamilyPassword} className="w-full max-w-xs">
        <Image
          src="/homeroom-wordmark.svg"
          alt="homeroom"
          width={160}
          height={34}
          className="mx-auto mb-8 h-8 w-auto"
          priority
        />
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
          className="w-full rounded border border-[#E1E3E6] bg-white px-4 py-2.5 text-[#1A1A1A] outline-none focus:border-[#1A1A1A]"
        />
        {error && <p className="mt-3 text-sm text-[#E8264B]">Incorrect password.</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded bg-[#1A1A1A] px-4 py-2.5 text-white transition hover:bg-[#333]"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
