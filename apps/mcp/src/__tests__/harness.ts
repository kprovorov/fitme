import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolContext, UserContext } from "../context.js";
import { createMcpServer } from "../server.js";
import type { UserServices } from "../services.js";
import {
  createFakeSupabase,
  type RecordedCall,
  type Route,
} from "./fake-supabase.js";

export const PLAN_ID = "11111111-1111-4111-8111-111111111111";
export const SESSION_ID = "22222222-2222-4222-8222-222222222222";
export const SET_ID = "33333333-3333-4333-8333-333333333333";
export const WORKOUT_ID = "44444444-4444-4444-8444-444444444444";
export const BENCH_ID = "55555555-5555-4555-8555-555555555555";
export const SQUAT_ID = "66666666-6666-4666-8666-666666666666";

const activeFakes: ReturnType<typeof createFakeSupabase>[] = [];

/**
 * Call from `afterEach`: fails the test if any query a tool made hit no
 * route (which the tool would otherwise report as a generic `isError`).
 */
export function expectAllCallsRouted() {
  const unmatched = activeFakes.flatMap((fake) => fake.unmatched);
  activeFakes.length = 0;
  if (unmatched.length > 0) {
    throw new Error(
      `Unmatched fake Supabase calls:\n${JSON.stringify(unmatched, null, 2)}`
    );
  }
}

const notFaked = (name: keyof UserServices) => () =>
  Promise.reject(new Error(`${name} is not faked.`));

/** Services where every method a test didn't fake fails the call. */
export const fakeServices = (faked: Partial<UserServices>): UserServices => ({
  deletePlan: notFaked("deletePlan"),
  getExercise: notFaked("getExercise"),
  getExerciseHistory: notFaked("getExerciseHistory"),
  getPlan: notFaked("getPlan"),
  getProfile: notFaked("getProfile"),
  listExercises: notFaked("listExercises"),
  listPlans: notFaked("listPlans"),
  ...faked,
});

/**
 * A context whose user tools run as `user` (the HTTP layer's job): on
 * `services` for the tools that moved to them, on `user.supabase` otherwise.
 */
export const contextFor = (
  user: UserContext,
  services: UserServices = fakeServices({})
): ToolContext => ({
  getServices: () => services,
  getUserContext: () => Promise.resolve(user),
});

/** For tests that never reach a user tool. */
const NO_USER: ToolContext = {
  getServices: () => {
    throw new Error("No User in this test.");
  },
  getUserContext: () => Promise.reject(new Error("No User in this test.")),
};

export async function connect(context: ToolContext = NO_USER) {
  const server = createMcpServer({ context });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

/** Connects a client whose user tools run against a fake Supabase client. */
export async function connectWithFake(routes: Route[]) {
  const fake = createFakeSupabase(routes);
  activeFakes.push(fake);
  const client = await connect(
    contextFor({ supabase: fake.client, userId: "user-1" })
  );
  return { client, fake };
}

/** Connects a client whose service-backed tools run on `faked` services. */
export const connectWithServices = (faked: Partial<UserServices>) =>
  connect({
    ...NO_USER,
    getServices: () => fakeServices(faked),
  });

export interface ToolOutcome {
  isError: boolean;
  /** Parsed JSON payload (only for successful results). */
  json: Record<string, unknown>;
  text: string;
}

export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolOutcome> {
  const result = await client.callTool({ arguments: args, name });
  const content = Array.isArray(result.content) ? result.content : [];
  const [first] = content;
  const text = first?.type === "text" ? String(first.text) : "";
  const isError = result.isError === true;
  return { isError, json: isError ? {} : JSON.parse(text), text };
}

/** Calls of one table/RPC, optionally narrowed to one operation. */
export const callsTo = (
  calls: RecordedCall[],
  name: string,
  operation?: RecordedCall["operation"]
) =>
  calls.filter(
    (recorded) =>
      recorded.name === name &&
      (operation === undefined || recorded.operation === operation)
  );
