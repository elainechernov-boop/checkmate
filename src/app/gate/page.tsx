import { submitFamilyPassword } from "./actions";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { COLORS } from "@/lib/theme";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <AppShell center>
      <BrandHeader align="center" wordmarkWidth={160} wordmarkHeight={34} />
      <form action={submitFamilyPassword} className="mt-8 w-full max-w-xs">
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
          className="hr-flat-input py-2 text-center"
        />
        {error && (
          <p className="mt-3 text-center text-sm" style={{ color: COLORS.crimson }}>
            Incorrect password.
          </p>
        )}
        <button type="submit" className="hr-text-action mt-4 block w-full text-center" style={{ color: COLORS.text }}>
          Enter →
        </button>
      </form>
    </AppShell>
  );
}
