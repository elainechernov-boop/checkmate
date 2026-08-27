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
      <BrandHeader align="center" wordmarkWidth={150} wordmarkHeight={32} />
      <form action={submitFamilyPassword} className="w-[280px] max-w-[calc(100vw-32px)]">
        <input type="hidden" name="from" value={from ?? "/"} />
        <label
          htmlFor="password"
          className="mt-7 block text-center font-medium uppercase"
          style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.08em" }}
        >
          Family password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoFocus
          required
          className="hr-flat-input text-center"
          style={{ minHeight: 44 }}
        />
        {error && (
          <p className="mt-3 text-center" style={{ color: COLORS.crimson, fontSize: 11 }}>
            Incorrect password.
          </p>
        )}
        <button
          type="submit"
          className="hr-text-action mt-4 block w-full text-center"
          style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}
        >
          Enter →
        </button>
      </form>
    </AppShell>
  );
}
