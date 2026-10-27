// App Router's revalidatePath() re-runs the whole Server Component function
// on every mutation, not just on a fresh page visit — so a single checkbox
// toggle was re-running expensive, genuinely idempotent "catch up" work
// (extendAllMaterializationHorizons, rollOverdueInstances) that only ever
// needs to happen roughly once as real time passes, not once per click.
// This throttles that class of work to at most once per interval, per
// process — harmless to skip for a few seconds since the very next call (this
// family's own next page load) picks up right where the last one left off.
// The map is per process, so on a host that runs several instances (Vercel's
// serverless functions) each instance throttles on its own and the work just
// runs a little more often. That's fine because it's idempotent; if the
// extra database load ever matters, move the timestamps into the database.
const lastRunAt = new Map<string, number>();

export function shouldRunNow(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = lastRunAt.get(key);
  if (last !== undefined && now - last < minIntervalMs) return false;
  lastRunAt.set(key, now);
  return true;
}
