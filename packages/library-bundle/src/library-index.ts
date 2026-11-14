import { z } from "zod";

import { BUNDLE_VERSION } from "./schema";

/**
 * The Library index (ADR 0018): what a write needs to check its Exercise
 * slugs and pick its Workouts' Covers, read from the same `library.json`
 * bundle the Library API is built from. Every Exercise slug with its muscle
 * groups, and every Cover with its id and muscle groups, in bundle order.
 */
export interface LibraryIndexData {
  /** Every Cover, in bundle order. */
  covers: IndexCover[];
  /** Every Exercise slug and its muscle groups, in bundle order. */
  exercises: Map<string, string[]>;
}

/** A Cover as the index holds it. */
export interface IndexCover {
  id: string;
  /** As the bundle writes them: a muscle group this build doesn't know is kept. */
  muscle_groups: string[];
}

/** A known Exercise as the index answers it. */
export interface IndexExercise {
  /** As the bundle writes them: a muscle group this build doesn't know is kept. */
  muscle_groups: string[];
  slug: string;
}

/**
 * The lenient read of a bundle: only the fields the index needs, everything
 * else ignored, so a field the bundle gains never stops writes until the apps
 * redeploy. Muscle groups stay strings, as `@fitme/library-sdk` reads them,
 * so a new muscle group never breaks it either.
 */
const IndexedBundle = z.object({
  covers: z
    .array(z.object({ id: z.string(), muscle_groups: z.array(z.string()) }))
    .optional(),
  exercises: z.array(
    z.object({ muscle_groups: z.array(z.string()), slug: z.string() })
  ),
  version: z.literal(BUNDLE_VERSION),
});

/**
 * Reads a parsed `library.json` into the index. Throws when it can't (not an
 * object, a wrong `version`, no `exercises`, a slug or muscle group that isn't
 * a string), so an unreadable bundle is a failed load.
 */
export const readLibraryIndex = (json: unknown): LibraryIndexData => {
  const parsed = IndexedBundle.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `Unreadable library.json: ${parsed.error.issues
        .map((issue) =>
          issue.path.length > 0
            ? `${issue.path.join(".")}: ${issue.message}`
            : issue.message
        )
        .join("; ")}`
    );
  }

  return {
    covers: (parsed.data.covers ?? []).map((cover) => ({
      id: cover.id,
      muscle_groups: cover.muscle_groups,
    })),
    exercises: new Map(
      parsed.data.exercises.map((exercise) => [
        exercise.slug,
        exercise.muscle_groups,
      ])
    ),
  };
};

/** What the index says about the slugs a write carries. */
export type IndexLookup =
  | {
      /** Every Cover, in bundle order. */
      covers: IndexCover[];
      /** The asked slugs the index has, in asked order, each once. */
      exercises: IndexExercise[];
      /** The asked slugs it hasn't, in asked order, each once. */
      missing: string[];
      status: "ready";
    }
  /** No index: the first load failed (reported), and the next lookup tries again. */
  | { status: "unavailable" };

export interface LibraryIndex {
  /**
   * Looks `slugs` up. A miss reloads the bundle (at most once per
   * `reloadIntervalMs`, a miss during a reload waiting for it) and answers
   * from the new index; a failed reload keeps the current one.
   */
  lookup: (slugs: readonly string[]) => Promise<IndexLookup>;
}

/** How often a miss may reload the bundle: at most once a minute per instance. */
export const RELOAD_INTERVAL_MS = 60_000;

/**
 * The instance's Library index, loaded on the first lookup and kept for the
 * life of the instance (nothing invalidates it: the Library is added to,
 * never removed from, so a stale index can only be missing slugs).
 *
 * - `load` answers the parsed bundle (see `libraryBundleLoader`); every load
 *   failure, an unreadable bundle included, is reported through `reportError`.
 * - A failed first load answers `unavailable`, and the next lookup loads again.
 * - A lookup with a missing slug reloads once `reloadIntervalMs` has passed
 *   since the last load began, then answers again from the new index. Lookups
 *   arriving while a load runs wait for it, so a burst is one load.
 */
export const createLibraryIndex = ({
  load,
  now = Date.now,
  reloadIntervalMs = RELOAD_INTERVAL_MS,
  reportError,
}: {
  load: () => Promise<unknown>;
  now?: () => number;
  reloadIntervalMs?: number;
  reportError: (error: Error) => Promise<void> | void;
}): LibraryIndex => {
  let current: LibraryIndexData | null = null;
  let loading: Promise<void> | null = null;
  let lastLoadAt = Number.NEGATIVE_INFINITY;

  const loadOnce = async () => {
    try {
      current = readLibraryIndex(await load());
    } catch (error) {
      await reportError(
        error instanceof Error
          ? error
          : new Error("Library index load failed", { cause: error })
      );
    }
  };

  /** Starts a load, or joins the one already running. */
  const reload = () => {
    if (!loading) {
      lastLoadAt = now();
      loading = loadOnce().finally(() => {
        loading = null;
      });
    }

    return loading;
  };

  const answer = (
    index: LibraryIndexData,
    slugs: readonly string[]
  ): IndexLookup & { status: "ready" } => {
    const exercises: IndexExercise[] = [];
    const missing: string[] = [];

    for (const slug of new Set(slugs)) {
      const muscleGroups = index.exercises.get(slug);

      if (muscleGroups) {
        exercises.push({ muscle_groups: muscleGroups, slug });
      } else {
        missing.push(slug);
      }
    }

    return { covers: index.covers, exercises, missing, status: "ready" };
  };

  return {
    lookup: async (slugs) => {
      if (loading || !current) {
        await reload();
      }

      if (!current) {
        return { status: "unavailable" };
      }

      const first = answer(current, slugs);

      if (first.missing.length === 0) {
        return first;
      }

      if (now() - lastLoadAt < reloadIntervalMs) {
        return first;
      }

      await reload();

      return answer(current, slugs);
    },
  };
};
