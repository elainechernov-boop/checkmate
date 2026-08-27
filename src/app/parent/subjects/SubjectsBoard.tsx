"use client";

import { useState } from "react";
import type { Subject } from "@/generated/prisma/client";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { COLORS } from "@/lib/theme";
import { InlineEntry, TextAction } from "@/components/FlatField";
import {
  createSubjectAction,
  deleteSubjectAction,
  updateSubjectCategoryAction,
  updateSubjectFaithIntegratedAction,
  updateSubjectNameAction,
} from "./actions";

const CATEGORY_OPTIONS = Object.values(WorkSampleCategory);

/** HOMEROOM_UX_MIGRATION.md §5.8 — a plain row per subject; the select/
 * checkbox only appear while that row is being edited, not permanently. */
export function SubjectsBoard({ subjects }: { subjects: Subject[] }) {
  return (
    <div className="mt-6 max-w-xl">
      {subjects.map((subject) => (
        <SubjectRow key={subject.id} subject={subject} />
      ))}
      <NewSubjectRow />
    </div>
  );
}

function SubjectRow({ subject }: { subject: Subject }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== subject.name) void updateSubjectNameAction(subject.id, trimmed);
    else setName(subject.name);
  }

  return (
    <div className="border-b py-3" style={{ borderColor: COLORS.hairline, fontSize: 13 }}>
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              commitName();
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
                setEditing(false);
              } else if (event.key === "Escape") {
                setName(subject.name);
                setEditing(false);
              }
            }}
            className="hr-flat-input w-40"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="w-40 truncate text-left" style={{ color: COLORS.text }}>
            {subject.name}
          </button>
        )}

        {editing ? (
          <>
            <select
              defaultValue={subject.workSampleCategory}
              onChange={(event) => void updateSubjectCategoryAction(subject.id, event.target.value)}
              className="hr-flat-input"
              style={{ width: "auto" }}
              aria-label="Report category"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5" style={{ color: COLORS.text }}>
              <input
                type="checkbox"
                defaultChecked={subject.isFaithIntegrated}
                onChange={(event) => void updateSubjectFaithIntegratedAction(subject.id, event.target.checked)}
              />
              Faith-integrated
            </label>
          </>
        ) : (
          <span style={{ color: COLORS.muted, fontSize: 12 }}>
            {subject.workSampleCategory}
            {subject.isFaithIntegrated ? " · faith-integrated" : ""}
          </span>
        )}

        {confirmingDelete ? (
          <span className="ml-auto flex items-center gap-2">
            <span style={{ color: COLORS.muted }}>Delete subject?</span>
            <TextAction onClick={() => deleteSubjectAction(subject.id)} style={{ color: COLORS.crimson, fontWeight: 600 }}>
              Delete
            </TextAction>
            <TextAction onClick={() => setConfirmingDelete(false)} style={{ color: COLORS.muted }}>
              Cancel
            </TextAction>
          </span>
        ) : (
          <TextAction
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${subject.name}`}
            className="hr-hover-action ml-auto"
            style={{ color: COLORS.mutedFaint }}
          >
            Delete
          </TextAction>
        )}
      </div>
    </div>
  );
}

function NewSubjectRow() {
  return (
    <InlineEntry
      placeholder="Name, press Enter"
      onSubmit={(name) => createSubjectAction(name)}
      className="mt-3 max-w-xs"
    />
  );
}
