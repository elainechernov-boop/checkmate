"use client";

import { useRef, useState } from "react";
import { WEEKDAYS, type WeekdayCode } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { transcribeImage, parseAssignments, commitAssignments, type ConfirmedRow } from "./actions";
import type { ParsedAssignmentDraft } from "@/lib/agendaImport";

type Student = { id: string; name: string; accentColor: string };
type Subject = { id: string; name: string };

type Photo = {
  id: string;
  file: File;
  previewUrl: string;
  status: "transcribing" | "done" | "error";
  text: string;
  error?: string;
};

// One editable row in the draft review list — a superset of
// ParsedAssignmentDraft with local-only fields (id, a one-off/recurring
// mode toggle) the review UI needs but nothing downstream cares about.
type DraftRow = {
  id: string;
  title: string;
  studentId: string;
  subjectId: string;
  mode: "once" | "recurring";
  dueDate: string;
  daysOfWeek: WeekdayCode[];
  endDate: string;
};

const fieldLabel = "block font-medium uppercase tracking-wide";
const fieldLabelStyle = { fontSize: 10.5 };
const fieldInput = "mt-1 w-full border-b bg-transparent py-1.5 outline-none";
const fieldInputStyle = { fontSize: 13 };

let nextId = 0;
function makeId(): string {
  nextId += 1;
  return `row-${nextId}`;
}

function draftToRow(draft: ParsedAssignmentDraft, fallbackStudentId: string): DraftRow {
  return {
    id: makeId(),
    title: draft.title,
    studentId: draft.studentId ?? fallbackStudentId,
    subjectId: draft.subjectId ?? "",
    mode: draft.recurrence ? "recurring" : "once",
    dueDate: draft.dueDate ?? "",
    daysOfWeek: draft.recurrence?.daysOfWeek ?? [],
    endDate: draft.recurrence?.endDate ?? "",
  };
}

function blankRow(fallbackStudentId: string): DraftRow {
  return { id: makeId(), title: "", studentId: fallbackStudentId, subjectId: "", mode: "once", dueDate: "", daysOfWeek: [], endDate: "" };
}

