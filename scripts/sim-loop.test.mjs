/// <reference types="node" />

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  deleteUser,
  findSimulator,
  freePort,
  isDevClient,
  pickSimulatorType,
  readState,
  seed,
  seedData,
  seedPlanBody,
  simulatorUdids,
  testEmail,
  writeState,
} from "./sim-loop.mjs";

/** @type {string[]} */
const tempDirs = [];

/** @param {string} prefix Temporary directory name prefix. */
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);

  return dir;
};

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

const SIMCTL = {
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
      {
        isAvailable: false,
        name: "Fitme sim-loop broken",
        state: "Shutdown",
        udid: "OLD",
      },
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-27-2": [
      {
        isAvailable: true,
        name: "Fitme sim-loop fit-1",
        state: "Booted",
        udid: "AAA",
      },
      {
        isAvailable: true,
        name: "Fitme sim-loop fit-2",
        state: "Shutdown",
        udid: "BBB",
      },
    ],
  },
  runtimes: [
    {
      identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0",
      isAvailable: true,
      platform: "iOS",
      supportedDeviceTypes: [
        {
          identifier: "type.iPhone-25-Pro",
          name: "iPhone 25 Pro",
          productFamily: "iPhone",
        },
      ],
      version: "26.0",
    },
    {
      identifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
      isAvailable: true,
      platform: "iOS",
      supportedDeviceTypes: [
        {
          identifier: "type.iPhone-17-Pro",
          name: "iPhone 17 Pro",
          productFamily: "iPhone",
        },
        {
          identifier: "type.iPhone-18-Pro",
          name: "iPhone 18 Pro",
          productFamily: "iPhone",
        },
        {
          identifier: "type.iPhone-18-Pro-Max",
          name: "iPhone 18 Pro Max",
          productFamily: "iPhone",
        },
        {
          identifier: "type.iPad-Pro",
          name: "iPad Pro",
          productFamily: "iPad",
        },
      ],
      version: "27.2",
    },
    {
      identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-12-0",
      isAvailable: true,
      platform: "watchOS",
      supportedDeviceTypes: [],
      version: "30.0",
    },
  ],
};

void describe("simulators", () => {
  void test("finds the worktree's simulator by name, never an unavailable one", () => {
    assert.deepEqual(findSimulator(SIMCTL, "Fitme sim-loop fit-2"), {
      name: "Fitme sim-loop fit-2",
      state: "Shutdown",
      udid: "BBB",
    });
    assert.equal(findSimulator(SIMCTL, "Fitme sim-loop broken"), undefined);
    assert.equal(findSimulator({}, "Fitme sim-loop fit-1"), undefined);
    assert.deepEqual(simulatorUdids(SIMCTL), ["AAA", "BBB"]);
  });

  void test("picks the newest Pro iPhone of the newest iOS runtime", () => {
    assert.deepEqual(pickSimulatorType(SIMCTL), {
      deviceType: "type.iPhone-18-Pro",
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
    });
    assert.equal(pickSimulatorType({ runtimes: [] }), undefined);
  });
});

void describe("isDevClient", () => {
  const app = (/** @type {string[]} */ entries) => {
    const dir = path.join(tempDir("fitme-app-"), "FitmeProject.app");
    fs.mkdirSync(dir);

    for (const entry of entries) {
      fs.mkdirSync(path.join(dir, entry));
    }

    return dir;
  };

  void test("a dev client has the dev launcher and no baked-in bundle", () => {
    assert.equal(isDevClient(app(["EXDevLauncher.bundle"])), true);
    assert.equal(
      isDevClient(app(["EXDevLauncher.bundle", "main.jsbundle"])),
      false
    );
    assert.equal(isDevClient(app(["main.jsbundle"])), false);
  });
});

void describe("state", () => {
  void test("writes values owner-only, merges them and drops emptied ones", () => {
    const file = path.join(tempDir("fitme-state-"), "nested/state.json");
    writeState(file, { api_port: "4000", api_pid: "12" });
    writeState(file, { api_pid: "", metro_port: "4001" });

    assert.deepEqual(Object.fromEntries(readState(file)), {
      api_port: "4000",
      metro_port: "4001",
    });
    assert.equal(fs.statSync(file).mode % 0o1000, 0o600);
  });

  void test("a missing or broken file reads as empty", () => {
    const dir = tempDir("fitme-state-");
    fs.writeFileSync(path.join(dir, "broken.json"), "{");

    assert.equal(readState(path.join(dir, "missing.json")).size, 0);
    assert.equal(readState(path.join(dir, "broken.json")).size, 0);
  });
});

