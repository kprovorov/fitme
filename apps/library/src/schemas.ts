import { appLanguages, equipment, muscleGroups } from "@fitme/core/models";
import { z } from "@hono/zod-openapi";

/** The Equipment enum, one named schema wherever it appears. */
export const Equipment = z.enum(equipment).openapi("Equipment");

/** The muscle group enum, one named schema wherever it appears. */
export const MuscleGroup = z.enum(muscleGroups).openapi("MuscleGroup");

/** The App languages (`@fitme/core`) an Exercise can be asked for in. */
export const Language = z.enum(appLanguages).openapi("Language");

/**
 * The one field definition every response is built from: `ExerciseSummary`
 * (lists and batch lookups) and `Exercise` (the single lookup) share these
 * fields, so adding a field is one change here.
 */
const summaryFields = {
  equipment: z.array(Equipment).openapi({
    description:
      "Every piece of Equipment the Exercise needs, in a fixed order. Empty for an Exercise the Library hasn't tagged yet.",
  }),
  muscle_groups: z.array(MuscleGroup),
  name: z.string().openapi({ example: "Bench Press" }),
  slug: z.string().openapi({ example: "bench-press" }),
  thumbnail_url: z.url().openapi({
    description:
      "The thumbnail through Supabase's image transformation endpoint: append `width` and/or `height` query parameters.",
  }),
  video_url: z.url().openapi({ description: "The public video URL (mp4)." }),
};

const ExerciseSummarySchema = z
  .object(summaryFields)
  .openapi("ExerciseSummary");

const ExerciseSchema = z
  .object({
    ...summaryFields,
    description: z.string().openapi({ description: "Markdown." }),
    instructions: z.string().openapi({ description: "Markdown." }),
  })
  .openapi("Exercise");

const ExercisePageSchema = z
  .object({
    data: z.array(ExerciseSummarySchema),
    hasMore: z
      .boolean()
      .openapi({ description: "Whether more matches follow this page." }),
    total: z.int().openapi({
      description: "How many Exercises match, across every page.",
    }),
  })
  .openapi("ExercisePage");

const ExerciseBatchSchema = z
  .object({
    data: z.array(ExerciseSummarySchema).openapi({
      description: "The Exercises found, in the order their slugs were asked.",
    }),
    missing: z.array(z.string()).openapi({
      description: "The asked Exercise slugs no Exercise has, in asked order.",
      example: ["no-such-exercise"],
    }),
  })
  .openapi("ExerciseBatch");

/** A Cover: a photo a Workout's card shows, tagged with the muscle groups it suits (ADR 0014). */
const CoverSchema = z
  .object({
    // the bundle allows any lowercase 8-4-4-4-12 hex id, which z.uuid()'s
    // RFC version and variant checks would refuse
    id: z.string().openapi({
      description: "The Cover's permanent id, which a Workout stores.",
      example: "3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b",
      format: "uuid",
    }),
    image_url: z.url().openapi({
      description:
        "The photo through Supabase's image transformation endpoint: append `width` and/or `height` query parameters.",
    }),
    muscle_groups: z.array(MuscleGroup).openapi({
      description: "The muscle groups the Cover suits.",
    }),
  })
  .openapi("Cover");

const CoverListSchema = z
  .object({
    data: z.array(CoverSchema).openapi({
      description: "Every Cover in the Library, unpaged.",
    }),
  })
  .openapi("CoverList");

export {
  ExerciseSummarySchema as ExerciseSummary,
  ExerciseSchema as Exercise,
  ExercisePageSchema as ExercisePage,
  ExerciseBatchSchema as ExerciseBatch,
  CoverSchema as Cover,
  CoverListSchema as CoverList,
};

export type ExerciseSummary = z.infer<typeof ExerciseSummarySchema>;

export type Exercise = z.infer<typeof ExerciseSchema>;

export type ExercisePage = z.infer<typeof ExercisePageSchema>;

export type ExerciseBatch = z.infer<typeof ExerciseBatchSchema>;

export type Cover = z.infer<typeof CoverSchema>;

export type CoverList = z.infer<typeof CoverListSchema>;

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string(),
    }),
  })
  .openapi("Error");
