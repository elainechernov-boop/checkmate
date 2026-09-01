import { submitAdminSecret } from "./actions";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { COLORS } from "@/lib/theme";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AppShell center>
      <BrandHeader align="center" wordmarkWidth={150} wordmarkHeight={32} />
      <p className="mt-3 text-center" style={{ color: COLORS.muted, fontSize: 11 }}>
        Admin
      </p>
      <form action={submitAdminSecret} className="w-[280px] max-w-[calc(100vw-32px)]">
        <label
          htmlFor="secret"
          className="mt-7 block text-center font-medium uppercase"
          style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.08em" }}
        >
          Admin secret
        </label>
        <input
          id="secret"
          type="password"
          name="secret"
          autoFocus
          required
          className="hr-flat-input text-center"
          style={{ minHeight: 44 }}
        />
        {error && (
          <p className="mt-3 text-center" style={{ color: COLORS.crimson, fontSize: 11 }}>
            Incorrect secret.
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