void test("freePort answers a port that can be listened on", async () => {
  const port = await freePort();
  const server = net.createServer();
  await new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(undefined));
  });
  server.close();

  assert.ok(port > 0);
});

void test("testEmail is a +clerk_test address per worktree", () => {
  assert.equal(
    testEmail("fit-844-one-script-to-s-4f5b20bfcc4ece94"),
    "sim-loop-fit-844-one-script-to-s-4f5b20bfcc4ece94+clerk_test@fitmeproject.com"
  );
  assert.equal(
    testEmail("Main Checkout!"),
    "sim-loop-main-checkout+clerk_test@fitmeproject.com"
  );
  assert.equal(
    testEmail("---"),
    "sim-loop-worktree+clerk_test@fitmeproject.com"
  );
});

void describe("seedPlanBody", () => {
  void test("splits the Exercises over two Workouts, three sets each", () => {
    const body = seedPlanBody(["a", "b", "c"]);

    assert.equal(body.frequency, 2);
    assert.equal(body.activate, true);
    assert.deepEqual(
      body.workouts.map((workout) =>
        workout.exercises.map((exercise) => exercise.exercise_slug)
      ),
      [["a", "b"], ["c"]]
    );
    assert.equal(body.workouts[0]?.exercises[0]?.sets.length, 3);
  });

  void test("one Exercise is one Workout, none is an error", () => {
    assert.equal(seedPlanBody(["a"]).workouts.length, 1);
    assert.throws(() => seedPlanBody([]), /no Exercise/u);
  });
});

/**
 * A fake Public API over one User's rows, answering like `/v1`.
 *
 * @param {{ profile?: boolean, plan?: boolean, sessions?: number }} [start] What the User already has.
 */
const fakeApi = (start = {}) => {
  /** @type {string[]} */
  const calls = [];
  const plan = { id: "plan", workouts: [{ id: "w1" }, { id: "w2" }] };
  let hasProfile = start.profile ?? false;
  let hasPlan = start.plan ?? false;
  let sessions = start.sessions ?? 0;
  /** @type {unknown} */
  let createdPlan;

  /**
   * @param {string} method The HTTP method.
   * @param {string} route The route.
   * @param {unknown} [body] The body.
   * @returns {Promise<unknown>} The answer's body.
   */
  const call = (method, route, body) => {
    calls.push(`${method} ${route}`);

    switch (`${method} ${route}`) {
      case "GET /v1/profile": {
        return { data: hasProfile ? {} : null };
      }

      case "PUT /v1/profile": {
        hasProfile = true;

        return { data: {} };
      }

      case "GET /v1/plans/active": {
        return { data: hasPlan ? plan : null };
      }

      case "GET /v1/exercises?limit=6": {
        return { data: [{ slug: "a" }, { slug: "b" }] };
      }

      case "POST /v1/plans": {
        hasPlan = true;
        createdPlan = body;

        return { data: plan };
      }

      case "GET /v1/workout-sessions?limit=1": {
        return { total: sessions };
      }

      case "POST /v1/workout-sessions": {
        assert.deepEqual(body, { workout_id: "w1" });

        return {
          data: {
            exercises: [
              {
                sets: [
                  { id: "s1", reps_recommended: 8, weight_recommended: 40 },
                ],
              },
              {
                sets: [
                  { id: "s2", reps_recommended: 10, weight_recommended: 0 },
                ],
              },
            ],
            id: "session",
          },
        };
      }

      case "PATCH /v1/workout-session-sets/s1": {
        assert.deepEqual(body, { reps_completed: 8, weight_completed: 40 });

        return {};
      }

      case "PATCH /v1/workout-session-sets/s2": {
        return {};
      }

      case "POST /v1/workout-sessions/session/finish": {
        sessions += 1;

        return {};
      }

      default: {
        throw new Error(`unexpected ${method} ${route}`);
      }
    }
  };

  return { call, calls, createdPlan: () => createdPlan };
};

void describe("seedData", () => {
  void test("seeds a Profile, a Plan and a finished Workout Session for a new User", async () => {
    const api = fakeApi();

    assert.deepEqual(await seedData(api.call), [
      "Profile",
      "Plan",
      "Workout Session",
    ]);
    assert.ok(api.calls.includes("PATCH /v1/workout-session-sets/s2"));
    assert.equal(api.calls.at(-1), "POST /v1/workout-sessions/session/finish");
  });

  void test("a rerun writes nothing", async () => {
    const api = fakeApi();
    await seedData(api.call);
    const writes = api.calls.length;

    assert.deepEqual(await seedData(api.call), []);
    assert.ok(
      api.calls.slice(writes).every((call) => call.startsWith("GET ")),
      api.calls.slice(writes).join(", ")
    );
  });

  void test("leaves what the User already has alone", async () => {
    const api = fakeApi({ plan: true, profile: true, sessions: 3 });

    assert.deepEqual(await seedData(api.call), []);
  });
});

