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
      <BrandHeader align="center" wordmarkWidth={150} wordmarkHeight={32} />
      <p
        className="mt-7 text-center font-medium uppercase"
        style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.08em" }}
      >
        Parent Mode
      </p>
      <form action={submitParentPasscode} className="w-[280px] max-w-[calc(100vw-32px)]">
        <label
          htmlFor="passcode"
          className="mt-4 block text-center font-medium uppercase"
          style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.08em" }}
        >
          Passcode
        </label>
        <input
          id="passcode"
          type="password"
          name="passcode"
          autoFocus
          required
          className="hr-flat-input text-center"
          style={{ minHeight: 44 }}
        />
        {error && (
          <p className="mt-3 text-center" style={{ color: COLORS.crimson, fontSize: 11 }}>
            Incorrect passcode.
          </p>
        )}
        <button
          type="submit"
          className="hr-text-action mt-4 block w-full text-center"
          style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}
        >
          Unlock →
        </button>
      </form>
    </AppShell>
  );
}
