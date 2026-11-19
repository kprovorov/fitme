import { MAX_EXERCISE_SLUG_LENGTH } from "@fitme/core/limits";
import {
  appLanguages,
  defaultAppLanguage,
  difficulties,
  equipment as equipmentList,
  movementPatterns,
  muscleGroups,
} from "@fitme/core/models";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";

import { bearerSecurity, requires } from "../auth.js";
import type { ApiEnv } from "../auth.js";
import { libraryUnavailable } from "../exercise-library.js";
import {
  errorResponse,
  invalidRequest,
  invalidRequestResponse,
  rateLimitedResponse,
  unauthorizedResponse,
} from "../schemas.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;
const MAX_SLUGS = 40;

/** Devices reuse an answer for an hour, then revalidate with its `ETag`. */
export const EXERCISES_CACHE_CONTROL = "private, max-age=3600";

/** The parameters a batch lookup (`slugs`) can't be combined with. */
const LIST_PARAMETERS = [
  "equipment",
  "limit",
  "muscle_groups",
  "offset",
  "search",
] as const;

// The new Library's lists (ADR 0022), each one named schema. `MuscleGroup` is
// the Legacy Library's, which /v1/muscle-groups still serves.
const LibraryMuscleGroup = z.enum(muscleGroups).openapi("LibraryMuscleGroup");
const Equipment = z.enum(equipmentList).openapi("Equipment");
const MovementPattern = z.enum(movementPatterns).openapi("MovementPattern");
const Difficulty = z.enum(difficulties).openapi("Difficulty");

const AppLanguage = z.enum(appLanguages).openapi("AppLanguage", {
  description: "An App language",
});

const ExerciseSummary = z
  .object({
    difficulty: Difficulty,
    equipment: z.array(Equipment).min(1).openapi({
      description:
        "The Equipment it needs, in a fixed order; `bodyweight` when the body is the load",
    }),
    movement_patterns: z.array(MovementPattern).min(1),
    muscle_groups: z
      .array(LibraryMuscleGroup)
      .min(1)
      .openapi({ description: "The primary muscle groups" }),
    name: z.string().openapi({ example: "Barbell bench press" }),
    secondary_muscle_groups: z.array(LibraryMuscleGroup),
    slug: z.string().openapi({
      description: "The Exercise slug",
      example: "barbell-bench-press",
    }),
    thumbnail_url: z.string().openapi({
      description:
        "On the image render endpoint: append `width` and `height` for the size shown",
    }),
    video_url: z.string(),
  })
  .openapi("ExerciseSummary");

const Exercise = ExerciseSummary.extend({
  benefits: z.array(z.string()),
  common_mistakes: z.array(z.string()),
  long_description: z.string(),
  short_description: z.string(),
  steps: z.array(z.string()).min(1).openapi({ description: "In order" }),
}).openapi("Exercise");

const ExerciseLookupEntry = ExerciseSummary.extend({
  requested_slug: z.string().openapi({
    description:
      "The slug it was asked for: `slug` itself, or a replaced one that resolves to this Exercise",
    example: "bench-press",
  }),
}).openapi("ExerciseLookupEntry");

const ExercisePage = z
  .object({
    data: z.array(ExerciseSummary).openapi({
      description: "The page, alphabetical by name in `language`",
    }),
    hasMore: z
      .boolean()
      .openapi({ description: "Whether more Exercises follow" }),
    total: z.int().openapi({
      description: "How many Exercises match, across every page",
    }),
  })
  .openapi("ExercisePage");

const ExerciseLookup = z
  .object({
    data: z.array(ExerciseLookupEntry).openapi({
      description: "The Exercises found, in asked order",
    }),
    missing: z.array(z.string()).openapi({
      description: "The slugs no Exercise has, in asked order",
    }),
  })
  .openapi("ExerciseLookup");

const language = AppLanguage.optional().openapi({
  param: {
    description:
      "The App language to answer in (default `en`). An Exercise without a translation in it is answered wholly in English.",
  },
});

/** A comma-separated list of `item`, each value once. */
const commaSeparated = <Value extends string>(
  item: z.ZodType<Value, string>,
  { max }: { max?: number } = {}
) => {
  const items = z.array(item).min(1);

  return z
    .string()
    .transform((value) => value.split(","))
    .pipe(max === undefined ? items : items.max(max))
    .transform((values: Value[]) => [...new Set(values)]);
};

const cacheHeaders = z.object({
  "Cache-Control": z.string().openapi({ example: EXERCISES_CACHE_CONTROL }),
  ETag: z.string().openapi({
    description:
      "The Library's content hash: send it back as `If-None-Match` to get a 304 while nothing changed",
  }),
});

const notModifiedResponse = {
  description:
    "`If-None-Match` matches the Library's `ETag`: the answer is unchanged",
  headers: cacheHeaders,
};

const libraryUnavailableResponse = errorResponse(
  "`library_unavailable`: the Library couldn't be loaded; try again"
);

