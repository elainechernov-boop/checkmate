import type { ReactNode } from "react";
import { COLORS } from "@/lib/theme";

/**
 * HOMEROOM_UX_MIGRATION.md §3 — "Parent Mode's large containing cards use
 * 12px radius and `0 1px 3px rgba(0,0,0,.06)`." The one white card
 * treatment in the app (everything else sits directly on the cream
 * background) — the shared family agenda, each student's planning board,
 * and the calendar/students/subjects settings cards all use this.
 */
export function SettingsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{ background: COLORS.white, boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "18px 22px" }}
    >
      {children}
    </div>
  );
}
