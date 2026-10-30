import {
  type AppLanguage,
  appLanguages,
  defaultAppLanguage,
} from "@fitme/core/models";
import { createRoute, type Hook, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "hono";
import { BEARER_AUTH } from "../auth";
import {
  ErrorResponse,
  Exercise,
  ExerciseBatch,
  ExercisePage,
  ExerciseSummary,
  Language,
  MuscleGroup,
} from "../schemas";
import type { ServedLanguage, ServedLibrary } from "../served-library";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;
const MAX_SLUGS = 40;
const LIST_PARAMETERS = [
  "limit",
  "muscle_group",
  "muscle_groups",
  "offset",
  "search",
] as const;

/** Every content route answers 401 without a caller (`requireCaller`). */
const unauthorized = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "No valid Clerk session token or server secret",
};

/** A User over their limit (`rateLimitUsers`). */
const rateLimited = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "Too many requests from this User; retry after `Retry-After`",
  headers: z.object({
    "Retry-After": z.string().openapi({
      description: "Seconds until the limit resets",
      example: "30",
    }),
  }),
};

/** Optional on every content route; without it, English. */
const languageParameter = Language.optional().openapi({
  param: {
    description:
      "The App language to answer in (default `en`). An Exercise without a translation in it is answered wholly in English.",
  },
});

/** A Clerk session token or a server secret, as `Authorization: Bearer`. */
const security = [{ [BEARER_AUTH]: [] }];

const listExercises = createRoute({
  method: "get",
  path: "/exercises",
  request: {
    // limit and offset have no zod default, so a batch lookup can tell an
    // absent one from one that was sent: the list applies the defaults
    query: z
      .object({
        language: languageParameter,
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .openapi({
            default: DEFAULT_LIMIT,
            description: "Page size.",
            example: DEFAULT_LIMIT,
          }),
        muscle_group: MuscleGroup.optional().openapi({
          param: {
            description:
              "Only Exercises with this muscle group. Not combined with `muscle_groups`.",
          },
        }),
        muscle_groups: z
          .string()
          .transform((groups) => groups.split(","))
          .pipe(z.array(MuscleGroup).min(1))
          .transform((groups) => [...new Set(groups)])
          .optional()
          // the generator would describe the parsed array: the parameter is
          // the comma-separated string
          .openapi({
            description:
              "Comma-separated muscle groups: only Exercises with any of them (a repeated one counts once). Not combined with `muscle_group`.",
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
            description: "How many matches to skip.",
            example: 0,
            minimum: 0,
            type: "integer",
          }),
        search: z.string().trim().max(MAX_SEARCH).optional().openapi({
          description:
            "Case-insensitive substring of the name in `language` or of the English name, surrounding whitespace ignored; `%` and `_` match only themselves.",
          example: "bench",
        }),
        slugs: z
          .string()
          .transform((slugs) => slugs.split(","))
          .pipe(z.array(z.string().min(1)).min(1).max(MAX_SLUGS))
          .transform((slugs) => [...new Set(slugs)])
          .optional()
          // the generator would describe the parsed array: the parameter is
          // the comma-separated string
          .openapi({
            description: `Comma-separated Exercise slugs to look up instead of listing: at most ${MAX_SLUGS} (a repeated one is answered once), not combined with \`search\`, \`muscle_group\`, \`muscle_groups\`, \`limit\` or \`offset\`.`,
            example: "bench-press,squat",
            type: "string",
          }),
      })
      .superRefine((query, ctx) => {
        if (
          query.muscle_group !== undefined &&
          query.muscle_groups !== undefined
        ) {
          ctx.addIssue({
            code: "custom",
            message: "can't be combined with muscle_group",
            path: ["muscle_groups"],
          });
        }
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
        "application/json": { schema: z.union([ExercisePage, ExerciseBatch]) },
      },
      description:
        "One page of matching Exercises, alphabetical by name in `language` (`ExercisePage`), or with `slugs`, the Exercises found (`ExerciseBatch`)",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "An invalid query parameter",
    },
    401: unauthorized,
    429: rateLimited,
  },
  security,
  summary: "List Exercises, or look up a batch by Exercise slug",
});

const getExercise = createRoute({
  method: "get",
  path: "/exercises/{slug}",
  request: {
    params: z.object({
      slug: z.string().openapi({ example: "bench-press" }),
    }),
    query: z.object({ language: languageParameter }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: Exercise } },
      description: "The Exercise",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "An invalid query parameter",
    },
    401: unauthorized,
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No Exercise has this Exercise slug",
    },
    429: rateLimited,
  },
  security,
  summary: "Get one Exercise by Exercise slug",
});

/** Answers a request that fails validation with 400 in the error shape. */
const invalidRequest: Hook<unknown, Env, string, unknown> = (result, c) => {
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return c.json({ error: { code: "invalid_request", message } }, 400);
  }
};

/** What the routes look Exercises up by, in one language. */
const indexLanguage = (served: ServedLanguage) => {
  const bySlug = new Map(
    served.exercises.map((exercise) => [exercise.slug, exercise])
  );
  // parsing strips every field ExerciseSummary doesn't define
  const summaries = served.exercises.map((exercise) =>
    ExerciseSummary.parse(exercise)
  );
  const summaryBySlug = new Map(
    summaries.map((summary) => [summary.slug, summary])
  );
  return { bySlug, searchNames: served.searchNames, summaries, summaryBySlug };
};

export const exerciseRoutes = (library: ServedLibrary) => {
  const indexes = Object.fromEntries(
    appLanguages.map((language) => [
      language,
      indexLanguage(library.languages[language]),
    ])
  ) as Record<AppLanguage, ReturnType<typeof indexLanguage>>;

  return new OpenAPIHono({ defaultHook: invalidRequest })
    .openapi(listExercises, (c) => {
      const {
        language: asked = defaultAppLanguage,
        limit = DEFAULT_LIMIT,
        muscle_group,
        muscle_groups = muscle_group && [muscle_group],
        offset = 0,
        search,
        slugs,
      } = c.req.valid("query");
      const { searchNames, summaries, summaryBySlug } = indexes[asked];
      if (slugs !== undefined) {
        const data = slugs.flatMap((slug) => summaryBySlug.get(slug) ?? []);
        const missing = slugs.filter((slug) => !summaryBySlug.has(slug));
        return c.json({ data, missing }, 200);
      }
      const term = search?.toLowerCase();
      const matches = summaries.filter(
        (summary, i) =>
          (!term || searchNames[i]?.some((name) => name.includes(term))) &&
          (!muscle_groups ||
            muscle_groups.some((group) =>
              summary.muscle_groups.includes(group)
            ))
      );
      const data = matches.slice(offset, offset + limit);
      const total = matches.length;
      return c.json(
        { data, hasMore: offset + data.length < total, total },
        200
      );
    })
    .openapi(getExercise, (c) => {
      const { language: asked = defaultAppLanguage } = c.req.valid("query");
      const exercise = indexes[asked].bySlug.get(c.req.valid("param").slug);
      if (!exercise) {
        return c.json(
          { error: { code: "not_found", message: "Exercise not found" } },
          404
        );
      }
      return c.json(exercise, 200);
    });
};
