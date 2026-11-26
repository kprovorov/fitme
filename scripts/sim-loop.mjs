/// <reference types="node" />
/// <reference lib="es2023.array" />

// The parts of scripts/sim-loop.sh that aren't plain commands, in Node so
// `pnpm test:scripts` covers them (and out of heredocs: bash 3.2, see AGENTS.md
// Shell). Every subcommand prints its answer on stdout:
//
//   free-port                        a TCP port nothing listens on
//   spawn <log> <cmd> [args …]       starts cmd detached, in its own process
//                                    group, output appended to <log>; its pid
//   alive <pid>                      exits 0 while that process runs
//   stop <pid>                       ends its process group (TERM, then KILL)
//   find-sim <name>                  stdin `simctl list --json`: "<udid> <state>"
//   pick-sim-type                    stdin the same: "<device type> <runtime>"
//   udids                            stdin the same: every simulator's UDID
//   is-dev-client <app>              exits 0 for a dev client .app
//   state <file> get <key>           a value of the state file (empty if unset)
//   state <file> set <key=value> …   writes values into it (empty removes one)
//   wait-http <url> <seconds> [pid]  exits 0 once the URL answers 2xx
//   seed <state file> <api url> <worktree name>
//                                    the worktree's +clerk_test User, then a
//                                    Profile, a Plan and a finished Workout
//                                    Session through the Public API
//   delete-user <state file>         deletes that Clerk User
//
// seed and delete-user read CLERK_SECRET_KEY (the development instance's,
// sk_test_…) from the environment: run them under scripts/with-dev-env.sh Mcp.
// Nothing here prints the key.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CLERK_API_URL = "https://api.clerk.com/v1";
const HTTP_TIMEOUT_MS = 15_000;
const STOP_GRACE_MS = 5000;
const POLL_MS = 1000;
const IPHONE_GENERATION = /^iPhone (?<generation>\d+)/u;

/**
 * @param {unknown} value A parsed JSON value.
 * @param {string} key The property to read.
 * @returns {unknown} The property, or undefined when there's none.
 */
export const field = (value, key) => {
  if (!(value instanceof Object)) {
    return;
  }

  /** @type {Map<string, unknown>} */
  const entries = new Map(Object.entries(value));

  return entries.get(key);
};

/**
 * @param {unknown} value A parsed JSON value.
 * @returns {string} The value when it's text, otherwise empty.
 */
const text = (value) => {
  try {
    return String.prototype.valueOf.call(value);
  } catch {
    return "";
  }
};

/**
 * @param {unknown} value A parsed JSON value.
 * @returns {unknown[]} The value when it's an array, otherwise none.
 */
const list = (value) =>
  /** @type {unknown[]} */ (Array.isArray(value) ? value : []);

/** @returns {Promise<number>} A port the OS just handed out and released. */
export const freePort = () =>
  // oxlint-disable-next-line promise/avoid-new -- net.Server's listen and close take callbacks.
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = Number(field(server.address(), "port"));
      server.close(() => resolve(port));
    });
  });

/**
 * @param {number} pid A process id.
 * @returns {boolean} Whether the process is running.
 */
export const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

/**
 * @param {number} pid A process group leader's id.
 * @param {NodeJS.Signals} name The signal.
 */
const signalGroup = (pid, name) => {
  try {
    process.kill(-pid, name);
  } catch {
    // Already gone.
  }
};

/**
 * @param {number} pid A process id.
 * @param {number} deadline When to stop waiting (epoch ms).
 * @returns {Promise<void>} Once it has exited or the deadline passed.
 */
const waitForExit = async (pid, deadline) => {
  if (!isAlive(pid) || Date.now() >= deadline) {
    return;
  }

  await sleep(200);
  await waitForExit(pid, deadline);
};

/**
 * Ends a process group `spawn` started: TERM, then KILL after a grace period.
 *
 * @param {number} pid The group leader's id.
 */
export const stopGroup = async (pid) => {
  if (!isAlive(pid)) {
    return;
  }

  signalGroup(pid, "SIGTERM");
  await waitForExit(pid, Date.now() + STOP_GRACE_MS);
  signalGroup(pid, "SIGKILL");
};

/**
 * @typedef {{ udid: string, name: string, state: string }} Simulator
 */

/**
 * @param {unknown} simctlList `xcrun simctl list --json` output, parsed.
 * @returns {Simulator[]} Every available simulator.
 */
