import { isDeepStrictEqual } from "node:util";
import type { FitmeSupabaseClient } from "../supabase.js";

type Operation = "delete" | "insert" | "rpc" | "select" | "update";

export type Filter = [string, ...unknown[]];

export interface RecordedCall {
  /** RPC arguments or the insert/update payload. */
  args?: unknown;
  /** Every other builder method call, e.g. `["eq", "id", "…"]`. */
  filters: Filter[];
  /** Table name, or the function name for RPCs. */
  name: string;
  operation: Operation;
  select?: string;
  /** Second argument of `.select()`, e.g. `{ count: "exact", head: true }`. */
  selectOptions?: { count?: string; head?: boolean };
}

export interface FakeResponse {
  count?: number | null;
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface Route {
  /** Every one of these must appear among the call's filters. */
  filters?: Filter[];
  /** Match only HEAD (count-only) selects, or only non-HEAD ones. */
  head?: boolean;
  name: string;
  /** Answer only the first matching call, then fall through to later routes. */
  once?: boolean;
  operation: Operation;
  response: FakeResponse;
  /** Only match calls whose select string contains this text. */
  select?: string;
}

export const ok = (data: unknown, count?: number): FakeResponse => ({
  count,
  data,
  error: null,
});

export const failure = (message: string, code?: string): FakeResponse => ({
  data: null,
  error: { code, message },
});

const OPERATIONS = new Set<string>(["delete", "insert", "update"]);

const hasFilter = (call: RecordedCall, expected: Filter) =>
  call.filters.some((actual) => isDeepStrictEqual(actual, expected));

const matches = (route: Route, call: RecordedCall) =>
  route.name === call.name &&
  route.operation === call.operation &&
  (route.select === undefined || (call.select ?? "").includes(route.select)) &&
  (route.head === undefined ||
    route.head === (call.selectOptions?.head === true)) &&
  (route.filters ?? []).every((filter) => hasFilter(call, filter));

/**
 * Minimal stand-in for the supabase-js client: records every query chain and
 * answers it from the first matching route. Unmatched queries are collected in
 * `unmatched` (tests assert it stays empty) and fail the query.
 */
export function createFakeSupabase(routes: Route[]) {
  const calls: RecordedCall[] = [];
  const unmatched: RecordedCall[] = [];
  const pending = [...routes];

  const respond = (call: RecordedCall) => {
    calls.push(call);
    const index = pending.findIndex((candidate) => matches(candidate, call));
    const route = pending[index];
    if (!route) {
      unmatched.push(call);
      throw new Error(`Unmatched fake Supabase call: ${JSON.stringify(call)}`);
    }
    if (route.once) {
      pending.splice(index, 1);
    }
    return route.response;
  };

  const record = (call: RecordedCall, method: string, args: unknown[]) => {
    if (method === "select") {
      call.select = String(args[0] ?? "*");
      call.selectOptions = args[1] as RecordedCall["selectOptions"];
      return;
    }
    if (OPERATIONS.has(method)) {
      call.operation = method as Operation;
      call.args = args[0];
      return;
    }
    call.filters.push([method, ...args]);
  };

  const builder = (call: RecordedCall): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_target, property) => {
          if (property === "then") {
            const result = Promise.resolve().then(() => respond(call));
            return result.then.bind(result);
          }
          return (...args: unknown[]) => {
            record(call, String(property), args);
            return proxy;
          };
        },
      }
    );
    return proxy;
  };

  const client = {
    from: (table: string) =>
      builder({ filters: [], name: table, operation: "select" }),
    rpc: (name: string, args: unknown) =>
      builder({ args, filters: [], name, operation: "rpc" }),
  };

  return {
    calls,
    // The fake implements only the surface the tools use.
    client: client as unknown as FitmeSupabaseClient,
    unmatched,
  };
}
