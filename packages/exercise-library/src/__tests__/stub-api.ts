import type { MuscleGroup } from "@fitme/core/models";
import type { Exercise } from "..";

/** A made-up Exercise; the name defaults to the slug in title case. */
export const exercise = (
  slug: string,
  overrides: Partial<Exercise> = {}
): Exercise => ({
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

const alphabetical = new Intl.Collator("en");

export interface StubRequest {
  authorization: string | null;
  limit: string | null;
  muscleGroup: string | null;
  offset: string | null;
  search: string | null;
  slugs: string[] | null;
  url: URL;
}

/**
 * A stubbed `fetch` answering `GET /exercises` the way `apps/exercises` does
 * (batch lookup with `slugs`, otherwise a page), recording every request.
 * `respond` replaces the answer, to stub failures.
 */
export const stubApi = (
  exercises: Exercise[],
  respond?: (request: StubRequest) => Response | Promise<Response>
) => {
  const requests: StubRequest[] = [];
  const sorted = [...exercises].sort(
    (a, b) =>
      alphabetical.compare(a.name, b.name) ||
      alphabetical.compare(a.slug, b.slug)
  );
  const bySlug = new Map(sorted.map((e) => [e.slug, summary(e)]));

  const answer = (request: StubRequest) => {
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
      (e) =>
        (!term || e.name.toLowerCase().includes(term)) &&
        (!request.muscleGroup ||
          e.muscle_groups.includes(request.muscleGroup as MuscleGroup))
    );
    const data = matches.slice(offset, offset + limit).map(summary);
    return Response.json({
      data,
      hasMore: offset + data.length < matches.length,
      total: matches.length,
    });
  };

  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const request: StubRequest = {
      authorization: new Headers(init?.headers).get("authorization"),
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