const simulators = (simctlList) => {
  const devices = field(simctlList, "devices");

  return Object.values(devices instanceof Object ? devices : {})
    .flatMap(list)
    .filter((device) => field(device, "isAvailable") !== false)
    .map((device) => ({
      name: text(field(device, "name")),
      state: text(field(device, "state")),
      udid: text(field(device, "udid")),
    }));
};

/**
 * @param {unknown} simctlList `xcrun simctl list --json` output, parsed.
 * @param {string} name The simulator's name.
 * @returns {Simulator | undefined} The simulator with that name.
 */
export const findSimulator = (simctlList, name) =>
  simulators(simctlList).find((device) => device.name === name);

/**
 * @param {unknown} simctlList `xcrun simctl list --json` output, parsed.
 * @returns {string[]} Every available simulator's UDID.
 */
export const simulatorUdids = (simctlList) =>
  simulators(simctlList).map((device) => device.udid);

/**
 * @param {string} version A dotted version, such as "27.2".
 * @returns {number[]} Its numeric parts.
 */
const versionParts = (version) =>
  version.split(".").map((part) => Math.trunc(Number(part)) || 0);

/**
 * @param {number[]} a A version's parts.
 * @param {number[]} b Another version's parts.
 * @returns {number} Negative when a is older, positive when it's newer.
 */
const compareVersions = (a, b) => {
  const length = Math.max(a.length, b.length);

  const index = Array.from({ length }, (_, i) => i).find(
    (i) => (a[i] ?? 0) !== (b[i] ?? 0)
  );

  return index === undefined ? 0 : (a[index] ?? 0) - (b[index] ?? 0);
};

/**
 * @param {unknown} runtime A runtime of `simctl list --json`.
 * @returns {string | undefined} The newest Pro iPhone it supports (any iPhone
 *   without one).
 */
const iphoneOf = (runtime) => {
  const iphones = list(field(runtime, "supportedDeviceTypes"))
    .map((type) => ({
      family: text(field(type, "productFamily")),
      identifier: text(field(type, "identifier")),
      name: text(field(type, "name")),
    }))
    .filter(
      (type) => type.family === "iPhone" || type.name.startsWith("iPhone")
    );

  const pros = iphones.filter((type) => type.name.endsWith(" Pro"));

  // simctl's order isn't a promise: take the highest generation by name.
  return (pros.length > 0 ? pros : iphones)
    .map((type) => ({
      generation: Number(
        IPHONE_GENERATION.exec(type.name)?.groups?.generation ?? 0
      ),
      identifier: type.identifier,
    }))
    .toSorted((a, b) => b.generation - a.generation)
    .at(0)?.identifier;
};

/**
 * The newest available iOS runtime and the newest Pro iPhone it supports, for
 * a new per-worktree simulator.
 *
 * @param {unknown} simctlList `xcrun simctl list --json` output, parsed.
 * @returns {{ deviceType: string, runtime: string } | undefined} The choice,
 *   or none when no iOS runtime has an iPhone.
 */
export const pickSimulatorType = (simctlList) =>
  list(field(simctlList, "runtimes"))
    .filter(
      (runtime) =>
        field(runtime, "isAvailable") !== false &&
        (field(runtime, "platform") === "iOS" ||
          text(field(runtime, "identifier")).includes(".iOS-"))
    )
    .toSorted((a, b) =>
      compareVersions(
        versionParts(text(field(b, "version"))),
        versionParts(text(field(a, "version")))
      )
    )
    .map((runtime) => ({
      deviceType: iphoneOf(runtime),
      runtime: text(field(runtime, "identifier")),
    }))
    .find(
      /** @returns {choice is { deviceType: string, runtime: string }} The choice, when it has an iPhone. */
      (choice) => choice.deviceType !== undefined
    );

/**
 * A dev client build (Metro serves its JS) rather than a Release one, whose JS
 * is baked into main.jsbundle and never loads this worktree's.
 *
 * @param {string} app A .app directory.
 * @returns {boolean} Whether it's a dev client.
 */
export const isDevClient = (app) =>
  fs.existsSync(path.join(app, "EXDevLauncher.bundle")) &&
  !fs.existsSync(path.join(app, "main.jsbundle"));

/**
 * @param {string} file The state file.
 * @returns {Map<string, string>} Its values (none for a missing or broken one).
 */
export const readState = (file) => {
  try {
    /** @type {unknown} */
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));

    return new Map(
      Object.entries(data instanceof Object ? data : {}).map(([key, value]) => [
        key,
        text(value),
      ])
    );
  } catch {
    return new Map();
  }
};

