import { type MeasurementSystem, measurementSystems } from "@fitme/core";
import type { PublicApiFetch } from "~/lib/api/client";
import { backend, type ProfileRow } from "./fake-workout-backend";

/**
 * A fetch-level stand-in for `apps/api`, the `fetch` of the Public API client
 * in every test file (`test-utils/setup.ts`). It answers like the `/v1` routes
 * over the fake Supabase backend's rows (`backend`), so a write through it
 * shows in the next Supabase read, and as the User `FAKE_USER_ID` when the
 * bearer is `FAKE_SESSION_TOKEN` (anything else is a 401). Point the app's
 * `getCurrentUserId` at `FAKE_USER_ID` so its Supabase reads see the same
 * User.
 *
 * A route it doesn't implement answers 501 and fails the test after it
 * (`test-utils/after-each.ts`). `failNext` fails a route on demand.
 */

export const FAKE_PUBLIC_API_URL = "https://api.test";
export const FAKE_SESSION_TOKEN = "test-session-token";
export const FAKE_USER_ID = "user_test";

/** A route as `"<METHOD> <path>"`, e.g. `"PATCH /v1/profile"`. */
export type Route =
  `${"DELETE" | "GET" | "PATCH" | "POST" | "PUT"} /v1/${string}`;

export type Failure =
  /** The connection fails before any answer. */
  | "network"
  /** The request is applied, then the connection fails before the answer. */
  | "lost"
  /** An error answer; a 429 gets `Retry-After: retryAfterSeconds` (30). */
  | { code?: string; retryAfterSeconds?: number; status: number };

export interface ReceivedRequest {
  authorization: string | null;
  body: unknown;
  route: string;
}

const HEIGHT_FACTOR = 0.393_701;
const WEIGHT_FACTOR = 2.204_62;
const PROFILE_FIELDS = new Set([
  "age",
  "gender",
  "height",
  "measurement_system",
  "weight",
]);

const round2 = (value: number) => Math.round(value * 100) / 100;

const isImperial = (system: string) => system !== "metric";

const unitsOf = (system: string) =>
  isImperial(system)
    ? { height: "in", weight: "lbs" }
    : { height: "cm", weight: "kg" };

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });

const error = (
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit
) => json(status, { error: { code, message } }, headers);

const profileBody = (profile: ProfileRow) => {
  const { user_id: _userId, ...fields } = profile;
  return { ...fields, units: unitsOf(profile.measurement_system) };
};

/** Every stored height and weight of the User, as the API converts them. */
const convert = (profile: ProfileRow, to: MeasurementSystem) => {
  if (isImperial(profile.measurement_system) === isImperial(to)) {
    return;
  }
  const toImperial = isImperial(to);
  const height = toImperial ? HEIGHT_FACTOR : 1 / HEIGHT_FACTOR;
  const weight = toImperial ? WEIGHT_FACTOR : 1 / WEIGHT_FACTOR;
  profile.height = round2(profile.height * height);
  profile.weight = round2(profile.weight * weight);
  for (const set of backend.sets) {
    if (set.weight_completed !== null) {
      set.weight_completed = round2(set.weight_completed * weight);
    }
    if (set.weight_recommended !== null) {
      set.weight_recommended = round2(set.weight_recommended * weight);
    }
  }
};

const patchProfile = (body: unknown): Response => {
  if (
    typeof body !== "object" ||
    body === null ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))
  ) {
    return error(400, "invalid_request", "Invalid profile changes");
  }
  const changes = body as Partial<ProfileRow>;
  const system = changes.measurement_system;
  if (
    system !== undefined &&
    !measurementSystems.includes(system as MeasurementSystem)
  ) {
    return error(400, "invalid_request", "measurement_system: Invalid option");
  }
  const profile = backend.profile(FAKE_USER_ID);
  if (!profile) {
    return error(404, "profile_not_found", "Profile not found");
  }
  if (system !== undefined) {
    convert(profile, system as MeasurementSystem);
  }
  Object.assign(profile, changes);
  return json(200, { data: profileBody(profile) });
};

const answer = (route: string, body: unknown): Response | null => {
  switch (route) {
    case "PATCH /v1/profile":
      return patchProfile(body);
    default:
      return null;
  }
};

class FakePublicApi {
  /** The client's base URL; `""` makes the app see `EXPO_PUBLIC_API_URL` unset. */
  baseUrl = FAKE_PUBLIC_API_URL;
  /** Every request received, in order. */
  requests: ReceivedRequest[] = [];
  /** Routes the fake doesn't implement; a test bug, checked after each test. */
  unhandled: string[] = [];
  private failures: Array<{ failure: Failure; route: string }> = [];
  private pauses: Array<{ resumed: Promise<void>; route: string }> = [];

  reset() {
    this.baseUrl = FAKE_PUBLIC_API_URL;
    this.requests = [];
    this.unhandled = [];
    this.failures = [];
    this.pauses = [];
  }

  /**
   * Holds requests to `route` unanswered until the returned function is
   * called, like a slow connection.
   */
  pause(route: Route) {
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pause = { resumed, route };
    this.pauses.push(pause);
    return () => {
      this.pauses = this.pauses.filter((other) => other !== pause);
      resume();
    };
  }

  /** Makes the next request to `route` fail. */
  failNext(route: Route, failure: Failure) {
    this.failures.push({ failure, route });
  }

  count(route: Route) {
    return this.requests.filter((request) => request.route === route).length;
  }

  fetch: PublicApiFetch = async (url, init) => {
    const { pathname } = new URL(url);
    const route = `${init.method ?? "GET"} ${pathname}`;
    const authorization = new Headers(init.headers).get("Authorization");
    const body =
      typeof init.body === "string" && init.body !== ""
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    this.requests.push({ authorization, body, route });

    // Answers on a later macrotask, like a network response.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.pauses.find((pause) => pause.route === route)?.resumed;

    const queued = this.failures.find((failure) => failure.route === route);
    if (queued) {
      this.failures = this.failures.filter((other) => other !== queued);
      const { failure } = queued;
      if (failure === "lost") {
        this.answer(route, authorization, body);
        throw new TypeError("Network request failed");
      }
      if (failure === "network") {
        throw new TypeError("Network request failed");
      }
      const retryAfterSeconds = failure.retryAfterSeconds ?? 30;
      return failure.status === 429
        ? error(429, failure.code ?? "rate_limited", "Too many requests", {
            "Retry-After": String(retryAfterSeconds),
          })
        : error(
            failure.status,
            failure.code ?? "internal_error",
            "Something went wrong"
          );
    }

    return this.answer(route, authorization, body);
  };

  private answer(route: string, authorization: string | null, body: unknown) {
    if (authorization !== `Bearer ${FAKE_SESSION_TOKEN}`) {
      return error(401, "unauthorized", "Unauthorized");
    }
    const response = answer(route, body);
    if (response === null) {
      this.unhandled.push(route);
      return error(501, "not_implemented", `Fake Public API: no ${route}`);
    }
    return response;
  }
}

export const fakePublicApi = new FakePublicApi();