/**
 * A fake Clerk Backend API and Public API behind one fetch.
 *
 * @param {{ existingUserId?: string }} [options] A User Clerk already has at the address.
 */
const fakeFetch = (options = {}) => {
  /** @type {{ method: string, url: string, body: unknown, auth: string }[]} */
  const requests = [];
  const users = new Set(options.existingUserId ? [options.existingUserId] : []);

  /** @type {(url: string, init?: RequestInit) => Promise<Response>} */
  const fetchFn = async (url, init = {}) => {
    await Promise.resolve();
    const method = init.method ?? "GET";

    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;

    const auth = new Headers(init.headers).get("Authorization") ?? "";
    requests.push({ auth, body, method, url });

    const json = (/** @type {number} */ status, /** @type {unknown} */ data) =>
      Response.json(data, { status });

    const route = url.replace("https://api.clerk.com/v1", "clerk:");

    if (route.startsWith("clerk:/users?email_address=")) {
      return json(
        200,
        [...users].map((id) => ({ id }))
      );
    }

    if (method === "POST" && route === "clerk:/users") {
      users.add("user_new");

      return json(200, { id: "user_new" });
    }

    if (route.startsWith("clerk:/users/")) {
      const id = route.slice("clerk:/users/".length);

      if (!users.has(id)) {
        return json(404, { errors: [] });
      }

      if (method === "DELETE") {
        users.delete(id);
      }

      return json(200, { id });
    }

    if (route === "clerk:/sessions") {
      return json(200, { id: "sess_1" });
    }

    if (route === "clerk:/sessions/sess_1/tokens") {
      return json(200, { jwt: "jwt" });
    }

    if (route === "clerk:/sessions/sess_1/revoke") {
      return json(200, {});
    }

    // The Public API: the User has everything already.
    if (url.endsWith("/v1/profile")) {
      return json(200, { data: {} });
    }

    if (url.endsWith("/v1/plans/active")) {
      return json(200, { data: { workouts: [] } });
    }

    if (url.endsWith("/v1/workout-sessions?limit=1")) {
      return json(200, { total: 1 });
    }

    return json(500, { error: `unexpected ${method} ${url}` });
  };

  return { fetchFn, requests };
};

void describe("seed", () => {
  void test("refuses anything but a development key", async () => {
    const stateFile = path.join(tempDir("fitme-seed-"), "state.json");
    const { fetchFn, requests } = fakeFetch();
    const options = { apiUrl: "http://api", email: "e", fetchFn, stateFile };

    await assert.rejects(
      seed({ ...options, secretKey: undefined }),
      /missing/u
    );
    await assert.rejects(
      seed({ ...options, secretKey: "sk_live_x" }),
      /development key/u
    );
    assert.equal(requests.length, 0);
  });

  void test("creates the User once, then reuses it with the same password", async () => {
    const stateFile = path.join(tempDir("fitme-seed-"), "state.json");
    const { fetchFn, requests } = fakeFetch();

    const options = {
      apiUrl: "http://api",
      email: "sim-loop-x+clerk_test@fitmeproject.com",
      fetchFn,
      secretKey: "sk_test_x",
      stateFile,
    };

    const first = await seed(options);

    assert.equal(first.createdUser, true);

    const created = requests.find(
      (r) => r.method === "POST" && r.url.endsWith("/users")
    );

    assert.equal(field(created?.body, "bypass_client_trust"), true);
    const password = readState(stateFile).get("password");
    assert.ok(password);

    const second = await seed(options);

    assert.equal(second.createdUser, false);
    assert.equal(readState(stateFile).get("password"), password);
    assert.equal(readState(stateFile).get("userId"), "user_new");
    assert.ok(
      requests.some(
        (r) => r.url === "http://api/v1/profile" && r.auth === "Bearer jwt"
      )
    );
    assert.ok(requests.some((r) => r.url.endsWith("/sessions/sess_1/revoke")));
  });

  void test("adopts a User Clerk already has at the address", async () => {
    const stateFile = path.join(tempDir("fitme-seed-"), "state.json");
    const { fetchFn } = fakeFetch({ existingUserId: "user_old" });

    const result = await seed({
      apiUrl: "http://api",
      email: "e",
      fetchFn,
      secretKey: "sk_test_x",
      stateFile,
    });

    assert.equal(result.createdUser, false);
    assert.equal(readState(stateFile).get("userId"), "user_old");
  });

  void test("deleteUser deletes it and forgets it", async () => {
    const stateFile = path.join(tempDir("fitme-seed-"), "state.json");
    const { fetchFn } = fakeFetch({ existingUserId: "user_old" });
    writeState(stateFile, { password: "p", userId: "user_old" });

    assert.equal(
      await deleteUser({ fetchFn, secretKey: "sk_test_x", stateFile }),
      true
    );
    assert.equal(readState(stateFile).size, 0);
    assert.equal(
      await deleteUser({ fetchFn, secretKey: "sk_test_x", stateFile }),
      false
    );
  });
});