/**
 * Writes values into the state file (owner-only), an empty one removing its key.
 *
 * @param {string} file The state file.
 * @param {Record<string, string>} values The values to write.
 * @returns {Map<string, string>} The state as written.
 */
export const writeState = (file, values) => {
  const state = readState(file);

  for (const [key, value] of Object.entries(values)) {
    if (value === "") {
      state.delete(key);
    } else {
      state.set(key, value);
    }
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify(Object.fromEntries(state), null, 2)}\n`,
    { mode: 0o600 }
  );

  return state;
};

/**
 * The worktree's test User's address: one per worktree, so parallel worktrees
 * never sign in as each other. `+clerk_test` makes Clerk's test mode accept
 * the code 424242.
 *
 * @param {string} worktreeName The worktree directory's name.
 * @returns {string} The address.
 */
export const testEmail = (worktreeName) => {
  const slug =
    worktreeName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .slice(0, 30)
      .replace(/-+$/u, "") || "worktree";

  // The slug is cut short; the hash keeps two long names that share their
  // first 30 characters apart.
  const hash = createHash("sha256").update(worktreeName).digest("hex");

  return `sim-loop-${slug}-${hash.slice(0, 8)}+clerk_test@fitmeproject.com`;
};

const SEED_SET = {
  reps_recommended: 10,
  rest_recommended: 90,
  weight_recommended: 20,
};

/**
 * @param {string} name The Workout's name.
 * @param {string[]} slugs Its Exercises.
 * @returns {object} A `POST /v1/plans` Workout.
 */
const seedWorkout = (name, slugs) => ({
  description: "",
  exercises: slugs.map((slug) => ({
    exercise_slug: slug,
    sets: [SEED_SET, SEED_SET, SEED_SET],
  })),
  name,
});

/**
 * The `POST /v1/plans` body of the seeded Plan: the Exercises split over two
 * Workouts (one when there's a single Exercise), three sets each.
 *
 * @param {string[]} slugs Exercise slugs the Public API serves.
 * @returns {object} The body.
 */
export const seedPlanBody = (slugs) => {
  if (slugs.length === 0) {
    throw new Error(
      "GET /v1/exercises answered no Exercise to seed a Plan with"
    );
  }

  const half = Math.ceil(slugs.length / 2);
  const second = slugs.slice(half);
  const workouts = [seedWorkout("Workout A", slugs.slice(0, half))];

  if (second.length > 0) {
    workouts.push(seedWorkout("Workout B", second));
  }

  return {
    activate: true,
    description: "Seeded by scripts/sim-loop.sh",
    experience_level: "intermediate",
    frequency: workouts.length,
    goal: "muscle-gain",
    name: "Sim Loop Plan",
    place: "gym",
    workout_duration: 60,
    workouts,
  };
};

export const SEED_PROFILE = {
  age: 30,
  gender: "male",
  height: 180,
  measurement_system: "metric",
  weight: 80,
};

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @param {Fetch} fetchFn The fetch to send it with.
 * @param {string} url The URL.
 * @param {{ method: string, token: string, body?: unknown }} request The request.
 * @returns {Promise<{ status: number, data: unknown }>} The answer, its body
 *   parsed when it's JSON.
 */
const sendJson = async (fetchFn, url, { method, token, body }) => {
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${token}` };

  /** @type {RequestInit} */
  const init = {
    headers,
    method,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetchFn(url, init);
  const raw = await response.text();
  /** @type {unknown} */
  let data = raw;

  try {
    data = raw === "" ? null : JSON.parse(raw);
  } catch {
    // Not JSON: keep the text for the error message.
  }

  return { data, status: response.status };
};

/**
 * @param {{ status: number, data: unknown }} answer An answer.
 * @param {string} what The request, for the error.
 * @returns {unknown} Its body, when the answer is a 2xx.
 */
const okData = (answer, what) => {
  if (answer.status < 200 || answer.status >= 300) {
    throw new Error(
      `${what} answered ${answer.status}: ${JSON.stringify(answer.data)}`
    );
  }

  return answer.data;
};

/**
 * @param {Fetch} fetchFn The fetch to call Clerk with.
 * @param {string} secretKey The development instance's secret key.
 */