const listExercisesRoute = createRoute({
  description:
    "Lists and searches the Library's Exercises, alphabetical by name in `language`, or, with `slugs`, looks a batch of them up. A slug the Library replaced answers the Exercise replacing it. Every answer may be cached for an hour and revalidated with its `ETag`.",
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  request: {
    // limit and offset have no zod default, so a batch lookup can tell an
    // absent one from one that was sent: the list applies the defaults
    query: z
      .object({
        equipment: commaSeparated(Equipment)
          .optional()
          // the generator would describe the parsed array: the parameter is
          // the comma-separated string
          .openapi({
            description:
              "Comma-separated Equipment: only Exercises that need any of it (a repeated one counts once)",
            example: "dumbbell,bench",
            type: "string",
          }),
        language,
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .openapi({
            default: DEFAULT_LIMIT,
            description: "Page size",
            example: DEFAULT_LIMIT,
          }),
        muscle_groups: commaSeparated(LibraryMuscleGroup).optional().openapi({
          description:
            "Comma-separated muscle groups: only Exercises with any of them as a primary muscle group (a repeated one counts once)",
          example: "chest,triceps",
          type: "string",
        }),
        offset: z.coerce
          .number()
          .int()
          .min(0)
          .optional()
          // coercion turns null into 0, which the generator reads as nullable:
          // a query parameter is never null, so the type is given explicitly
          .openapi({
            default: 0,
            description: "How many matches to skip",
            example: 0,
            minimum: 0,
            type: "integer",
          }),
        search: z.string().trim().max(MAX_SEARCH).optional().openapi({
          description:
            "Case-insensitive substring of the name in `language`, of the English name or of one of its other names, surrounding whitespace ignored",
          example: "bench",
        }),
        slugs: commaSeparated(z.string().min(1).max(MAX_EXERCISE_SLUG_LENGTH), {
          max: MAX_SLUGS,
        })
          .optional()
          .openapi({
            description: `Comma-separated Exercise slugs to look up instead of listing: at most ${MAX_SLUGS} (a repeated one is answered once), not combined with \`search\`, \`muscle_groups\`, \`equipment\`, \`limit\` or \`offset\``,
            example: "barbell-bench-press,barbell-back-squat",
            type: "string",
          }),
      })
      .superRefine((query, ctx) => {
        if (query.slugs === undefined) {
          return;
        }

        for (const name of LIST_PARAMETERS) {
          if (query[name] !== undefined) {
            ctx.addIssue({
              code: "custom",
              message: "can't be combined with slugs",
              path: [name],
            });
          }
        }
      }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.union([ExercisePage, ExerciseLookup]),
        },
      },
      description:
        "One page of matching Exercises (`ExercisePage`; an offset past the end is an empty page), or with `slugs`, the Exercises found (`ExerciseLookup`)",
      headers: cacheHeaders,
    },
    304: notModifiedResponse,
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    429: rateLimitedResponse,
    503: libraryUnavailableResponse,
  },
  security: bearerSecurity,
  summary: "List Exercises, or look up a batch by Exercise slug",
});

const getExerciseRoute = createRoute({
  description:
    "One Exercise in full. A slug the Library replaced answers the Exercise replacing it (its own `slug`). May be cached for an hour and revalidated with its `ETag`.",
  method: "get",
  middleware: [requires("read")] as const,
  path: "/{slug}",
  request: {
    params: z.object({
      slug: z
        .string()
        .min(1)
        .max(MAX_EXERCISE_SLUG_LENGTH)
        .openapi({ example: "barbell-bench-press" }),
    }),
    query: z.object({ language }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: Exercise }) } },
      description: "The Exercise",
      headers: cacheHeaders,
    },
    304: notModifiedResponse,
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: errorResponse("`not_found`: no Exercise has this Exercise slug"),
    429: rateLimitedResponse,
    503: libraryUnavailableResponse,
  },
  security: bearerSecurity,
  summary: "Get one Exercise by Exercise slug",
});

const WEAK_PREFIX = /^W\//u;

/** Whether an `If-None-Match` header lists `etag` (weak comparison) or is `*`. */
const matchesEtag = (ifNoneMatch: string | undefined, etag: string) =>
  ifNoneMatch
    ?.split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag.replace(WEAK_PREFIX, "") === etag) ??
  false;

/**
 * The cache headers of an answer from the Library whose hash is `hash`, and
 * whether the request already holds it (a 304 then).
 */
const deviceCache = (c: Context<ApiEnv>, hash: string) => {
  const etag = `"${hash}"`;

  return {
    headers: { "Cache-Control": EXERCISES_CACHE_CONTROL, ETag: etag },
    notModified: matchesEtag(c.req.header("If-None-Match"), etag),
  };
};

export const exercises = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(listExercisesRoute, async (c) => {
    const answer = await c.var.exerciseLibrary.get();

    // its load was reported by the Library itself
    if (answer.status === "unavailable") {
      return c.json(libraryUnavailable, 503);
    }

    const { library } = answer;
    const { headers, notModified } = deviceCache(c, library.hash);

    if (notModified) {
      return c.body(null, 304, headers);
    }

    const {
      equipment,
      language: asked = defaultAppLanguage,
      limit = DEFAULT_LIMIT,
      muscle_groups: muscleGroupsAsked,
      offset = 0,
      search,
      slugs,
    } = c.req.valid("query");

    // Parsed through the contract, so a field the Library adds later never
    // goes out unannounced.
    if (slugs !== undefined) {
      return c.json(
        ExerciseLookup.parse(library.lookup(slugs, { language: asked })),
        200,
        headers
      );
    }

    return c.json(
      ExercisePage.parse(
        library.list({
          equipment,
          language: asked,
          limit,
          muscleGroups: muscleGroupsAsked,
          offset,
          search,
        })
      ),
      200,
      headers
    );
  })
  .openapi(getExerciseRoute, async (c) => {
    const answer = await c.var.exerciseLibrary.get();

    if (answer.status === "unavailable") {
      return c.json(libraryUnavailable, 503);
    }

    const { language: asked = defaultAppLanguage } = c.req.valid("query");

    const exercise = answer.library.get(c.req.valid("param").slug, {
      language: asked,
    });

    if (!exercise) {
      return c.json(
        { error: { code: "not_found", message: "Exercise not found" } },
        404
      );
    }

    const { headers, notModified } = deviceCache(c, answer.library.hash);

    if (notModified) {
      return c.body(null, 304, headers);
    }

    return c.json({ data: Exercise.parse(exercise) }, 200, headers);
  });
