"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { COLORS } from "@/lib/theme";

/**
 * §5 step 2's "directly on the kids' machine via a passcode popover on the
 * pending item (one tap, passcode, done)." A real small anchored popover
 * (design_handoff_homeroom_redesign/README.md §4) — not a full-screen
 * `Modal` backdrop dialog despite the old name — positioned under the 🔑
 * button that renders it, no shadow/backdrop, closes on click-outside or
 * Escape (same convention as ParentNavMenu/UndoMenu's own dropdowns).
 * `onSubmit` does the actual approve; this component only owns the
 * passcode field and its error state.
 */
export function ApprovalPasscodePopover({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (passcode: string) => Promise<void>;
  prefersReducedMotion: boolean;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    setError(null);
    try {
      await onSubmit(passcode);
      setPasscode("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={ref}
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-full z-20 mt-1 w-40 border bg-white p-2"
      style={{ borderColor: COLORS.hairline }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <input
          type="password"
          autoFocus
          required
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          placeholder="Passcode"
          className="border-b bg-transparent px-0 py-1 text-sm outline-none"
          style={{ borderColor: COLORS.hairline, color: COLORS.text }}
        />
        {error && (
          <p className="text-xs" style={{ color: COLORS.crimson }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="self-start text-xs font-medium" style={{ color: COLORS.text }}>
          {pending ? "Checking…" : "Approve"}
        </button>
      </form>
    </div>
  );
}
