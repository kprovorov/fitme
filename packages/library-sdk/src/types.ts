import type { MuscleGroup } from "@fitme/core/models";

// The Library API's response shapes, mirroring `apps/exercises`'
// zod schemas (src/schemas.ts): change both together.

/** An Exercise in a list or a batch lookup. */
export interface ExerciseSummary {
  muscle_groups: MuscleGroup[];
  name: string;
  slug: string;
  /** Supabase's image transformation endpoint: append `width` / `height`. */
  thumbnail_url: string;
  /** The public video URL (mp4). */
  video_url: string;
}

/** One Exercise in full (`GET /exercises/:slug`). */
export interface Exercise extends ExerciseSummary {
  /** Markdown. */
  description: string;
  /** Markdown. */
  instructions: string;
}

/** One page of a list, alphabetical by name. */
export interface ExercisePage {
  data: ExerciseSummary[];
  /** Whether more matches follow this page. */
  hasMore: boolean;
  /** How many Exercises match, across every page. */
  total: number;
}

/** A batch lookup: the Exercises found and the slugs nothing has, both in asked order. */
export interface ExerciseBatch {
  data: ExerciseSummary[];
  missing: string[];
}

export interface ListExercisesParams {
  /** Page size, 1–50; the API's default is 20. */
  limit?: number;
  muscleGroup?: MuscleGroup;
  /** How many matches to skip; the API's default is 0. */
  offset?: number;
  /** A case-insensitive substring of the name, at most 100 characters. */
  search?: string;
}

/** What Arnold, MCP and the mobile app read the Library through. */
export interface Library {
  /** One Exercise in full, or `null` when no Exercise has that slug. */
  get: (slug: string) => Promise<Exercise | null>;
  /** Exercises listed by name, filtered by `search` and `muscleGroup`. */
  list: (params?: ListExercisesParams) => Promise<ExercisePage>;
  /**
   * The Exercises with these slugs, in asked order (a repeated slug answered
   * once), and every slug no Exercise has in `missing`.
   */
  lookup: (slugs: readonly string[]) => Promise<ExerciseBatch>;
}
