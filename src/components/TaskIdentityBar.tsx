import type { ReactNode } from "react";
import { COLORS } from "@/lib/theme";

/**
 * HOMEROOM_UX_MIGRATION.md §3 — "Task identity bars are exactly 3px."
 * Semantic (crimson live/review), subject (muted subject color), or
 * accent (student/project) — the color is always the caller's, this only
 * fixes the width so every row in the app draws the same rule.
 */
export function TaskIdentityBar({ color }: { color: string }) {
  return <div aria-hidden style={{ width: 3, alignSelf: "stretch", background: color, flexShrink: 0 }} />;
}

/**
 * A hairline-separated expansion beneath a row — the student's read-only
 * detail popup and the parent's compact inline editor both mount their
 * content in here rather than each drawing their own top border/padding.
 */
export function InlineDetailsPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border-t pt-2 pb-1 ${className}`} style={{ borderColor: COLORS.hairline }}>
      {children}
    </div>
  );
}
