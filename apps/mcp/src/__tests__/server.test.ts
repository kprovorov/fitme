import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, extractBearerToken } from "../app.js";
import { createFakeSupabase, ok } from "./fake-supabase.js";
import {
  call,
  connect,
  connectWithFake,
  expectAllCallsRouted,
} from "./harness.js";

const PUBLIC_TOOLS = [
  "ping",
  "list_muscle_groups",
  "list_plan_options",
  "describe_muscle_group",
];

const USER_TOOLS = [
  "list_exercises",
  "get_exercise",
  "get_exercise_history",
  "list_plans",
  "get_plan",
  "create_plan",
  "update_plan",
  "delete_plan",
  "activate_plan",
  "start_workout_session",
  "get_workout_session",
  "list_workout_sessions",
  "log_set",
  "finish_workout_session",
  "delete_workout_session",
  "get_profile",
];

const SSE_DATA_LINE = /^data: (.*)$/m;

afterEach(() => {
  vi.unstubAllEnvs();
  expectAllCallsRouted();
});

describe("tool registry", () => {
  it("lists the public and user tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...PUBLIC_TOOLS, ...USER_TOOLS].sort()
    );
  });

  it("annotates reads, deletions and idempotency honestly", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));

    expect(hints.get("get_plan")?.readOnlyHint).toBe(true);
    expect(hints.get("delete_plan")).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(hints.get("delete_workout_session")).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(hints.get("start_workout_session")?.idempotentHint).toBe(false);
  });
});

describe("public tools", () => {
  it("work without a token or Supabase env", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const client = await connect();

    const ping = await call(client, "ping");
    expect(ping.isError).toBe(false);
    expect(ping.json).toMatchObject({ ok: true, version: "0.2.0" });

    const group = await call(client, "describe_muscle_group", {
      muscleGroup: "lower-back",
    });
    expect(group.json).toEqual({ id: "lower-back", name: "Lower Back" });
  });
});

describe("authentication", () => {
  it("returns a tool error for user tools without a token", async () => {
    const client = await connect();
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication required");
  });

  it("returns a tool error when Supabase env is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const client = await connect({ accessToken: "token-123" });
    const result = await call(client, "get_profile");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not configured");
  });

  it("rejects an invalid token with an authentication error", async () => {
    const { client, fake } = await connectWithFake([], {
      error: "invalid JWT: token is expired",
    });
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication failed: invalid JWT");
    expect(fake.calls).toHaveLength(0);
  });

  it("verifies the token once per request", async () => {
    const { client, fake } = await connectWithFake([
      { name: "plans", operation: "select", response: ok([]) },
    ]);
    await call(client, "list_plans");
    await call(client, "list_plans");
    expect(fake.getUserCalls).toEqual(["token-123"]);
  });

  it("parses bearer tokens from the Authorization header", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});

describe("HTTP endpoint", () => {
  const profiles: Record<string, string> = { alice: "metric", bob: "us" };

  const createTestApp = () => {
    const fakes = new Map<string, ReturnType<typeof createFakeSupabase>>();
    const app = createApp({
      createSupabaseClient: (token) => {
        const fake = createFakeSupabase(
          [
            {
              filters: [["eq", "user_id", `user-${token}`]],
              name: "profiles",
              operation: "select",
              response: ok({
                age: 30,
                gender: "female",
                height: 170,
                measurement_system: profiles[token],
                weight: 60,
              }),
            },
          ],
          { userId: `user-${token}` }
        );
        fakes.set(token, fake);
        return fake.client;
      },
      logRequests: false,
    });
    return { app, fakes };
  };

  const getProfile = async (
    app: ReturnType<typeof createApp>,
    token?: string
  ) => {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await app.request("/", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "get_profile" },
      }),
      headers,
      method: "POST",
    });
    const [, data] = (await response.text()).match(SSE_DATA_LINE) ?? [];
    const message = JSON.parse(data ?? "{}");
    const [content] = message.result.content;
    return {
      isError: message.result.isError === true,
      status: response.status,
      text: content.text,
    };
  };

  it("passes each request's bearer token to the tools without sharing state", async () => {
    const { app, fakes } = createTestApp();

    const alice = await getProfile(app, "alice");
    const bob = await getProfile(app, "bob");

    expect([alice.status, bob.status]).toEqual([200, 200]);
    expect(alice.isError).toBe(false);
    expect(JSON.parse(alice.text)).toMatchObject({
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
    });
    expect(bob.isError).toBe(false);
    expect(JSON.parse(bob.text)).toMatchObject({
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    });
    expect(fakes.get("alice")?.getUserCalls).toEqual(["alice"]);
    expect(fakes.get("bob")?.getUserCalls).toEqual(["bob"]);
    expect(fakes.get("alice")?.unmatched).toEqual([]);
    expect(fakes.get("bob")?.unmatched).toEqual([]);
  });

  it("treats a request without a token as unauthenticated", async () => {
    const { app, fakes } = createTestApp();
    await getProfile(app, "alice");

    const anonymous = await getProfile(app);

    expect(anonymous.isError).toBe(true);
    expect(anonymous.text).toContain("Authentication required");
    expect(fakes.size).toBe(1);
  });
});
