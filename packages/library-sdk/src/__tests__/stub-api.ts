import type { AppLanguage, MuscleGroup } from "@fitme/core/models";
import type { Exercise } from "..";

/** An Exercise's text in another App language, as the bundle carries it. */
type Translation = Pick<Exercise, "description" | "instructions" | "name">;

/** A made-up Exercise in English, with its translations, if any. */
export type StubExercise = Exercise & {
  translations?: Partial<Record<AppLanguage, Translation>>;
};

/** A made-up Exercise; the name defaults to the slug in title case. */
export const exercise = (
  slug: string,
  overrides: Partial<StubExercise> = {}
): StubExercise => ({
  description: `About ${slug}.`,
  instructions: `Do ${slug}.`,
  muscle_groups: ["chest"] as MuscleGroup[],
  name: slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
  slug,
  thumbnail_url: `https://media.test/${slug}.jpg`,
  video_url: `https://media.test/${slug}.mp4`,
  ...overrides,
});

const summary = ({ description, instructions, ...rest }: Exercise) => rest;

const EXERCISE_PATH = /^\/exercises\/([^/]+)$/;

export interface StubRequest {
  authorization: string | null;
  /** `GET /exercises/:slug`'s slug, decoded; null for `GET /exercises`. */
  exerciseSlug: string | null;
  language: string | null;
  limit: string | null;
  muscleGroup: string | null;
  offset: string | null;
  search: string | null;
  slugs: string[] | null;
  url: URL;
}

/**
 * The Exercises as `apps/library` serves them in `language`: translated, or
 * wholly English without a translation, sorted by that name with the
 * language's collation (ties by slug), each with the names search matches.
 */
const serveIn = (exercises: StubExercise[], language: string) => {
  const collator = new Intl.Collator(language);
  return exercises
    .map(({ translations, ...english }) => {
      const translation = translations?.[language as AppLanguage];
      return {
        exercise: { ...english, ...translation },
        names: [translation?.name ?? english.name, english.name].map((name) =>
          name.toLowerCase()
        ),
      };
    })
    .sort(
      (a, b) =>
        collator.compare(a.exercise.name, b.exercise.name) ||
        collator.compare(a.exercise.slug, b.exercise.slug)
    );
};

/**
 * A stubbed `fetch` answering `GET /exercises` the way `apps/library` does
 * (batch lookup with `slugs`, otherwise a page) and `GET /exercises/:slug`
 * (one Exercise in full, or 404), each in its `language` (default `en`),
 * recording every request. `respond` replaces the answer, to stub failures.
 */
export const stubApi = (
  exercises: StubExercise[],
  respond?: (request: StubRequest) => Response | Promise<Response>
) => {
  const requests: StubRequest[] = [];

  const answer = (request: StubRequest) => {
    const sorted = serveIn(exercises, request.language ?? "en");
    const bySlug = new Map(
      sorted.map(({ exercise: e }) => [e.slug, summary(e)])
    );
    const full = new Map(sorted.map(({ exercise: e }) => [e.slug, e]));
    if (request.exerciseSlug !== null) {
      const found = full.get(request.exerciseSlug);
      return found
        ? Response.json(found)
        : Response.json(
            { error: { code: "not_found", message: "Exercise not found" } },
            { status: 404 }
          );
    }
    if (request.slugs) {
      const slugs = [...new Set(request.slugs)];
      return Response.json({
        data: slugs.flatMap((slug) => bySlug.get(slug) ?? []),
        missing: slugs.filter((slug) => !bySlug.has(slug)),
      });
    }
    const limit = Number(request.limit ?? 20);
    const offset = Number(request.offset ?? 0);
    const term = request.search?.trim().toLowerCase();
    const matches = sorted.filter(
      ({ exercise: e, names }) =>
        (!term || names.some((name) => name.includes(term))) &&
        (!request.muscleGroup ||
          e.muscle_groups.includes(request.muscleGroup as MuscleGroup))
    );
    const data = matches
      .slice(offset, offset + limit)
      .map(({ exercise: e }) => summary(e));
    return Response.json({
      data,
      hasMore: offset + data.length < matches.length,
      total: matches.length,
    });
  };

  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const [, slug] = EXERCISE_PATH.exec(url.pathname) ?? [];
    const request: StubRequest = {
      authorization: new Headers(init?.headers).get("authorization"),
      exerciseSlug: slug === undefined ? null : decodeURIComponent(slug),
      language: params.get("language"),
      limit: params.get("limit"),
      muscleGroup: params.get("muscle_group"),
      offset: params.get("offset"),
      search: params.get("search"),
      slugs: params.has("slugs")
        ? (params.get("slugs") ?? "").split(",")
        : null,
      url,
    };
    requests.push(request);
    return Promise.resolve(respond ? respond(request) : answer(request));
  };

  return { fetch, requests };
};