export function PhotoImportForm({ students, subjects }: { students: Student[]; subjects: Subject[] }) {
  const [inputMode, setInputMode] = useState<"photo" | "text">("photo");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fallbackStudentId = students[0]?.id ?? "";
  const combinedText =
    inputMode === "photo"
      ? photos
          .filter((p) => p.status === "done" && p.text.trim())
          .map((p, index) => (photos.length > 1 ? `--- Photo ${index + 1} ---\n${p.text}` : p.text))
          .join("\n\n")
      : pastedText;
  const anyTranscribing = photos.some((p) => p.status === "transcribing");

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const newPhotos: Photo[] = Array.from(fileList).map((file) => ({
      id: makeId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "transcribing",
      text: "",
    }));
    setPhotos((current) => [...current, ...newPhotos]);

    await Promise.all(
      newPhotos.map(async (photo) => {
        try {
          const text = await transcribeImage(photo.file);
          setPhotos((current) => current.map((p) => (p.id === photo.id ? { ...p, status: "done", text } : p)));
        } catch (error) {
          setPhotos((current) =>
            current.map((p) =>
              p.id === photo.id ? { ...p, status: "error", error: error instanceof Error ? error.message : "Couldn't read that photo." } : p
            )
          );
        }
      })
    );
  }

  function removePhoto(id: string) {
    setPhotos((current) => current.filter((p) => p.id !== id));
  }

  function updatePhotoText(id: string, text: string) {
    setPhotos((current) => current.map((p) => (p.id === id ? { ...p, text } : p)));
  }

  async function handleParse() {
    setParseError(null);
    setParsing(true);
    try {
      const drafts = await parseAssignments(combinedText, instruction);
      if (drafts.length === 0) {
        setParseError("Didn't find any assignments in that — try adding more detail to the instruction.");
        return;
      }
      setRows(drafts.map((d) => draftToRow(d, fallbackStudentId)));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Couldn't parse that text.");
    } finally {
      setParsing(false);
    }
  }

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((current) => (current ? current.map((row) => (row.id === id ? { ...row, ...patch } : row)) : current));
  }

  function toggleRowDay(id: string, day: WeekdayCode) {
    setRows((current) =>
      current
        ? current.map((row) =>
            row.id === id
              ? { ...row, daysOfWeek: row.daysOfWeek.includes(day) ? row.daysOfWeek.filter((d) => d !== day) : [...row.daysOfWeek, day] }
              : row
          )
        : current
    );
  }

  function removeRow(id: string) {
    setRows((current) => (current ? current.filter((row) => row.id !== id) : current));
  }

  function addRow() {
    setRows((current) => [...(current ?? []), blankRow(fallbackStudentId)]);
  }

  async function handleCommit() {
    if (!rows) return;
    setCommitError(null);
    const confirmed: ConfirmedRow[] = rows
      .filter((row) => row.title.trim() && row.studentId)
      .map((row) => ({
        title: row.title.trim(),
        studentId: row.studentId,
        subjectId: row.subjectId || null,
        dueDate: row.mode === "once" ? row.dueDate || null : null,
        recurrence:
          row.mode === "recurring" && row.daysOfWeek.length > 0 && row.dueDate
            ? { daysOfWeek: row.daysOfWeek, startDate: row.dueDate, endDate: row.endDate || null }
            : null,
      }))
      .filter((row) => row.dueDate || row.recurrence);

    if (confirmed.length === 0) {
      setCommitError("Every row needs at least a title, a student, and a date.");
      return;
    }

    setCommitting(true);
    try {
      await commitAssignments(confirmed);
      // commitAssignments redirects on success; reaching here means it
      // returned without redirecting, which shouldn't happen in practice.
    } catch (error) {
      // Next.js's redirect() throws a special error it catches itself —
      // only surface this as a real failure, don't swallow the redirect.
      if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
        setCommitError(error.message);
      }
      throw error;
    } finally {
      setCommitting(false);
    }
  }

  if (rows) {
    return (
      <div className="mt-8 max-w-[720px]" style={{ color: COLORS.text }}>
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Check these over before they&rsquo;re added — nothing here is saved yet.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          {rows.map((row) => (
            <div key={row.id} className="border-t pt-4" style={{ borderColor: COLORS.hairline }}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                    className={fieldInput}
                    style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="mt-5 shrink-0"
                  style={{ color: COLORS.mutedFaint, fontSize: 12 }}
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-4">
                <div>
                  <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
                    Student
                  </label>
                  <select
                    value={row.studentId}
                    onChange={(e) => updateRow(row.id, { studentId: e.target.value })}
                    className={`${fieldInput} w-auto`}
                    style={{ borderColor: row.studentId ? COLORS.dashed : COLORS.crimson, ...fieldInputStyle }}
                  >
                    <option value="">Select…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
                    Subject
                  </label>
                  <select
                    value={row.subjectId}
                    onChange={(e) => updateRow(row.id, { subjectId: e.target.value })}
                    className={`${fieldInput} w-auto`}
                    style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
                  >
                    <option value="">No subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
                    {row.mode === "once" ? "Due date" : "Starting"}
                  </label>
                  <input
                    type="date"
                    value={row.dueDate}
                    onChange={(e) => updateRow(row.id, { dueDate: e.target.value })}
                    className={`${fieldInput} w-auto`}
                    style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
                  />
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2" style={{ fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={row.mode === "recurring"}
                  onChange={(e) => updateRow(row.id, { mode: e.target.checked ? "recurring" : "once" })}
                  style={{ accentColor: COLORS.cobalt }}
                />
                Repeats weekly
              </label>

              {row.mode === "recurring" && (
                <div className="mt-2 flex flex-wrap items-end gap-4">
                  <div className="flex gap-3">
                    {WEEKDAYS.filter((d) => d.code !== "sun").map((day) => (
                      <label key={day.code} className="flex items-center gap-1 capitalize" style={{ fontSize: 12.5 }}>
                        <input
                          type="checkbox"
                          checked={row.daysOfWeek.includes(day.code)}
                          onChange={() => toggleRowDay(row.id, day.code)}
                          style={{ accentColor: COLORS.cobalt }}
                        />
                        {day.code}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
                      Until (optional)
                    </label>
                    <input
                      type="date"
                      value={row.endDate}
                      onChange={(e) => updateRow(row.id, { endDate: e.target.value })}
                      className={`${fieldInput} w-auto`}
                      style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="mt-5 block" style={{ color: COLORS.muted, fontSize: 13 }}>
          + Add a row
        </button>

        {commitError && (
          <p className="mt-4 text-sm" style={{ color: COLORS.crimson }}>
            {commitError}
          </p>
        )}

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={handleCommit}
            disabled={committing}
            className="hr-text-action font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: COLORS.text, fontSize: 13 }}
          >
            {committing ? "Adding…" : `Add ${rows.filter((r) => r.title.trim() && r.studentId).length} assignments →`}
          </button>
          <button type="button" onClick={() => setRows(null)} style={{ color: COLORS.mutedFaint, fontSize: 13 }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-[640px]" style={{ color: COLORS.text }}>
      <div className="flex gap-4">
        {(["photo", "text"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setInputMode(mode)}
            className="uppercase"
            style={{
              fontFamily: "var(--font-syncopate)",
              fontWeight: 700,
              letterSpacing: "0.03em",
              fontSize: 13,
              color: inputMode === mode ? COLORS.cobalt : COLORS.mutedFaint,
              borderBottom: inputMode === mode ? `1px solid ${COLORS.cobalt}` : "1px solid transparent",
              paddingBottom: 2,
            }}
          >
            {mode === "photo" ? "Upload photo(s)" : "Paste text"}
          </button>
        ))}
      </div>

      {inputMode === "photo" ? (
        <div className="mt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border-b"
            style={{ borderColor: COLORS.dashed, color: COLORS.muted, fontSize: 13, paddingBottom: 2 }}
          >
            {photos.length === 0 ? "Choose photo(s)…" : "+ Add more photos…"}
          </button>

          <div className="mt-5 flex flex-col gap-5">
            {photos.map((photo) => (
              <div key={photo.id} className="flex gap-3 border-t pt-4" style={{ borderColor: COLORS.hairline }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  {photo.status === "transcribing" && (
                    <p style={{ color: COLORS.mutedFaint, fontSize: 13 }}>Reading photo…</p>
                  )}
                  {photo.status === "error" && (
                    <p style={{ color: COLORS.crimson, fontSize: 13 }}>{photo.error}</p>
                  )}
                  {photo.status === "done" && (
                    <textarea
                      value={photo.text}
                      onChange={(e) => updatePhotoText(photo.id, e.target.value)}
                      rows={4}
                      className={fieldInput}
                      style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
                    />
                  )}
                </div>
                <button type="button" onClick={() => removePhoto(photo.id)} style={{ color: COLORS.mutedFaint, fontSize: 12 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
            Agenda text
          </label>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={8}
            className={fieldInput}
            style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
            placeholder="Paste the checklist text here…"
          />
        </div>
      )}

      <div className="mt-6">
        <label className={fieldLabel} style={{ color: COLORS.muted, ...fieldLabelStyle }}>
          Instruction
        </label>
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. science work for week of 9/13, split into Tues/Thurs assignments"
          className={fieldInput}
          style={{ borderColor: COLORS.dashed, ...fieldInputStyle }}
        />
      </div>

      {parseError && (
        <p className="mt-4 text-sm" style={{ color: COLORS.crimson }}>
          {parseError}
        </p>
      )}

      <button
        type="button"
        onClick={handleParse}
        disabled={parsing || anyTranscribing || !combinedText.trim()}
        className="hr-text-action mt-6 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        style={{ color: COLORS.text, fontSize: 13 }}
      >
        {parsing ? "Parsing…" : "Parse into assignments →"}
      </button>
    </div>
  );
}
