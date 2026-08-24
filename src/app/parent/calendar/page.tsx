import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { toISODate } from "@/lib/dates";
import { getFamilyCalendarSettings } from "@/lib/familyCalendar";
import { COLORS } from "@/lib/theme";
import {
  applyDayTypeRange,
  createLearningPeriod,
  deleteLearningPeriod,
  removeFamilyCalendarSettings,
  saveFamilyCalendarSettings,
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
  const [learningPeriods, familyCalendar] = await Promise.all([
    prisma.learningPeriod.findMany({ orderBy: { startDate: "asc" } }),
    getFamilyCalendarSettings(prisma),
  ]);

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-6 text-[#161616] lg:px-10 lg:py-12">
      <Link href="/parent" className="text-sm text-[#6B6B6B] hover:underline">
        ← Back to week
      </Link>
      <h1 className="mt-4 text-2xl font-medium">Calendar</h1>
      <p className="mt-1 text-sm text-[#6B6B6B]">
        Mark a day or a whole range off for everyone at once — a trip, a school-wide holiday — and set up learning
        periods for the HST report. For a single kid&rsquo;s sick day or field trip, use the day header on their own
        week board instead.
      </p>

      <section className="mt-8 rounded border border-[#E1E3E6] bg-white p-4">
        <h2 className="text-sm font-medium">Mark a day or range for everyone</h2>
        <form action={applyDayTypeRange} className="mt-2 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs text-[#6B6B6B]">From</label>
            <input type="date" name="startDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">To</label>
            <input type="date" name="endDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">Type</label>
            <select name="type" defaultValue={SchoolDayType.offDay} className="rounded border border-[#E1E3E6] px-2 py-1.5">
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            Apply
          </button>
        </form>
      </section>

      <section className="mt-10 rounded border border-[#E1E3E6] bg-white p-4">
        <h2 className="text-sm font-medium">Family calendar</h2>
        <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
          See what else is going on those days, right on the week board — paste your Google Calendar&rsquo;s secret
          iCal address (Google Calendar → Settings → that calendar → Integrate calendar → &ldquo;Secret address in
          iCal format&rdquo;). Read-only: nothing here is ever written back to it.
        </p>
        <form action={saveFamilyCalendarSettings} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
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
              className="w-full min-w-64 rounded border border-[#E1E3E6] px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-xs" style={{ color: COLORS.muted }}>
              Timezone
            </label>
            <select
              name="timeZone"
              defaultValue={familyCalendar?.timeZone ?? "America/Los_Angeles"}
              className="rounded border border-[#E1E3E6] px-2 py-1.5"
            >
              {TIME_ZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            {familyCalendar ? "Save" : "Connect"}
          </button>
          {familyCalendar && (
            <button
              type="submit"
              formAction={removeFamilyCalendarSettings}
              className="rounded border border-[#E1E3E6] px-3 py-2 text-[#B5451B] hover:border-[#B5451B]"
            >
              Remove
            </button>
          )}
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
          Learning periods
        </h2>
        <div className="mt-3 space-y-3">
          {learningPeriods.map((lp) => (
            <form
              key={lp.id}
              action={updateLearningPeriod}
              className="flex flex-wrap items-end gap-3 rounded border border-[#E1E3E6] bg-white p-4 text-sm"
            >
              <input type="hidden" name="id" value={lp.id} />
              <div>
                <label className="block text-xs text-[#6B6B6B]">Name</label>
                <input type="text" name="name" defaultValue={lp.name} required className="w-28 rounded border border-[#E1E3E6] px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">Start</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={toISODate(lp.startDate)}
                  required
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">End</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={toISODate(lp.endDate)}
                  required
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B]">HST meeting (optional)</label>
                <input
                  type="date"
                  name="hstMeetingDate"
                  defaultValue={lp.hstMeetingDate ? toISODate(lp.hstMeetingDate) : ""}
                  className="rounded border border-[#E1E3E6] px-2 py-1.5"
                />
              </div>
              <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
                Save
              </button>
              <button
                type="submit"
                formAction={deleteLearningPeriod}
                className="rounded border border-[#E1E3E6] px-3 py-2 text-[#B5451B] hover:border-[#B5451B]"
              >
                Delete
              </button>
            </form>
          ))}
        </div>

        <form
          action={createLearningPeriod}
          className="mt-4 flex flex-wrap items-end gap-3 rounded border border-dashed border-[#E1E3E6] bg-white p-4 text-sm"
        >
          <div>
            <label className="block text-xs text-[#6B6B6B]">Name</label>
            <input type="text" name="name" placeholder="LP1" required className="w-28 rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">Start</label>
            <input type="date" name="startDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">End</label>
            <input type="date" name="endDate" required className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6B]">HST meeting (optional)</label>
            <input type="date" name="hstMeetingDate" className="rounded border border-[#E1E3E6] px-2 py-1.5" />
          </div>
          <button type="submit" className="rounded bg-[#161616] px-3 py-2 text-white hover:bg-[#333]">
            + Add learning period
          </button>
        </form>
      </section>
    </main>
  );
}
