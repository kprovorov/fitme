import { describe, expect, it } from "vitest";

import { posthogConfig, posthogPersonDeleter } from "../posthog.js";

const USER_ID = "user_2DeleteMe00000000000000";
const API_KEY = "phx_personalKey0123456789abcdefghijklmnop";
const PROJECT_ID = "12345";

/** Records each request PostHog gets and answers it with `answer`. */
const fakePosthog = (
  answer: () => Promise<Response> = () =>
    Promise.resolve(
      Response.json(
        { persons_deleted: 0, persons_queued_for_deletion: 1 },
        { status: 202 }
      )
    )
) => {
  const requests: Request[] = [];

  const fetch: typeof globalThis.fetch = (input, init) => {
    requests.push(new Request(input, init));

    return answer();
  };

  return { fetch, requests };
};

describe("posthog person deletion", () => {
  const deleteOnce = async () => {
    const { fetch, requests } = fakePosthog();

    await posthogPersonDeleter({
      apiKey: API_KEY,
      fetch,
      projectId: PROJECT_ID,
    })(USER_ID);

    return requests;
  };

  it("posts once to PostHog's US host with the personal API key", async () => {
    const requests = await deleteOnce();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe(
      `https://us.posthog.com/api/projects/${PROJECT_ID}/persons/bulk_delete/`
    );
    expect(requests[0]?.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
  });

  it("asks for the User's person and their events as JSON", async () => {
    const [request] = await deleteOnce();

    expect(request?.headers.get("content-type")).toBe("application/json");
    await expect(request?.json()).resolves.toStrictEqual({
      delete_events: true,
      distinct_ids: [USER_ID],
    });
  });

  it.each([200, 202, 204])("counts a %i as done", async (status) => {
    const { fetch } = fakePosthog(() =>
      Promise.resolve(new Response(null, { status }))
    );

    await expect(
      posthogPersonDeleter({ apiKey: API_KEY, fetch, projectId: PROJECT_ID })(
        USER_ID
      )
    ).resolves.toBeUndefined();
  });

  it.each([400, 401, 403, 404, 429, 500, 503])(
    "fails on a %i without the key in the message",
    async (status) => {
      const { fetch } = fakePosthog(() =>
        Promise.resolve(
          Response.json({ detail: "nope" }, { status, statusText: "Nope" })
        )
      );

      const deletion = posthogPersonDeleter({
        apiKey: API_KEY,
        fetch,
        projectId: PROJECT_ID,
      })(USER_ID);

      await expect(deletion).rejects.toThrow(`HTTP ${status}`);
      await expect(deletion).rejects.not.toThrow(API_KEY);
    }
  );

  it("fails on a network failure", async () => {
    const { fetch } = fakePosthog(() =>
      Promise.reject(new TypeError("fetch failed"))
    );

    await expect(
      posthogPersonDeleter({ apiKey: API_KEY, fetch, projectId: PROJECT_ID })(
        USER_ID
      )
    ).rejects.toThrow("fetch failed");
  });

  it.each([
    ["the key", { projectId: PROJECT_ID }, "POSTHOG_PERSONAL_API_KEY"],
    ["the project id", { apiKey: API_KEY }, "POSTHOG_PROJECT_ID"],
    [
      "an empty key",
      { apiKey: "", projectId: PROJECT_ID },
      "POSTHOG_PERSONAL_API_KEY",
    ],
  ])("throws without %s and calls nothing", async (_, options, name) => {
    const { fetch, requests } = fakePosthog();

    await expect(
      posthogPersonDeleter({ ...options, fetch })(USER_ID)
    ).rejects.toThrow(`Missing ${name} environment variable`);
    expect(requests).toStrictEqual([]);
  });

  it("reads the key and project id from the environment", () => {
    expect(
      posthogConfig({
        POSTHOG_PERSONAL_API_KEY: API_KEY,
        POSTHOG_PROJECT_ID: PROJECT_ID,
      })
    ).toStrictEqual({ apiKey: API_KEY, projectId: PROJECT_ID });
  });
});