const clerkClient = (fetchFn, secretKey) => {
  /**
   * @param {string} method The HTTP method.
   * @param {string} route The Backend API route.
   * @param {unknown} [body] The JSON body.
   * @returns {Promise<{ status: number, data: unknown }>} The answer.
   */
  const request = (method, route, body) =>
    sendJson(fetchFn, `${CLERK_API_URL}${route}`, {
      body,
      method,
      token: secretKey,
    });

  return {
    /**
     * @param {string} method The HTTP method.
     * @param {string} route The Backend API route.
     * @param {unknown} [body] The JSON body.
     * @returns {Promise<unknown>} The body of a 2xx answer.
     */
    ok: async (method, route, body) =>
      okData(await request(method, route, body), `Clerk ${method} ${route}`),
    request,
  };
};

/**
 * @param {string | undefined} secretKey CLERK_SECRET_KEY.
 * @returns {string} It, once it's a development instance's key.
 */
const requireDevKey = (secretKey) => {
  if (secretKey === undefined || secretKey === "") {
    throw new Error(
      "CLERK_SECRET_KEY is missing: run under scripts/with-dev-env.sh Mcp"
    );
  }

  // Test Users and Backend API sessions only ever on the development instance.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a development key (sk_test_…)");
  }

  return secretKey;
};

/**
 * Finds the worktree's test User (by the id the state file kept, then by its
 * address) or creates it, with a known password and no Device Trust code at
 * sign-in (`bypass_client_trust`).
 *
 * @param {ReturnType<typeof clerkClient>} clerk The Clerk client.
 * @param {Map<string, string>} state The state file's values.
 * @param {string} email The test User's address.
 * @returns {Promise<{ created: boolean, password: string, userId: string }>}
 *   The User.
 */
const ensureUser = async (clerk, state, email) => {
  const password =
    state.get("password") || `sim-${randomBytes(12).toString("hex")}`;

  const settings = {
    bypass_client_trust: true,
    password,
    skip_password_checks: true,
  };

  const keptId = state.get("userId") ?? "";

  const kept =
    keptId === "" ? undefined : await clerk.request("GET", `/users/${keptId}`);

  // The kept User only while it still has this address (the address scheme
  // can change).
  const keptEmails = list(field(kept?.data, "email_addresses")).map((entry) =>
    text(field(entry, "email_address"))
  );

  const found =
    kept?.status === 200 && keptEmails.includes(email)
      ? keptId
      : text(
          field(
            list(
              await clerk.ok(
                "GET",
                `/users?email_address=${encodeURIComponent(email)}`
              )
            ).at(0),
            "id"
          )
        );

  if (found !== "") {
    await clerk.ok("PATCH", `/users/${found}`, settings);

    return { created: false, password, userId: found };
  }

  const user = await clerk.ok("POST", "/users", {
    email_address: [email],
    first_name: "Sim",
    last_name: "Loop",
    ...settings,
  });

  return { created: true, password, userId: text(field(user, "id")) };
};

/**
 * A Public API client acting as the User, through a Backend API session (the
 * development instance only), its token minted again on a 401.
 *
 * @param {Fetch} fetchFn The fetch to call with.
 * @param {ReturnType<typeof clerkClient>} clerk The Clerk client.
 * @param {string} apiUrl The Public API's base URL.
 * @param {string} userId The User to act as.
 */
const apiClient = async (fetchFn, clerk, apiUrl, userId) => {
  const sessionId = text(
    field(await clerk.ok("POST", "/sessions", { user_id: userId }), "id")
  );

  const mint = async () =>
    text(
      field(await clerk.ok("POST", `/sessions/${sessionId}/tokens`, {}), "jwt")
    );

  let token = await mint();

  /**
   * @param {string} method The HTTP method.
   * @param {string} route The `/v1` route.
   * @param {unknown} [body] The JSON body.
   * @returns {Promise<unknown>} The body of a 2xx answer.
   */
  const call = async (method, route, body) => {
    const url = `${apiUrl}${route}`;
    let answer = await sendJson(fetchFn, url, { body, method, token });

    if (answer.status === 401) {
      token = await mint();
      answer = await sendJson(fetchFn, url, { body, method, token });
    }

    return okData(answer, `${method} ${route}`);
  };

  return {
    call,
    end: async () => {
      await clerk.request("POST", `/sessions/${sessionId}/revoke`, {});
    },
  };
};

/**
 * Logs every set of a started Workout Session at its targets, then finishes it.
 *
 * @param {(method: string, route: string, body?: unknown) => Promise<unknown>} call
 *   The Public API client's call.
 * @param {unknown} session The started Workout Session.
 */
