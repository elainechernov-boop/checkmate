"use client";

import { useState, type KeyboardEvent } from "react";
import { COLORS } from "@/lib/theme";
import { deleteProjectIdeaAction, addProjectIdeaAction, promoteProjectIdeaAction } from "./projectIdeaActions";
import type { ProjectIdea } from "./types";

/**
 * §7's "someday" scratch list — one level quieter than the Projects band
 * itself: a bare line of text per idea, nothing to schedule, nothing to
 * track. TeuxDeux-style capture: there's always a blank line at the bottom
 * ready to type into and hit Enter — no "+ New idea" button, no dialog. A
 * student keeps or deletes freely, or promotes one into a real Project when
 * they're actually ready to start (moving it out of this list and into the
 * band above, see promoteProjectIdeaAction).
 */
export function IdeasList({
  studentId,
  ideas,
}: {
  studentId: string;
  ideas: ProjectIdea[];
}) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    setText("");
    if (trimmed) void addProjectIdeaAction(studentId, trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      setText("");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="uppercase" style={{ color: COLORS.muted, fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em" }}>
        Someday
      </h2>

      {ideas.length === 0 && (
        <p className="mt-2 text-sm" style={{ color: COLORS.mutedFaint }}>
          Jot down anything you might want to work on someday.
        </p>
      )}

      {ideas.length > 0 && (
        <ul className="mt-2 flex max-w-sm flex-col">
          {ideas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} studentId={studentId} />
          ))}
        </ul>
      )}

      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type an idea, press Enter"
        className="mt-1 w-full max-w-sm border-b bg-transparent py-1.5 text-sm outline-none"
        style={{ borderColor: COLORS.hairline, color: COLORS.text }}
      />
    </section>
  );
}

function IdeaRow({
  idea,
  studentId,
}: {
  idea: ProjectIdea;
  studentId: string;
}) {
  const [promoting, setPromoting] = useState(false);

  async function handlePromote() {
    setPromoting(true);
    try {
      await promoteProjectIdeaAction(studentId, idea.id);
    } finally {
      setPromoting(false);
    }
  }

  function handleDelete() {
    if (window.confirm(`Delete "${idea.text}"?`)) void deleteProjectIdeaAction(studentId, idea.id);
  }

  return (
    <li
      className="group/idea flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0"
      style={{ borderColor: COLORS.hairline }}
    >
      <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.text }}>
        {idea.text}
      </span>
      <button
        type="button"
        onClick={handlePromote}
        disabled={promoting}
        className="shrink-0 text-xs hover:underline"
        style={{ color: COLORS.cobalt }}
      >
        {promoting ? "Starting…" : "→ Start project"}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete idea: ${idea.text}`}
        className="shrink-0 text-xs opacity-100 transition-opacity lg:opacity-0 lg:group-hover/idea:opacity-100"
        style={{ color: COLORS.mutedFaint }}
      >
        ×
      </button>
    </li>
  );
}