/**
 * @param {unknown} value An object.
 * @param {string} key A property.
 * @returns {unknown} Its value.
 */
function field(value, key) {
  return value instanceof Object
    ? new Map(Object.entries(value)).get(key)
    : undefined;
}

// The shell script itself: its dry run prints every command that would start,
// build, boot or call out, and must never reach one. Run under macOS's
// /bin/bash 3.2 where there is one, in a throwaway repository, with tripwires on
// PATH for every external command it may run.
const SCRIPTS = ["sim-loop.sh", "sim-loop.mjs", "mobile-types.mjs"];
const TRIPWIRES = ["xcrun", "xcodebuild", "pod", "infisical", "pnpm", "expo"];

const dryRunRepo = () => {
  const root = tempDir("fitme-sim-loop-");
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "apps/mobile"), { recursive: true });

  for (const name of SCRIPTS) {
    fs.copyFileSync(
      fileURLToPath(new URL(name, import.meta.url)),
      path.join(root, "scripts", name)
    );
  }

  execFileSync("git", ["init", "-q"], { cwd: root });

  const bin = tempDir("fitme-tripwires-");
  const log = path.join(bin, "calls.log");

  for (const name of TRIPWIRES) {
    const file = path.join(bin, name);
    fs.writeFileSync(
      file,
      `#!/bin/sh\necho "${name} $*" >> "${log}"\nexit 97\n`
    );
    fs.chmodSync(file, 0o755);
  }

  return { bin, log, root };
};

const bash = fs.existsSync("/bin/bash") ? "/bin/bash" : "bash";

/**
 * @param {ReturnType<typeof dryRunRepo>} repo The throwaway repository.
 * @param {string[]} args The script's arguments.
 */
const runDry = (repo, args) =>
  spawnSync(bash, [path.join(repo.root, "scripts/sim-loop.sh"), ...args], {
    cwd: repo.root,
    encoding: "utf-8",
    env: {
      ...process.env,
      FITME_SIM_LOOP_DRY_RUN: "1",
      PATH: `${repo.bin}:${process.env.PATH ?? ""}`,
    },
  });

void describe("sim-loop.sh dry run", () => {
  void test("up prints the whole loop and runs none of it", () => {
    const repo = dryRunRepo();
    const result = runDry(repo, ["up"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(repo.log), false, "a tripwire ran");
    const output = `${result.stdout}${result.stderr}`;
    assert.match(
      output,
      /with-dev-env\.sh Api -- env PORT=\d+ pnpm --filter @fitme\/api dev/u
    );
    assert.match(
      output,
      /EXPO_PUBLIC_API_URL=http:\/\/localhost:\d+ pnpm --filter @fitme\/mobile exec expo start --dev-client --port \d+/u
    );
    assert.match(output, /xcrun simctl create/u);
    assert.match(output, /xcodebuild .*CODE_SIGN_IDENTITY=-/u);
    assert.match(output, /with-dev-env\.sh Mcp -- node .*sim-loop\.mjs seed/u);
    assert.match(output, /open com\.fitmeproject\.ios --metro-port \d+/u);
    assert.doesNotMatch(output, /PORT=3003|localhost:3003/u);
    // A dry run records nothing.
    assert.equal(
      fs.existsSync(
        path.join(repo.root, "node_modules/.cache/sim-loop/state.json")
      ),
      false
    );
    // It still writes the gitignored typecheck inputs.
    assert.ok(
      fs.existsSync(path.join(repo.root, "apps/mobile/uniwind-types.d.ts"))
    );
  });

  void test("down --delete with nothing running changes nothing", () => {
    const repo = dryRunRepo();
    const result = runDry(repo, ["down", "--delete"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(repo.log), false, "a tripwire ran");
  });

  void test("an unknown argument is a usage error", () => {
    const result = runDry(dryRunRepo(), ["sideways"]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/u);
  });
});
