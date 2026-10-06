import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type CreateMcpServerOptions, createMcpServer } from "../server.js";
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

export async function connect(options: CreateMcpServerOptions = {}) {
  const server = createMcpServer(options);
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
export async function connectWithFake(
  routes: Route[],
  auth?: { userId?: string; error?: string }
) {
  const fake = createFakeSupabase(routes, auth);
  activeFakes.push(fake);
  const client = await connect({
    accessToken: "token-123",
    createSupabaseClient: () => fake.client,
  });
  return { client, fake };
}

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
