"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const LINKS = [
  { href: "/parent/projects", label: "+ New project" },
  { href: "/parent/assignments/new", label: "+ New assignment" },
  { href: "/parent/calendar", label: "Calendar settings" },
  { href: "/parent/unlock", label: "Change passcode gate" },
];

/** The redesign's plain nav row (README §2 "This Week · Students · Subjects
 * · Reports · a muted '⋯' for the rest") — Students/Subjects/Reports moved
 * out to their own top-level links in page.tsx's header; this "⋯" now
 * holds only what's left: the two "new" flows and the admin-y corners
 * (calendar-import settings, the passcode gate) that don't need their own
 * permanent spot in the row. */
export function ParentNavMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="More"
        aria-expanded={open}
        className="px-1"
        style={{ color: COLORS.mutedFaint }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-2 w-48 whitespace-nowrap border py-1"
          style={{ borderColor: COLORS.hairline, background: COLORS.background }}
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm hover:underline"
              style={{ color: COLORS.muted }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
