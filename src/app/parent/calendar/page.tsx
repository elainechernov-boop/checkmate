import { getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import { fetchFamilyCalendarEvents, getDismissedEvents, getFamilyCalendarSettings } from "@/lib/familyCalendar";
import { COLORS } from "@/lib/theme";
import { AppShell, BrandHeader } from "@/components/AppShell";
import { ParentNav, PageHeading } from "@/components/ParentNav";
import { SettingsCard } from "@/components/SettingsCard";
import { applyDayTypeRange, createLearningPeriod, toggleComplianceModuleAction, undismissCalendarEventAction } from "./actions";
import { FamilyCalendarCard } from "./FamilyCalendarCard";
import { LearningPeriodRow } from "./LearningPeriodRow";

const TYPE_OPTIONS: { value: SchoolDayType; label: string }[] = [
  { value: SchoolDayType.schoolDay, label: "School day" },
  { value: SchoolDayType.offDay, label: "Off day" },
  { value: SchoolDayType.fieldTrip, label: "Field trip" },
  { value: SchoolDayType.sick, label: "Sick day" },
  { value: SchoolDayType.holiday, label: "Holiday" },
];

export default async function CalendarPage() {
  const prisma = await getScopedPrisma();
  const [family, learningPeriods, familyCalendar, dismissedEvents] = await Promise.all([
    getCurrentFamily(),
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
    getFamilyCalendarSettings(prisma),
    getDismissedEvents(prisma),
  ]);

  // Recover each hidden event's title by re-fetching a wide window around
  // today — a dismissed occurrence's id is date-specific (familyCalendar.ts),
  // so this only finds ones whose date still falls in range. A dismissed key
  // that's aged out of the window still gets a "Show again" link, just with
  // a generic label instead of its real title.
  const titleByEventKey = new Map<string, string>();
  if (familyCalendar && dismissedEvents.length > 0) {
    const wideEvents = await fetchFamilyCalendarEvents(familyCalendar, addDays(new Date(), -60), addDays(new Date(), 180));
    for (const event of wideEvents) titleByEventKey.set(event.id, event.title);
  }

  return (
    <AppShell>
      <BrandHeader>
        <ParentNav showComplianceLinks={family.complianceModuleEnabled} />
      </BrandHeader>
      <PageHeading
        title="Calendar"
        description={
          family.complianceModuleEnabled
            ? "Mark a day or a whole range off for everyone at once — a trip, a school-wide holiday — and set up learning periods for the HST report. For a single kid's sick day or field trip, use the day header on their own week board instead."
            : "Mark a day or a whole range off for everyone at once — a trip, a school-wide holiday. For a single kid's sick day or field trip, use the day header on their own week board instead."
        }
      />

      <SettingsCard className="mt-6">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Mark a day or range for everyone</h2>
        <form action={applyDayTypeRange} className="mt-2 flex flex-wrap items-end gap-4 text-sm">
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              From
            </label>
            <input type="date" name="startDate" required className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              To
            </label>
            <input type="date" name="endDate" required className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
              Type
            </label>
            <select name="type" defaultValue={SchoolDayType.offDay} className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline }}>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            Apply
          </button>
        </form>
      </SettingsCard>

      <SettingsCard className="mt-6">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Family calendar</h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
          See what else is going on those days, right on the week board — paste your Google Calendar&rsquo;s secret
          iCal address (Google Calendar → Settings → that calendar → Integrate calendar → &ldquo;Secret address in
          iCal format&rdquo;). Read-only: nothing here is ever written back to it.
        </p>
        <FamilyCalendarCard familyCalendar={familyCalendar} />

        {dismissedEvents.length > 0 && (
          <div className="mt-4">
            <span className="text-xs" style={{ color: COLORS.muted }}>
              Hidden events
            </span>
            <div className="mt-1">
              {dismissedEvents.map((event) => (
                <form
                  key={event.eventKey}
                  action={undismissCalendarEventAction}
                  className="flex items-center justify-between gap-3 border-b py-1.5"
                  style={{ borderColor: COLORS.hairline, fontSize: 12 }}
                >
                  <input type="hidden" name="eventKey" value={event.eventKey} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.text }}>
                    {titleByEventKey.get(event.eventKey) ?? "Hidden event"}
                  </span>
                  <button type="submit" className="shrink-0" style={{ color: COLORS.cobalt, fontSize: 11 }}>
                    Show again
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard className="mt-6">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Compliance reporting</h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
          Turn this on if you report to a charter or umbrella school that wants attendance, work-sample report
          categories, learning periods, and an HST-style meeting report — it adds those sections to Subjects and this
          page, plus a Reports tab. Leave it off for a plain homeschool tracker.
        </p>
        <form action={toggleComplianceModuleAction} className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id="complianceModuleEnabled"
            name="enabled"
            value="on"
            defaultChecked={family.complianceModuleEnabled}
          />
          <label htmlFor="complianceModuleEnabled" style={{ color: COLORS.text }}>
            Enable attendance &amp; HST reporting
          </label>
          <button type="submit" className="hr-text-action ml-2 font-medium" style={{ color: COLORS.text }}>
            Save
          </button>
        </form>
      </SettingsCard>

      {family.complianceModuleEnabled && (
        <SettingsCard className="mt-6">
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>Learning periods</h2>
          <div className="mt-2">
            {learningPeriods.map((lp) => (
              <LearningPeriodRow key={lp.id} lp={lp} />
            ))}
          </div>

          <form action={createLearningPeriod} className="mt-3 flex flex-wrap items-end gap-4 border-t border-dashed pt-3 text-sm" style={{ borderColor: COLORS.dashed }}>
            <div>
              <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
                Name
              </label>
              <input type="text" name="name" placeholder="LP1" required className="hr-flat-input w-24" />
            </div>
            <div>
              <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
                Start
              </label>
              <input type="date" name="startDate" required className="hr-flat-input" />
            </div>
            <div>
              <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
                End
              </label>
              <input type="date" name="endDate" required className="hr-flat-input" />
            </div>
            <div>
              <label className="block font-medium uppercase" style={{ color: COLORS.muted, fontSize: 11, letterSpacing: "0.04em" }}>
                HST meeting (optional)
              </label>
              <input type="date" name="hstMeetingDate" className="hr-flat-input" />
            </div>
            <button type="submit" className="hr-text-action font-medium" style={{ color: COLORS.text }}>
              Add learning period
            </button>
          </form>
        </SettingsCard>
      )}
    </AppShell>
  );
}
