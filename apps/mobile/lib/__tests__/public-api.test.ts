import { ApiError } from "@fitme/api-client";
/**
 * The real Public API clients (`lib/public-api.ts`; `test-utils/setup.ts`'s
 * stand-in is lifted here) over the fake Public API, with a stand-in Clerk
 * that loads when the test says so, as a screen outside the tabs (a deep
 * link) asks before Clerk has loaded.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { useArnoldModelsQuery } from "~/hooks/queries/arnold-models";
import { CLERK_LOAD_TIMEOUT_MS, publicApi } from "~/lib/public-api";
import {
  backend,
  FAKE_PUBLIC_API_URL,
  FAKE_SESSION_TOKEN,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient } from "~/test-utils/query-client";

jest.unmock("~/lib/public-api");

type Status = "loading" | "ready" | "degraded" | "error";

type Session = { getToken: () => Promise<string | null> } | null;

// The Clerk instance `getClerk()` answers: loading until the test emits a
// status. Like Clerk's own event bus, it dispatches over its live list of
// listeners, which `off()` splices (so a listener removing itself during a
// dispatch makes it skip the next), and `on(…, { notify: true })` replays the
// last status to a later listener.
const mockClerk = {
  emit(status: Status, session: Session) {
    this.status = status;
    this.loaded = status === "ready" || status === "degraded";
    this.session = session;
    this.emitted = status;

    // oxlint-disable-next-line typescript/prefer-for-of -- Index the live list exactly as Clerk's dispatch does.
    for (let index = 0; index < this.handlers.length; index += 1) {
      this.handlers[index]?.(status);
    }
  },
  emitted: null as Status | null,
  handlers: [] as ((status: Status) => void)[],
  loaded: false,
  off(_event: "status", handler: (status: Status) => void) {
    const index = this.handlers.indexOf(handler);

    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  },
  on(
    _event: "status",
    handler: (status: Status) => void,
    options?: { notify: boolean }
  ) {
    this.handlers.push(handler);

    if (options?.notify && this.emitted) {
      handler(this.emitted);
    }
  },
  session: null as Session,
  status: "loading" as Status,
};

jest.mock("~/lib/clerk", () => ({
  getClerk: () => mockClerk,
}));

const signedIn: Session = {
  getToken: () => Promise.resolve(FAKE_SESSION_TOKEN),
};

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** A User-data read, as every screen's query sends it. */
const readProfile = () => publicApi().GET("/v1/profile");

const realFetch = globalThis.fetch;
const realApiUrl = process.env.EXPO_PUBLIC_API_URL;

beforeEach(() => {
  backend.reset();
  process.env.EXPO_PUBLIC_API_URL = FAKE_PUBLIC_API_URL;
  // Neither client is given a `fetch`: they use the global one.
  globalThis.fetch = ((url: string, init: RequestInit) =>
    fakePublicApi.fetch(url, init)) as typeof fetch;
  mockClerk.handlers = [];
  mockClerk.emitted = null;
  mockClerk.loaded = false;
  mockClerk.session = null;
  mockClerk.status = "loading";
});

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = realFetch;

  if (realApiUrl === undefined) {
    Reflect.deleteProperty(process.env, "EXPO_PUBLIC_API_URL");
  } else {
    process.env.EXPO_PUBLIC_API_URL = realApiUrl;
  }
});

