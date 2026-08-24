"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const LINKS = [
  { href: "/parent/students", label: "Students" },
  { href: "/parent/subjects", label: "Subjects" },
  { href: "/parent/projects", label: "Projects" },
  { href: "/parent/calendar", label: "Calendar" },
  { href: "/parent/reports", label: "Reports" },
];

/** The admin-y corners of Parent Mode (calendar setup, reports…) used to sit
 * inline in the header as plain text links — fine at first, but
 * it kept growing and started wrapping onto a second line. Tucked behind
 * one "Menu" button instead, the same "⋯" pattern the student view already
 * uses for its rarely-used switch-student link; jumping to a specific
 * student's own week now happens by clicking their name wherever it
 * appears (the dashboard card, the week board header), not from here. */
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
        aria-label="Menu"
        aria-expanded={open}
        className="flex items-center gap-1 px-1 text-[#6B6B6B] hover:underline"
      >
        Menu {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-2 w-44 whitespace-nowrap rounded border py-1 shadow-sm"
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
