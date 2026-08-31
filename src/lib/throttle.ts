// App Router's revalidatePath() re-runs the whole Server Component function
// on every mutation, not just on a fresh page visit — so a single checkbox
// toggle was re-running expensive, genuinely idempotent "catch up" work
// (extendAllMaterializationHorizons, rollOverdueInstances) that only ever
// needs to happen roughly once as real time passes, not once per click.
// This throttles that class of work to at most once per interval, per
// process — safe because Railway runs this app as a single instance, and
// harmless to skip for a few seconds since the very next call (this
// family's own next page load) picks up right where the last one left off.
const lastRunAt = new Map<string, number>();

export function shouldRunNow(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = lastRunAt.get(key);
  if (last !== undefined && now - last < minIntervalMs) return false;
  lastRunAt.set(key, now);
  return true;
}