describe("publicApi", () => {
  it("holds a request until Clerk has loaded, then sends it with the session token", async () => {
    const read = readProfile();
    await flush();
    // Nothing goes out without a bearer.
    expect(fakePublicApi.requests).toEqual([]);

    mockClerk.emit("ready", signedIn);

    await expect(read).resolves.toMatchObject({ data: { data: null } });
    expect(
      fakePublicApi.requests.map(({ authorization }) => authorization)
    ).toEqual([`Bearer ${FAKE_SESSION_TOKEN}`]);
  });

  it("sends at once once Clerk has loaded", async () => {
    mockClerk.emit("ready", signedIn);

    await expect(readProfile()).resolves.toMatchObject({
      data: { data: null },
    });
    expect(fakePublicApi.count("GET /v1/profile")).toBe(1);
  });

  it("sends once Clerk loads degraded, which still serves the session", async () => {
    const read = readProfile();
    await flush();

    mockClerk.emit("degraded", signedIn);

    await expect(read).resolves.toMatchObject({ data: { data: null } });
    expect(fakePublicApi.requests[0]?.authorization).toBe(
      `Bearer ${FAKE_SESSION_TOKEN}`
    );
  });

  it("stops waiting, and its timer, once Clerk has loaded", async () => {
    jest.useFakeTimers();
    const read = readProfile();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockClerk.handlers).toHaveLength(1);

    mockClerk.emit("ready", signedIn);
    // The fake Public API answers on its next tick.
    await jest.advanceTimersByTimeAsync(0);

    await expect(read).resolves.toMatchObject({ data: { data: null } });
    expect(mockClerk.handlers).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("sends every request that waited, with the session token, once Clerk has loaded", async () => {
    jest.useFakeTimers();
    const profile = readProfile();
    const plans = publicApi().GET("/v1/plans");
    await jest.advanceTimersByTimeAsync(0);
    expect(fakePublicApi.requests).toEqual([]);

    mockClerk.emit("ready", signedIn);
    await jest.advanceTimersByTimeAsync(0);

    await expect(profile).resolves.toMatchObject({ data: { data: null } });
    await expect(plans).resolves.toMatchObject({ data: { data: [] } });
    expect(
      fakePublicApi.requests.map(({ authorization }) => authorization)
    ).toEqual([`Bearer ${FAKE_SESSION_TOKEN}`, `Bearer ${FAKE_SESSION_TOKEN}`]);
    expect(mockClerk.handlers).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("fails unsent when nobody is signed in", async () => {
    mockClerk.emit("ready", null);

    const read = readProfile();

    await expect(read).rejects.toBeInstanceOf(ApiError);
    await expect(read).rejects.toMatchObject({ code: null, status: null });
    expect(fakePublicApi.requests).toEqual([]);
  });

  it("fails unsent when Clerk loads signed out while the request waits", async () => {
    const read = readProfile();
    await flush();

    mockClerk.emit("ready", null);

    await expect(read).rejects.toMatchObject({ code: null, status: null });
    expect(fakePublicApi.requests).toEqual([]);
  });

  it("fails unsent when Clerk doesn't load in time", async () => {
    jest.useFakeTimers();
    const read = readProfile();
    // oxlint-disable-next-line jest/valid-expect -- Attach the rejection handler before advancing time; failed is awaited below.
    const failed = expect(read).rejects.toMatchObject({ status: null });

    await jest.advanceTimersByTimeAsync(CLERK_LOAD_TIMEOUT_MS);

    await failed;
    expect(fakePublicApi.requests).toEqual([]);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockClerk.handlers).toHaveLength(0);

    // The wait that timed out is forgotten: a later request waits afresh and
    // is sent once Clerk loads.
    const later = readProfile();
    await jest.advanceTimersByTimeAsync(0);
    mockClerk.emit("ready", signedIn);
    await jest.advanceTimersByTimeAsync(0);
    await expect(later).resolves.toMatchObject({ data: { data: null } });
    expect(fakePublicApi.count("GET /v1/profile")).toBe(1);
  });
});

describe("arnold's model list, a global route", () => {
  const fetchModels = () =>
    createTestQueryClient().fetchQuery(useArnoldModelsQuery.getFetchOptions());

  it("is read at once with no bearer while Clerk is still loading", async () => {
    // Clerk never loads in this test.
    await expect(fetchModels()).resolves.toMatchObject({
      models: expect.any(Array),
    });
    expect(fakePublicApi.requests).toEqual([
      expect.objectContaining({
        authorization: null,
        route: "GET /v1/arnold/models",
      }),
    ]);
  });

  it("is read with no bearer when nobody is signed in", async () => {
    mockClerk.emit("ready", null);

    await expect(fetchModels()).resolves.toMatchObject({
      models: expect.any(Array),
    });
    expect(fakePublicApi.requests[0]?.authorization).toBeNull();
  });
});
