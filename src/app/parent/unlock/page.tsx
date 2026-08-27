import { submitParentPasscode } from "./actions";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { COLORS } from "@/lib/theme";

export default async function ParentUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AppShell center>
      <BrandHeader align="center" wordmarkWidth={160} wordmarkHeight={34} />
      <p className="mt-2 text-xs uppercase tracking-wide" style={{ color: COLORS.muted }}>
        Parent Mode
      </p>
      <form action={submitParentPasscode} className="mt-6 w-full max-w-xs">
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
          className="hr-flat-input py-2 text-center"
        />
        {error && (
          <p className="mt-3 text-center text-sm" style={{ color: COLORS.crimson }}>
            Incorrect passcode.
          </p>
        )}
        <button type="submit" className="hr-text-action mt-4 block w-full text-center" style={{ color: COLORS.text }}>
          Unlock →
        </button>
      </form>
    </AppShell>
  );
}
