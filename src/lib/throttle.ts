// App Router's revalidatePath() re-runs the whole Server Component function
// on every mutation, not just on a fresh page visit — so a single checkbox
// toggle was re-running expensive, genuinely idempotent "catch up" work
// (extendAllMaterializationHorizons, rollOverdueInstances) that only ever
// needs to happen roughly once as real time passes, not once per click.
// This throttles that class of work to at most once per interval, per
// process — harmless to skip for a few seconds since the very next call (this
// family's own next page load) picks up right where the last one left off.
// The map is per process, so on a host that runs several instances (Vercel's
// serverless functions) each instance throttles on its own and the work runs
// once per instance per interval, and again whenever an instance starts fresh.
// That is safe because it's idempotent, but it is not free: the catch-up's
// reads are metered on Neon, which is why its interval is hours, not
// seconds (CATCH_UP_INTERVAL_MS in materialize.ts). If that ever isn't
// enough, move the timestamps into the database.
const lastRunAt = new Map<string, number>();

export function shouldRunNow(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = lastRunAt.get(key);
  if (last !== undefined && now - last < minIntervalMs) return false;
  lastRunAt.set(key, now);
  return true;
}
