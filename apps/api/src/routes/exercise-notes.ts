import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { cleanNote } from "@fitme/core/notes";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { bearerSecurity, requires } from "../auth.js";
import type { ApiEnv } from "../auth.js";
import { checkExerciseSlugs, slugRefusal } from "../library.js";
import {
  ExerciseSlug,
  errorResponse,
  invalidRequest,
  rateLimitedResponse,
  timestamp,
  unauthorizedResponse,
} from "../schemas.js";

/**
 * Why a note's text was refused, never quoting it: a Note is private, and a
 * refusal's message can end up in a client's logs.
 */
const REFUSALS = {
  nul: "must not contain a NUL character",
  too_long: `must be at most ${MAX_NOTE_LENGTH} characters once trimmed`,
} as const;

const ExerciseNote = z
  .object({
    exercise_slug: z.string().openapi({
      description: "The Exercise slug the note is on, as it was saved",
      example: "leg-press",
    }),
    note: z.string().openapi({
      description: "The note's text: trimmed, never empty, line breaks kept",
      example: "Seat on hole 4, feet high",
    }),
    updated_at: timestamp("When the note was last changed"),
  })
  .openapi("ExerciseNote", {
    description:
      "The User's note on one Exercise (a Note): one per Exercise, the same in every Plan and Workout",
  });

const ExerciseNoteList = z.object({
  data: z.array(ExerciseNote).openapi({
    description: "Every Exercise note of the User, by Exercise slug",
  }),
});

const SavedExerciseNote = z.object({
  data: z
    .object({
      exercise_slug: z.string().openapi({
        description:
          "The Exercise slug the note is kept under: the one sent, or for a slug the Library replaced, its replacement",
        example: "leg-press",
      }),
      note: z.string().nullable().openapi({
        description:
          "The note as saved: trimmed, line breaks kept; `null` once cleared",
        example: "Seat on hole 4, feet high",
      }),
      updated_at: timestamp("When the note was last changed")
        .nullable()
        .openapi({ description: "`null` once cleared" }),
    })
    .openapi("SavedExerciseNote"),
});

const NoteText = z
  .string()
  .superRefine((text, context) => {
    const cleaned = cleanNote(text);

    if (!cleaned.ok) {
      context.addIssue({ code: "custom", message: REFUSALS[cleaned.reason] });
    }
  })
  .openapi({
    description: `The note's text, trimmed at both ends (line breaks inside kept), at most ${MAX_NOTE_LENGTH} characters once trimmed and no NUL character. Empty or whitespace-only text clears the note`,
    example: "Seat on hole 4, feet high",
  });

const listExerciseNotesRoute = createRoute({
  description:
    "Every Exercise note of the User, by Exercise slug, unpaged (at most one per Exercise). A note is private: only the User reads it.",
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: ExerciseNoteList } },
      description: "The User's Exercise notes; empty without any",
    },
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "List Exercise notes",
});

const setExerciseNoteRoute = createRoute({
  description:
    "Sets the User's note on one Exercise to `note`, trimmed; empty or whitespace-only text clears it. Saving text checks the Exercise slug against the Library first (a slug the Library replaced is accepted, and the note kept under its replacement); clearing doesn't, so a note on an Exercise that left the Library can always be cleared. The last save wins, and a repeat answers the same.",
  method: "put",
  middleware: [requires("write")] as const,
  path: "/{slug}",
  request: {
    body: {
      content: {
        "application/json": { schema: z.strictObject({ note: NoteText }) },
      },
      required: true,
    },
    params: z.object({ slug: ExerciseSlug }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: SavedExerciseNote } },
      description: "The Exercise note as saved",
    },
    400: errorResponse(
      "`invalid_request`: the input fails its schema; `unknown_exercises`: the Library has no Exercise with this slug. Nothing was written"
    ),
    401: unauthorizedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`library_unavailable`: the Library couldn't be read to check the Exercise; nothing was written, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Set an Exercise note",
});

export const exerciseNotes = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(listExerciseNotesRoute, async (c) => {
    const notes = await c.var.getServices().listExerciseNotes();

    // Parsed through the contract, so fields beyond it never go out.
    return c.json(ExerciseNoteList.parse({ data: notes }), 200);
  })
  .openapi(setExerciseNoteRoute, async (c) => {
    const { slug } = c.req.valid("param");
    const { note } = c.req.valid("json");

    const cleaned = cleanNote(note);

    // A note is kept under the Exercise's current slug: an old one the
    // Library replaced is saved under its replacement, so one Exercise never
    // holds two notes. A clear is taken as sent, unchecked, so a note on an
    // Exercise that left the Library can always be cleared.
    let exerciseSlug = slug;

    if (!(cleaned.ok && cleaned.note === null)) {
      const check = await checkExerciseSlugs({
        library: c.var.exerciseLibrary,
        slugs: [slug],
      });

      const refusal = slugRefusal(check);

      if (refusal) {
        return c.json(refusal.body, refusal.status);
      }

      exerciseSlug =
        check.status === "known"
          ? (check.exercises[0]?.exercise_slug ?? slug)
          : slug;
    }

    const result = await c.var
      .getServices()
      .setExerciseNote({ exerciseSlug, note });

    // The schema ran the same rule, so this only guards against the two
    // drifting apart; the message still never quotes the text.
    if (result.status === "invalid") {
      return c.json(
        {
          error: {
            code: "invalid_request",
            message: `note: ${REFUSALS[result.reason]}`,
          },
        },
        400
      );
    }

    // No expected note is sent, so a conflict means the service and this
    // route disagree: a reported 500 rather than another writer's text
    // answered as this save.
    if (result.status === "conflict") {
      throw new Error(
        "Setting an Exercise note with no expected note conflicted"
      );
    }

    return c.json(
      SavedExerciseNote.parse({
        data: {
          exercise_slug: exerciseSlug,
          note: result.note?.note ?? null,
          updated_at: result.note?.updated_at ?? null,
        },
      }),
      200
    );
  });