const logAndFinish = async (call, session) => {
  const sets = list(field(session, "exercises")).flatMap((exercise) =>
    list(field(exercise, "sets"))
  );

  for (const set of sets) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one set at a time, as a User logs them.
    await call("PATCH", `/v1/workout-session-sets/${text(field(set, "id"))}`, {
      reps_completed: Number(field(set, "reps_recommended")) || 10,
      weight_completed: Number(field(set, "weight_recommended")) || 20,
    });
  }

  await call(
    "POST",
    `/v1/workout-sessions/${text(field(session, "id"))}/finish`
  );
};

/**
 * The Workout Session to finish for History: the one already open (a seed
 * that failed partway, or one started in the app; a User has at most one,
 * so starting another would answer 409), else a new one of the Plan's first
 * Workout.
 *
 * @param {(method: string, route: string, body?: unknown) => Promise<unknown>} call
 *   The Public API client's call.
 * @param {unknown} plan The active Plan.
 * @returns {Promise<unknown>} The Workout Session in full.
 */
const openOrStartSession = async (call, plan) => {
  const open = await call(
    "GET",
    "/v1/workout-sessions?status=in_progress&limit=1"
  );

  const openId = text(field(list(field(open, "data")).at(0), "id"));

  if (openId !== "") {
    return field(await call("GET", `/v1/workout-sessions/${openId}`), "data");
  }

  const workoutId = text(field(list(field(plan, "workouts")).at(0), "id"));

  return field(
    await call("POST", "/v1/workout-sessions", { workout_id: workoutId }),
    "data"
  );
};

/**
 * Seeds the User's data, each part only when the User has none: a Profile (or
 * the app opens on onboarding), an active Plan, and one finished Workout
 * Session (so History has a row). All through the Public API, so the rows have
 * the shape the app writes.
 *
 * @param {(method: string, route: string, body?: unknown) => Promise<unknown>} call
 *   The Public API client's call.
 * @returns {Promise<string[]>} What it seeded.
 */
export const seedData = async (call) => {
  const seeded = [];

  if (field(await call("GET", "/v1/profile"), "data") === null) {
    await call("PUT", "/v1/profile", SEED_PROFILE);
    seeded.push("Profile");
  }

  let plan = field(await call("GET", "/v1/plans/active"), "data");

  if (plan === null || plan === undefined) {
    const exercises = await call("GET", "/v1/exercises?limit=6");

    const slugs = list(field(exercises, "data")).map((exercise) =>
      text(field(exercise, "slug"))
    );

    plan = field(await call("POST", "/v1/plans", seedPlanBody(slugs)), "data");
    seeded.push("Plan");
  }

  const finished = await call(
    "GET",
    "/v1/workout-sessions?status=finished&limit=1"
  );

  if (Number(field(finished, "total")) === 0) {
    await logAndFinish(call, await openOrStartSession(call, plan));
    seeded.push("Workout Session");
  }

  return seeded;
};

/**
 * @param {{ fetchFn: Fetch, secretKey: string | undefined, stateFile: string, apiUrl: string, email: string }} options
 *   Where to seed, as whom.
 * @returns {Promise<{ createdUser: boolean, email: string, seeded: string[] }>}
 *   What it did.
 */
export const seed = async ({
  fetchFn,
  secretKey,
  stateFile,
  apiUrl,
  email,
}) => {
  const clerk = clerkClient(fetchFn, requireDevKey(secretKey));
  const user = await ensureUser(clerk, readState(stateFile), email);
  writeState(stateFile, {
    email,
    password: user.password,
    userId: user.userId,
  });

  const api = await apiClient(fetchFn, clerk, apiUrl, user.userId);

  try {
    return {
      createdUser: user.created,
      email,
      seeded: await seedData(api.call),
    };
  } finally {
    await api.end();
  }
};

/**
 * @param {{ fetchFn: Fetch, secretKey: string | undefined, stateFile: string }} options
 *   The state file naming the User.
 * @returns {Promise<boolean>} Whether there was a User to delete.
 */
export const deleteUser = async ({ fetchFn, secretKey, stateFile }) => {
  const userId = readState(stateFile).get("userId") ?? "";

  if (userId === "") {
    return false;
  }

  const clerk = clerkClient(fetchFn, requireDevKey(secretKey));
  const answer = await clerk.request("DELETE", `/users/${userId}`);

  if (answer.status !== 200 && answer.status !== 404) {
    throw new Error(`Clerk DELETE /users/${userId} answered ${answer.status}`);
  }

  writeState(stateFile, { email: "", password: "", userId: "" });

  return true;
};

