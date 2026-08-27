import type { ReactNode } from "react";
import Image from "next/image";
import { COLORS } from "@/lib/theme";

/**
 * HOMEROOM_UX_MIGRATION.md §3 "Shared primitives to create" — cream
 * background, centered max width (desktop content tops out at 1440px),
 * responsive padding (~40px desktop, 16px phone). Every top-level route
 * (student and parent) renders inside this instead of repeating the same
 * `min-h-screen` + padding + background inline style at each call site.
 */
export function AppShell({
  children,
  className = "",
  center = false,
}: {
  children: ReactNode;
  className?: string;
  /** Gate/picker-style pages: content centered on the full viewport rather
   * than a top-aligned, max-width column. */
  center?: boolean;
}) {
  if (center) {
    return (
      <main
        className={`flex min-h-screen flex-col items-center justify-center px-6 ${className}`}
        style={{ background: COLORS.background, color: COLORS.text }}
      >
        {children}
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-4 py-6 lg:px-[30px] lg:py-12 ${className}`}
      style={{ background: COLORS.background, color: COLORS.text }}
    >
      <div className="mx-auto max-w-[1440px]">{children}</div>
    </main>
  );
}

/**
 * Wordmark plus optional right-side navigation/actions — shared between
 * the student picker (centered, no nav) and every Parent Mode route
 * (left-aligned, `ParentNav` on the right). Height and alignment are the
 * only things that differ per §5's screen specs, so callers control those
 * with `wordmarkHeight`/`align`.
 */
export function BrandHeader({
  align = "left",
  wordmarkWidth = 140,
  wordmarkHeight = 22,
  children,
  className = "",
}: {
  align?: "left" | "center";
  wordmarkWidth?: number;
  wordmarkHeight?: number;
  children?: ReactNode;
  className?: string;
}) {
  if (align === "center") {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <Image
          src="/homeroom-wordmark.svg"
          alt="homeroom"
          width={wordmarkWidth}
          height={wordmarkHeight}
          style={{ height: wordmarkHeight, width: "auto" }}
          priority
        />
        {children}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b pb-2.5 ${className}`}
      style={{ borderColor: COLORS.hairline }}
    >
      <Image
        src="/homeroom-wordmark.svg"
        alt="homeroom"
        width={wordmarkWidth}
        height={wordmarkHeight}
        style={{ height: wordmarkHeight, width: "auto" }}
        priority
      />
      {children}
    </div>
  );
}
