import type { ReactNode } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const LINKS = [
  { href: "/parent", label: "This Week", key: "week", requiresComplianceModule: false },
  { href: "/parent/students", label: "Students", key: "students", requiresComplianceModule: false },
  { href: "/parent/subjects", label: "Subjects", key: "subjects", requiresComplianceModule: false },
  { href: "/parent/reports", label: "Reports", key: "reports", requiresComplianceModule: true },
] as const;

type ParentNavKey = (typeof LINKS)[number]["key"];

/**
 * HOMEROOM_UX_MIGRATION.md §5.6 "Global header/navigation" — the same
 * `This Week · Students · Subjects · Reports · ⋯` row on every Parent Mode
 * route (§11 finding #11: settings routes don't currently share this).
 * `current` renders that section as plain (non-link) text; `extra` is the
 * trailing slot for route-specific controls (Undo toast, the `⋯` menu).
 * `showComplianceLinks` (MULTI_FAMILY_SPEC.md Phase 3) hides Reports for a
 * family that hasn't turned on the Blue Ridge-style attendance/work-sample
 * module — every caller passes its own Family.complianceModuleEnabled read.
 */
export function ParentNav({
  current,
  extra,
  showComplianceLinks,
}: {
  current?: ParentNavKey;
  extra?: ReactNode;
  showComplianceLinks: boolean;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-5" style={{ fontSize: "0.78125rem" }}>
      {LINKS.filter((link) => !link.requiresComplianceModule || showComplianceLinks).map((link) =>
        link.key === current ? (
          <span key={link.key} style={{ color: COLORS.text, fontWeight: 600 }}>
            {link.label}
          </span>
        ) : (
          <Link key={link.key} href={link.href} style={{ color: COLORS.muted }} className="hover:underline">
            {link.label}
          </Link>
        )
      )}
      {extra}
    </nav>
  );
}

/**
 * Back/context link, title, and optional description — the one shared
 * heading block for every Parent Mode subpage (Students, Subjects,
 * Calendar, Reports, …) per §3's "Settings-page title: 24px, Inter 500 or
 * 600. Do not use Syncopate for page titles."
 */
export function PageHeading({
  backHref = "/parent",
  backLabel = "← This Week",
  title,
  description,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mt-7 mb-6">
      <Link href={backHref} className="text-sm hover:underline" style={{ color: COLORS.muted }}>
        {backLabel}
      </Link>
      <h1 className="mt-2" style={{ fontSize: 20, fontWeight: 600, color: COLORS.text }}>
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-2xl" style={{ color: COLORS.muted, fontSize: 12 }}>
          {description}
        </p>
      )}
    </div>
  );
}