/**
 * @param {string} url The URL to poll.
 * @param {number} deadline When to give up (epoch ms).
 * @param {number} [pid] Gives up early once this process has exited.
 * @returns {Promise<boolean>} Whether it answered 2xx in time.
 */
export const waitForHttp = async (url, deadline, pid) => {
  if (Date.now() >= deadline || (pid !== undefined && !isAlive(pid))) {
    return false;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });

    if (response.ok) {
      return true;
    }
  } catch {
    // Not up yet.
  }

  await sleep(POLL_MS);

  return await waitForHttp(url, deadline, pid);
};

/** @returns {unknown} stdin, parsed as JSON. */
const stdinJson = () => JSON.parse(fs.readFileSync(0, "utf-8"));

/**
 * @param {string[]} pairs `key=value` arguments.
 * @returns {Record<string, string>} Them as an object.
 */
const parsePairs = (pairs) =>
  Object.fromEntries(
    pairs.map((pair) => {
      const at = pair.indexOf("=");

      return [pair.slice(0, at), pair.slice(at + 1)];
    })
  );

/** @type {Record<string, (args: string[]) => Promise<number> | number>} */
const COMMANDS = {
  alive: ([pid]) => (isAlive(Number(pid)) ? 0 : 1),
  "delete-user": async ([stateFile = ""]) => {
    const deleted = await deleteUser({
      fetchFn: fetch,
      secretKey: process.env.CLERK_SECRET_KEY,
      stateFile,
    });

    console.log(deleted ? "deleted the test User" : "no test User to delete");

    return 0;
  },
  "find-sim": ([name = ""]) => {
    const device = findSimulator(stdinJson(), name);

    if (device) {
      console.log(`${device.udid} ${device.state}`);
    }

    return 0;
  },
  "free-port": async () => {
    console.log(await freePort());

    return 0;
  },
  "is-dev-client": ([app = ""]) => (app !== "" && isDevClient(app) ? 0 : 1),
  "pick-sim-type": () => {
    const picked = pickSimulatorType(stdinJson());

    if (!picked) {
      throw new Error("no available iOS runtime with an iPhone to simulate");
    }

    console.log(`${picked.deviceType} ${picked.runtime}`);

    return 0;
  },
  seed: async ([stateFile = "", apiUrl = "", worktreeName = ""]) => {
    if (stateFile === "" || apiUrl === "" || worktreeName === "") {
      throw new Error("usage: seed <state file> <api url> <worktree name>");
    }

    const result = await seed({
      apiUrl,
      email: testEmail(worktreeName),
      fetchFn: fetch,
      secretKey: process.env.CLERK_SECRET_KEY,
      stateFile,
    });

    const seeded =
      result.seeded.length > 0 ? result.seeded.join(", ") : "nothing new";

    console.log(
      `test User ${result.email} (${result.createdUser ? "created" : "reused"}), seeded: ${seeded}`
    );

    return 0;
  },
  spawn: ([log = "", cmd = "", ...cmdArgs]) => {
    if (log === "" || cmd === "") {
      throw new Error("usage: spawn <log> <cmd> [args …]");
    }

    fs.mkdirSync(path.dirname(log), { recursive: true });
    const out = fs.openSync(log, "a");

    const child = spawn(cmd, cmdArgs, {
      detached: true,
      stdio: ["ignore", out, out],
    });

    child.unref();
    console.log(child.pid);

    return 0;
  },
  state: ([file = "", action = "", ...rest]) => {
    if (action === "get") {
      console.log(readState(file).get(rest[0] ?? "") ?? "");

      return 0;
    }

    if (action === "set") {
      writeState(file, parsePairs(rest));

      return 0;
    }

    throw new Error("usage: state <file> get <key> | set <key=value> …");
  },
  stop: async ([pid]) => {
    await stopGroup(Number(pid));

    return 0;
  },
  udids: () => {
    for (const udid of simulatorUdids(stdinJson())) {
      console.log(udid);
    }

    return 0;
  },
  "wait-http": async ([url = "", seconds = "60", pid]) =>
    (await waitForHttp(
      url,
      Date.now() + Number(seconds) * 1000,
      pid === undefined ? undefined : Number(pid)
    ))
      ? 0
      : 1,
};

if (process.argv[1] === import.meta.filename) {
  const [command = "", ...args] = process.argv.slice(2);
  const run = COMMANDS[command];

  try {
    if (!run) {
      throw new Error(`unknown command: ${command || "(none)"}`);
    }

    process.exitCode = await run(args);
  } catch (error) {
    console.error(
      `sim-loop: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
