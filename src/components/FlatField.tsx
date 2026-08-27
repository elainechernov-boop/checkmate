"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { COLORS } from "@/lib/theme";

type FlatFieldBaseProps = {
  label: string;
  className?: string;
};

/**
 * HOMEROOM_UX_MIGRATION.md §3 — label plus a transparent, bottom-rule
 * input (`.hr-flat-input` in globals.css). "Inputs are transparent with a
 * bottom hairline or dashed line. Avoid rectangular input boxes except
 * password fields and true error/confirmation surfaces."
 */
export function FlatField({
  label,
  className = "",
  children,
  ...inputProps
}: FlatFieldBaseProps & InputHTMLAttributes<HTMLInputElement> & { children?: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10.5px] uppercase tracking-[0.08em]" style={{ color: COLORS.muted }}>
        {label}
      </span>
      {children ?? <input className="hr-flat-input" {...inputProps} />}
    </label>
  );
}

/**
 * The permanent "Type here, press Enter" line used on every parent day
 * column, the students/subjects/projects "add" rows, etc. §4 "Adding":
 * Enter creates, Escape clears, blur does not create, and focus stays in
 * the field after a successful creation so several entries can be made in
 * a row without re-clicking.
 */
export function InlineEntry({
  placeholder,
  onSubmit,
  disabled,
  className = "",
}: {
  placeholder: string;
  onSubmit: (value: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <input
      className={`hr-flat-input ${className}`}
      placeholder={placeholder}
      value={value}
      disabled={disabled || pending}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={async (event) => {
        if (event.key === "Escape") {
          setValue("");
          (event.target as HTMLInputElement).blur();
          return;
        }
        if (event.key !== "Enter") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        setPending(true);
        try {
          await onSubmit(trimmed);
          setValue("");
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

/**
 * An unboxed text button — every "×", "Approve", "More options →", quiet
 * divider/undo control, etc. Resets button chrome via `.hr-text-action`
 * (globals.css) and standardizes the focus-visible ring; color/weight
 * stays with the caller since it carries semantic meaning (crimson for
 * destructive, muted for quiet, accent for identity).
 */
export function TextAction({
  children,
  className = "",
  ...buttonProps
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`hr-text-action ${className}`} {...buttonProps}>
      {children}
    </button>
  );
}
