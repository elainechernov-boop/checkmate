import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { addDays, toISODate } from "@/lib/dates";
import { fetchFamilyCalendarEvents, getDismissedEvents, getFamilyCalendarSettings } from "@/lib/familyCalendar";
import { COLORS } from "@/lib/theme";
import {
  applyDayTypeRange,
  createLearningPeriod,
  deleteLearningPeriod,
  removeFamilyCalendarSettings,
  saveFamilyCalendarSettings,
  undismissCalendarEventAction,
  updateLearningPeriod,
} from "./actions";

const TYPE_OPTIONS: { value: SchoolDayType; label: string }[] = [
  { value: SchoolDayType.schoolDay, label: "School day" },
  { value: SchoolDayType.offDay, label: "Off day" },
  { value: SchoolDayType.fieldTrip, label: "Field trip" },
  { value: SchoolDayType.sick, label: "Sick day" },
  { value: SchoolDayType.holiday, label: "Holiday" },
];

const TIME_ZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "UTC", label: "UTC" },
];

export default async function CalendarPage() {
  const [learningPeriods, familyCalendar, dismissedEvents] = await Promise.all([
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

  const cardStyle = { background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.06)" };

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10 lg:py-12" style={{ background: COLORS.background, color: COLORS.text }}>
      <Link href="/parent" className="text-sm hover:underline" style={{ color: COLORS.muted }}>
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Calendar</h1>
      <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
        Mark a day or a whole range off for everyone at once — a trip, a school-wide holiday — and set up learning
        periods for the HST report. For a single kid&rsquo;s sick day or field trip, use the day header on their own
        week board instead.
      </p>

      <section className="mt-8 rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold">Mark a day or range for everyone</h2>
        <form action={applyDayTypeRange} className="mt-2 flex flex-wrap items-end gap-4 text-sm">
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              From
            </label>
            <input type="date" name="startDate" required className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              To
            </label>
            <input type="date" name="endDate" required className="border-b bg-transparent py-1.5 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
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
      </section>

      <section className="mt-6 rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold">Family calendar</h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
          See what else is going on those days, right on the week board — paste your Google Calendar&rsquo;s secret
          iCal address (Google Calendar → Settings → that calendar → Integrate calendar → &ldquo;Secret address in
          iCal format&rdquo;). Read-only: nothing here is ever written back to it.
        </p>
        <form action={saveFamilyCalendarSettings} className="mt-3 flex flex-wrap items-end gap-4 text-sm">
          <div className="min-w-0 flex-1">
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Secret iCal address
            </label>
            <input
              type="url"
              name="icsUrl"
              required
              defaultValue={familyCalendar?.icsUrl ?? ""}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="w-full min-w-64 border-b bg-transparent py-1.5 outline-none"
              style={{ borderColor: COLORS.hairline }}
            />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Timezone
            </label>
            <select
              name="timeZone"
              defaultValue={familyCalendar?.timeZone ?? "America/Los_Angeles"}
              className="border-b bg-transparent py-1.5 outline-none"
              style={{ borderColor: COLORS.hairline }}
            >
              {TIME_ZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            {familyCalendar ? "Save" : "Connect"}
          </button>
          {familyCalendar && (
            <button type="submit" formAction={removeFamilyCalendarSettings} style={{ color: COLORS.crimson }}>
              Remove
            </button>
          )}
        </form>

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
                  className="flex items-center justify-between gap-3 border-b py-1.5 text-sm"
                  style={{ borderColor: COLORS.hairline }}
                >
                  <input type="hidden" name="eventKey" value={event.eventKey} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.text }}>
                    {titleByEventKey.get(event.eventKey) ?? "Hidden event"}
                  </span>
                  <button type="submit" className="shrink-0 text-xs" style={{ color: COLORS.cobalt }}>
                    Show again
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold">Learning periods</h2>
        <div className="mt-2">
          {learningPeriods.map((lp) => (
            <form
              key={lp.id}
              action={updateLearningPeriod}
              className="flex flex-wrap items-end gap-4 border-b py-3 text-sm"
              style={{ borderColor: COLORS.hairline }}
            >
              <input type="hidden" name="id" value={lp.id} />
              <div>
                <label className="block text-xs" style={{ color: COLORS.muted }}>
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={lp.name}
                  required
                  className="w-24 border-b bg-transparent py-1 outline-none"
                  style={{ borderColor: COLORS.hairline }}
                />
              </div>
              <div>
                <label className="block text-xs" style={{ color: COLORS.muted }}>
                  Start
                </label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={toISODate(lp.startDate)}
                  required
                  className="border-b bg-transparent py-1 outline-none"
                  style={{ borderColor: COLORS.hairline }}
                />
              </div>
              <div>
                <label className="block text-xs" style={{ color: COLORS.muted }}>
                  End
                </label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={toISODate(lp.endDate)}
                  required
                  className="border-b bg-transparent py-1 outline-none"
                  style={{ borderColor: COLORS.hairline }}
                />
              </div>
              <div>
                <label className="block text-xs" style={{ color: COLORS.muted }}>
                  HST meeting (optional)
                </label>
                <input
                  type="date"
                  name="hstMeetingDate"
                  defaultValue={lp.hstMeetingDate ? toISODate(lp.hstMeetingDate) : ""}
                  className="border-b bg-transparent py-1 outline-none"
                  style={{ borderColor: COLORS.hairline }}
                />
              </div>
              <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
                Save
              </button>
              <button type="submit" formAction={deleteLearningPeriod} className="ml-auto" style={{ color: COLORS.crimson }}>
                Delete
              </button>
            </form>
          ))}
        </div>

        <form action={createLearningPeriod} className="mt-3 flex flex-wrap items-end gap-4 border-t border-dashed pt-3 text-sm" style={{ borderColor: COLORS.hairline }}>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Name
            </label>
            <input type="text" name="name" placeholder="LP1" required className="w-24 border-b bg-transparent py-1 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Start
            </label>
            <input type="date" name="startDate" required className="border-b bg-transparent py-1 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              End
            </label>
            <input type="date" name="endDate" required className="border-b bg-transparent py-1 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              HST meeting (optional)
            </label>
            <input type="date" name="hstMeetingDate" className="border-b bg-transparent py-1 outline-none" style={{ borderColor: COLORS.hairline }} />
          </div>
          <button type="submit" className="font-medium" style={{ color: COLORS.text }}>
            Add learning period
          </button>
        </form>
      </section>
    </main>
  );
}
