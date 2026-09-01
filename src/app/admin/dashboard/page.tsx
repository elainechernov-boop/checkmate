import { listFamilies } from "@/lib/family";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { PageHeading } from "@/components/ParentNav";
import { SettingsCard } from "@/components/SettingsCard";
import { COLORS } from "@/lib/theme";
import { createFamilyAction } from "./actions";

/**
 * MULTI_FAMILY_SPEC.md Phase 4 — the one screen for creating a new family
 * by hand. Deliberately minimal: no email, no self-serve signup, just the
 * fields a new family's login and Parent Mode need to work on day one. The
 * admin picks and hands the family its access code/parent passcode
 * directly (same channel as sharing SPEC.md's Safari "Add to Dock" steps).
 */
export default async function AdminDashboardPage() {
  const families = await listFamilies();

  return (
    <AppShell>
      <BrandHeader wordmarkWidth={140} wordmarkHeight={22}>
        <span style={{ color: COLORS.muted, fontSize: "0.78125rem" }}>Admin</span>
      </BrandHeader>
      <PageHeading backHref="/admin/dashboard" backLabel="Admin" title="Families" />

      <SettingsCard className="mt-6 max-w-lg">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>New family</h2>
        <form action={createFamilyAction} className="mt-3 flex flex-col gap-3 text-sm">
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              Family name
            </label>
            <input type="text" name="name" placeholder="The Smiths" required className="hr-flat-input w-full" />
          </div>
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              Access code (their family password)
            </label>
            <input type="text" name="accessCode" required className="hr-flat-input w-full" />
          </div>
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              Parent passcode
            </label>
            <input type="text" name="parentPasscode" required className="hr-flat-input w-full" />
          </div>
          <label className="flex items-center gap-1.5" style={{ color: COLORS.text }}>
            <input type="checkbox" name="complianceModuleEnabled" value="on" />
            Enable attendance &amp; HST-style reporting for this family
          </label>
          <button type="submit" className="hr-text-action mt-1 self-start font-medium" style={{ color: COLORS.text }}>
            Create family
          </button>
        </form>
      </SettingsCard>

      <SettingsCard className="mt-6 max-w-lg">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Existing families</h2>
        <div className="mt-2 flex flex-col text-sm">
          {families.map((family) => (
            <div
              key={family.id}
              className="flex items-center justify-between gap-3 border-b py-2"
              style={{ borderColor: COLORS.hairline }}
            >
              <span style={{ color: COLORS.text }}>{family.name}</span>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>
                {family.complianceModuleEnabled ? "compliance on" : "compliance off"} ·{" "}
                {family.createdAt.toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>
    </AppShell>
  );
}
