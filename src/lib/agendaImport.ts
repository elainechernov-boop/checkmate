// §13 — turning a photo or pasted block of agenda text into draft
// assignments. Two Claude calls, kept deliberately separate (transcribe,
// then parse) so a misread word can be fixed in the plain-text box before
// it ever influences how the text gets split into assignments.
import Anthropic from "@anthropic-ai/sdk";
import type { WeekdayCode } from "./dates";

const MODEL = "claude-sonnet-5";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to .env to use photo/text import.");
  }
  return new Anthropic({ apiKey });
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function transcribeAgendaImage(base64: string, mediaType: ImageMediaType): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: "Transcribe every line of legible text in this image exactly as written — day headers, bullet points, checkboxes, all of it. Preserve the original line breaks and order. Don't summarize, interpret, or reorganize anything, just transcribe. Mark anything you can't read as [illegible].",
          },
        ],
      },
    ],
  });
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text.trim() : "";
}

// A single day's occurrence (dueDate set) is the common case — one week's
// checklist becomes one row per date mentioned. `recurrence` is only for
// the rarer case where the instruction implies an ongoing weekly pattern
// beyond the one batch of dates in front of the parent right now.
export type DraftRecurrence = { daysOfWeek: WeekdayCode[]; startDate: string; endDate: string | null };

export type ParsedAssignmentDraft = {
  title: string;
  studentId: string | null;
  studentName: string;
  subjectId: string | null;
  subjectName: string | null;
  dueDate: string | null;
  recurrence: DraftRecurrence | null;
};

type RawDraft = {
  title: string;
  studentName: string;
  subjectName: string | null;
  dueDate: string | null;
  recurrence: DraftRecurrence | null;
};

export type ParseContext = {
  students: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  today: string;
};

const DRAFT_ASSIGNMENTS_TOOL = {
  name: "draft_assignments",
  description: "The list of assignments parsed from the agenda text.",
  input_schema: {
    type: "object" as const,
    properties: {
      assignments: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const, description: "Short assignment title." },
            studentName: {
              type: "string" as const,
              description: "Which student this is for. Must exactly match one of the provided student names.",
            },
            subjectName: {
              type: ["string", "null"] as const,
              description: "Must exactly match one of the provided subject names, or null if none fits.",
            },
            dueDate: {
              type: ["string", "null"] as const,
              description: "YYYY-MM-DD. Set for a single occurrence on one specific date; null when using recurrence instead.",
            },
            recurrence: {
              type: ["object", "null"] as const,
              description: "Set only when the instruction implies an ongoing weekly pattern, not just this batch of dates.",
              properties: {
                daysOfWeek: {
                  type: "array" as const,
                  items: { type: "string" as const, enum: ["mon", "tue", "wed", "thu", "fri", "sat"] },
                },
                startDate: { type: "string" as const, description: "YYYY-MM-DD" },
                endDate: { type: ["string", "null"] as const, description: "YYYY-MM-DD, or null for no end date" },
              },
              required: ["daysOfWeek", "startDate", "endDate"],
            },
          },
          required: ["title", "studentName", "subjectName", "dueDate", "recurrence"],
        },
      },
    },
    required: ["assignments"],
  },
};

function resolveDraft(raw: RawDraft, context: ParseContext): ParsedAssignmentDraft {
  const student = context.students.find((s) => s.name.toLowerCase() === raw.studentName?.toLowerCase().trim());
  const subject = raw.subjectName
    ? context.subjects.find((s) => s.name.toLowerCase() === raw.subjectName!.toLowerCase().trim())
    : undefined;
  return {
    title: raw.title,
    studentId: student?.id ?? null,
    studentName: raw.studentName,
    subjectId: subject?.id ?? null,
    subjectName: raw.subjectName,
    dueDate: raw.dueDate,
    recurrence: raw.recurrence,
  };
}

export async function parseAssignmentsFromText(
  text: string,
  instruction: string,
  context: ParseContext
): Promise<ParsedAssignmentDraft[]> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [DRAFT_ASSIGNMENTS_TOOL],
    tool_choice: { type: "tool", name: "draft_assignments" },
    messages: [
      {
        role: "user",
        content: `Today's date is ${context.today}. The family's students are: ${context.students.map((s) => s.name).join(", ")}. The family's subjects are: ${context.subjects.map((s) => s.name).join(", ")}.

Here is the transcribed/pasted agenda text:
"""
${text}
"""

The parent's instruction: "${instruction}"

Turn this into a list of homework assignments per the instruction. Use dueDate for a single occurrence on a specific calendar date — this is the common case, e.g. a week's checklist becomes one dueDate per day mentioned. Only use recurrence when the instruction clearly implies an ongoing weekly pattern beyond this one batch of dates (e.g. "every Tuesday for the rest of the semester"). Every assignment needs a studentName and either a dueDate or a recurrence, never neither.`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const input = toolUse.input as { assignments: RawDraft[] };
  return (input.assignments ?? []).map((raw) => resolveDraft(raw, context));
}
