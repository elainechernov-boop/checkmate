"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { COLORS } from "@/lib/theme";

/**
 * §5 step 2's "directly on the kids' machine via a passcode popover on the
 * pending item (one tap, passcode, done)." `onSubmit` does the actual
 * approve; this component only owns the passcode field and its error state.
 */
export function ApprovalPasscodePopover({
  open,
  onClose,
  onSubmit,
  prefersReducedMotion,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (passcode: string) => Promise<void>;
  prefersReducedMotion: boolean;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    <Modal open={open} onClose={onClose} title="Approve this work" prefersReducedMotion={prefersReducedMotion}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium" style={{ color: COLORS.muted }}>
          Parent passcode
        </label>
        <input
          type="password"
          autoFocus
          required
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="rounded border px-3 py-2 text-sm outline-none"
          style={{ borderColor: COLORS.hairline }}
        />
        {error && (
          <p className="text-xs" style={{ color: COLORS.amber }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm text-white"
          style={{ background: COLORS.text }}
        >
          {pending ? "Checking…" : "Approve"}
        </button>
      </form>
    </Modal>
  );
}
