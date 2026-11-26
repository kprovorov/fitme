import type { Cover } from "..";

/** A made-up Cover; the image URL is made from the id. */
export const cover = (id: string, overrides: Partial<Cover> = {}): Cover => ({
  id,
  image_url: `https://media.test/covers/${id}.jpg`,
  muscle_groups: ["chest"],
  ...overrides,
});

export interface StubRequest {
  authorization: string | null;
  /** The URL's path, e.g. `/covers`. */
  path: string;
  url: URL;
}

/**
 * A stubbed `fetch` answering `GET /covers` the way `apps/library` does
 * (every Cover, in the order given), recording every request. `respond`
 * replaces the answer, to stub failures.
 */
export const stubApi = (
  covers: Cover[] = [],
  respond?: (request: StubRequest) => Response | Promise<Response>
) => {
  const requests: StubRequest[] = [];

  const answer = ({ path }: StubRequest) =>
    path === "/covers"
      ? Response.json({ data: covers })
      : Response.json(
          { error: { code: "not_found", message: "Not found" } },
          { status: 404 }
        );

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);

    const request: StubRequest = {
      authorization: new Headers(init?.headers).get("authorization"),
      path: url.pathname,
      url,
    };

    requests.push(request);

    return respond ? await respond(request) : answer(request);
  };

  return { fetch, requests };
};
