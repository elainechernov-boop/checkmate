"use client";

import { useState, type FormEvent } from "react";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import { createProjectAction } from "./projectActions";

/** "+ New project" (§7) — name and an optional target date, the whole form. */
export function NewProjectModal({
  studentId,
  open,
  onClose,
  prefersReducedMotion,
}: {
  studentId: string;
  open: boolean;
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createProjectAction(studentId, name, targetDate || null);
      setName("");
      setTargetDate("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New project" prefersReducedMotion={prefersReducedMotion}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
        <div>
          <label className="block text-xs font-medium" style={{ color: COLORS.muted }}>
            Name
          </label>
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Learn Clair de Lune"
            className="mt-1 w-full rounded border px-3 py-2"
            style={{ borderColor: COLORS.hairline }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: COLORS.muted }}>
            Target date (optional)
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            style={{ borderColor: COLORS.hairline }}
          />
        </div>
        {error && (
          <p className="text-xs" style={{ color: COLORS.amber }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded px-4 py-2.5 text-white"
          style={{ background: COLORS.text }}
        >
          {saving ? "Creating…" : "Create project"}
        </button>
      </form>
    </Modal>
  );
}
