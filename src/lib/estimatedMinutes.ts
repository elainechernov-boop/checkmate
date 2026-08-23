/** A day's estimated-minutes total, formatted for display (e.g. "1h 30m",
 * "45 min") — shared between Parent Mode's day cells and the student
 * view's own day columns, where showing it lets a long-looking list of
 * small items read as the modest total workload it actually is (§6/§9). */
export function formatTotalMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
