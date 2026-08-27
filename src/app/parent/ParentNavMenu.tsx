"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const LINKS = [
  { href: "/parent/projects", label: "New project" },
  { href: "/parent/assignments/new", label: "New assignment" },
  { href: "/parent/calendar", label: "Calendar settings" },
  // Screen 22: "Lock/switch options as appropriate" — mirrors the student
  // menu's own "Switch student" link back to the picker.
  { href: "/", label: "Switch student" },
];

/** The redesign's plain nav row (README §2 "This Week · Students · Subjects
 * · Reports · a muted '⋯' for the rest") — Students/Subjects/Reports moved
 * out to their own top-level links in page.tsx's header; this "⋯" now
 * holds only what's left: the two "new" flows and calendar-import settings,
 * which don't need their own permanent spot in the row. */
export function ParentNavMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    // §4/§6: menus close on Escape and return focus to the invoking control.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
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
              className="block px-3 py-1.5 text-[13px] hover:underline"
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
