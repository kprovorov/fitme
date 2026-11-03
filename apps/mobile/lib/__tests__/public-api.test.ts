/**
 * The Public API client's bearer (`sessionToken`): the real token getter over
 * a stand-in Clerk that loads when the test says so, sending through the fake
 * Public API, as a screen outside the tabs (a deep link) asks before Clerk
 * has loaded.
 */

import { ApiError, createPublicApi } from "@fitme/api-client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  FAKE_SESSION_TOKEN,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";

type Status = "loading" | "ready" | "degraded" | "error";

// The Clerk instance `getClerk()` answers: not loaded until `load()`.
const mockClerk = {
  handlers: new Set<(status: Status) => void>(),
  load(session: { getToken: () => Promise<string | null> } | null) {
    this.loaded = true;
    this.session = session;
    this.status = "ready" as Status;
    for (const handler of this.handlers) {
      handler("ready");
    }
  },
  loaded: false,
  off(_event: "status", handler: (status: Status) => void) {
    this.handlers.delete(handler);
  },
  on(_event: "status", handler: (status: Status) => void) {
    this.handlers.add(handler);
  },
  session: null as { getToken: () => Promise<string | null> } | null,
  status: "loading" as Status,
};

jest.mock("~/lib/clerk", () => ({ getClerk: () => mockClerk }));

const { CLERK_LOAD_TIMEOUT_MS, sessionToken } =
  jest.requireActual<typeof import("~/lib/public-api")>("~/lib/public-api");

// `lib/public-api.ts`'s client, sending through the fake Public API.
const api = createPublicApi({
  baseUrl: () => fakePublicApi.baseUrl,
  fetch: fakePublicApi.fetch,
  token: sessionToken,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  backend.reset();
  mockClerk.handlers.clear();
  mockClerk.loaded = false;
  mockClerk.session = null;
  mockClerk.status = "loading";
});

afterEach(() => {
  jest.useRealTimers();
});

describe("sessionToken", () => {
  it("holds a request until Clerk has loaded, then sends it with the session token", async () => {
    const read = api().GET("/v1/profile");
    await flush();
    // Nothing goes out without a bearer.
    expect(fakePublicApi.requests).toEqual([]);

    mockClerk.load({ getToken: async () => FAKE_SESSION_TOKEN });

    await expect(read).resolves.toMatchObject({ data: { data: null } });
    expect(
      fakePublicApi.requests.map(({ authorization }) => authorization)
    ).toEqual([`Bearer ${FAKE_SESSION_TOKEN}`]);
  });

  it("sends at once once Clerk has loaded", async () => {
    mockClerk.load({ getToken: async () => FAKE_SESSION_TOKEN });

    await expect(api().GET("/v1/profile")).resolves.toMatchObject({
      data: { data: null },
    });
    expect(fakePublicApi.count("GET /v1/profile")).toBe(1);
  });

  it("fails unsent when nobody is signed in", async () => {
    mockClerk.load(null);

    const read = api().GET("/v1/profile");

    await expect(read).rejects.toBeInstanceOf(ApiError);
    await expect(read).rejects.toMatchObject({ code: null, status: null });
    expect(fakePublicApi.requests).toEqual([]);
  });

  it("fails unsent when Clerk doesn't load in time", async () => {
    jest.useFakeTimers();
    const read = api().GET("/v1/profile");
    const failed = expect(read).rejects.toMatchObject({ status: null });

    await jest.advanceTimersByTimeAsync(CLERK_LOAD_TIMEOUT_MS);

    await failed;
    expect(fakePublicApi.requests).toEqual([]);
    expect(mockClerk.handlers.size).toBe(0);
  });
});
