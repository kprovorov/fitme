/**
 * The session screen moving on when its Workout Session ends elsewhere
 * (FIT-813): the job that closes a forgotten one, an MCP client or another
 * phone finishing or deleting it, noticed by a poll or a return to the
 * foreground, without overtaking the app's own Finish and Discard. Mounts the
 * real screens on the real expo-router over the fake Public API; the
 * SwiftUI-backed primitives are swapped for plain stand-ins and the native
 * header for its items as buttons.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Slot, usePathname } from "expo-router";
import type { Href } from "expo-router";
import { useEffect } from "react";
import { Alert, AppState, Text } from "react-native";
import type { AppStateStatus } from "react-native";

import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanWorkoutSessionRoute from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import WorkoutSessionRoute from "~/app/workout-sessions/[workoutSessionId]";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { useAddedSets } from "~/hooks/added-sets";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { renderRouter } from "~/test-utils/render-router";
import { signInAs } from "~/test-utils/signed-in-user";

// The real router; only a screen's native header is drawn as plain buttons.
jest.mock("expo-router", () => {
  const actual =
    jest.requireActual<typeof import("expo-router")>("expo-router");

  const { StackScreenStub } = jest.requireActual<
    typeof import("~/test-utils/router-stub")
  >("~/test-utils/router-stub");

  return { ...actual, Stack: { Screen: StackScreenStub } };
});

// There is no app manifest under Jest to read the scheme from.
jest.mock("expo-linking", () => ({
  ...jest.requireActual<typeof import("expo-linking")>("expo-linking"),
  createURL: (path: string) => `fitme://${path}`,
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock("~/components/exercises/exercise-image", () => () => null);

// The body diagram reads theme colors uniwind has no stylesheet for in Jest.
jest.mock("~/components/views/workout-session-summary-body", () => ({
  WorkoutSessionSummaryBodyBack: () => null,
  WorkoutSessionSummaryBodyFront: () => null,
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/workout-sessions/rest-timer", () => () => null);

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

jest.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null,
}));

const READ = "GET /v1/workout-sessions/{id}";
const DELETE = "DELETE /v1/workout-sessions/{id}";
const FINISH = "POST /v1/workout-sessions/{id}/finish";
const PLAN_UPDATE = "GET /v1/workout-sessions/{id}/plan-update";

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;
const GUIDE = "/exercises/squat/guide";
const BARE_SESSION = "/workout-sessions/s1";
const SUMMARY = `${BARE_SESSION}/summary`;

const SESSION_KEY = ["workout-session", { sessionId: "s1" }];

const DONE = "Workout Complete!";
const FINISH_BUTTON = "finish-workout-button";
const POLL_MS = 30_000;

/** An old answer, in the shape the Summary reads History in. */
const SEEDED = { sessions: [], weightUnit: "kg" };

/** The queries a finish changes, each as a screen may have left it. */
const CHANGED_BY_FINISH = [
  ["plans", "x"],
  ["plan", "x"],
  ["exercise-history", "x"],
  ["workout-sessions-history"],
  ["weekly-goals"],
  ["lifetime-totals"],
];

// Each test mounts whole screens and steps through many requests.
jest.setTimeout(60_000);

let queryClient: QueryClient;
let pathname: string;
let appStateListeners: Set<(state: AppStateStatus) => void>;

/** Timers set for about a poll's wait (or longer) and still running. */
const longTimers = new Map<unknown, { run: () => void; wait: number }>();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

/** Home: which Workout Session is open, and one of its Exercises' added sets. */
const HomeStub = () => {
  const { data } = useOpenWorkoutSessionQuery();
  const added = useAddedSets("s1-e1");

  return (
    <>
      <Text>{`Open: ${data === undefined ? "?" : (data?.id ?? "none")}`}</Text>
      <Text>{`Added sets: ${added.length}`}</Text>
    </>
  );
};

const TabsStub = () => <Slot />;

const GuideStub = () => <Text>Guide</Text>;

const Layout = () => {
  const shown = usePathname();

  useEffect(() => {
    pathname = shown;
  }, [shown]);

  const { Stack } =
    jest.requireActual<typeof import("expo-router")>("expo-router");

  return (
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <Stack screenOptions={{ headerShown: false }} />
        <PlanUpdateSheetHost />
      </InAppLanguage>
    </QueryClientProvider>
  );
};

const go = async (navigate: () => void) => {
  await act(async () => {
    navigate();
    await Promise.resolve();
  });
  await settle(queryClient);
};

/** Opens the app on `path`, then pushes the others over it. */
const open = async (path: string, ...pushed: Href[]) => {
  queryClient = createTestQueryClient();
  await renderRouter(
    {
      "(tabs)/_layout": TabsStub,
      "(tabs)/index": HomeStub,
      _layout: Layout,
      "exercises/[exerciseSlug]/guide": GuideStub,
      "plans/[planId]/workouts/[workoutId]/index": WorkoutScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index":
        WorkoutSessionExerciseScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index":
        PlanWorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]": WorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]/summary":
        WorkoutSessionSummaryScreen,
    },
    path
  );
  await settle(queryClient);

  for (const next of pushed) {
    // oxlint-disable-next-line no-await-in-loop -- Each is pushed over the last.
    await go(() => router.push(next));
  }
};

const openSession = () => open("/", WORKOUT, SESSION);

/** Lets 30 seconds pass: every timer that would have run by then, runs. */
const startPoll = () =>
  act(async () => {
    // Only what is set now: a poll sets the next one.
    const due = [...longTimers].filter(([, { wait }]) => wait <= POLL_MS);

    for (const [timer, { run }] of due) {
      longTimers.delete(timer);
      realClearTimeout(timer as ReturnType<typeof setTimeout>);
      run();
    }

    await Promise.resolve();
  });

const poll = async () => {
  await startPoll();
  await settle(queryClient);
};

const setAppState = (state: AppStateStatus) =>
  act(async () => {
    for (const listener of appStateListeners) {
      listener(state);
    }

    await Promise.resolve();
  });

const returnToForeground = async () => {
  await setAppState("background");
  await setAppState("active");
  await settle(queryClient);
};

const finishElsewhere = () => {
  Object.assign(backend.sessions[0], {
    finished_at: "2026-10-08T11:00:00.000Z",
  });
};

const deleteElsewhere = () => {
  backend.sessions = [];
};

const logEverySet = () => {
  for (const set of backend.sets) {
    Object.assign(set, {
      logged_at: "2026-10-08T10:10:00.000Z",
      reps_completed: 8,
      weight_completed: 50,
    });
  }
};

const isSessionShown = () => screen.queryByText("Workout s1") !== null;

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls.map(([title]) => title);

const answer = async (text: string) => {
  const button = jest
    .mocked(Alert.alert)
    .mock.lastCall?.[2]?.find((candidate) => candidate.text === text);

  await act(async () => {
    button?.onPress?.();
    await Promise.resolve();
  });
};

const pressFinish = () => fireEvent.press(screen.getByTestId(FINISH_BUTTON));

const askDiscard = () =>
  fireEvent.press(screen.getByLabelText("Discard Workout"));

beforeEach(() => {
  jest.clearAllMocks();
  longTimers.clear();
  appStateListeners = new Set();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    appStateListeners.add(listener);

    return {
      remove: () => {
        appStateListeners.delete(listener);
      },
    };
  });
  // Real timers, which `settle` needs; only the long ones can be run early.
  jest.spyOn(globalThis, "setTimeout").mockImplementation(((
    run: () => void,
    wait = 0,
    ...args: unknown[]
  ) => {
    const timer = realSetTimeout(run, wait, ...args);

    if (wait > POLL_MS / 2) {
      longTimers.set(timer, { run, wait });
    }

    return timer;
  }) as typeof setTimeout);
  jest.spyOn(globalThis, "clearTimeout").mockImplementation((timer) => {
    longTimers.delete(timer);
    realClearTimeout(timer);
  });
  backend.reset();
  storage.clearAll();
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", { name: "Squat", muscle_groups: ["quadriceps"] }),
  ]);
  backend.seedPlan({
    id: "plan-1",
    name: "Full body",
    workouts: [
      {
        exercises: [{ sets: 2, slug: "squat" }],
        id: "workout-1",
        name: "Day A",
      },
    ],
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const NOTICES = [
  ["a poll", poll],
  ["a return to the foreground", returnToForeground],
] as const;

describe.each(NOTICES)("finished elsewhere, after %s", (_, notice) => {
  it("shows the Summary instead, saying and asking nothing", async () => {
    await openSession();
    finishElsewhere();
    await notice();

    expect(pathname).toBe(SUMMARY);
    expect(screen.getByText(DONE)).toBeTruthy();
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(PLAN_UPDATE)).toBe(0);

    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it("closes the session's screens above it", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE);
    finishElsewhere();
    await notice();

    expect(pathname).toBe(SUMMARY);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it("leaves another screen above it alone", async () => {
    await open("/", BARE_SESSION, GUIDE);
    finishElsewhere();
    await notice();

    expect(pathname).toBe(GUIDE);
    await go(() => router.back());
    expect(pathname).toBe(SUMMARY);
    await go(() => router.back());
    expect(pathname).toBe("/");
  });

  it("reads what a finish changes again", async () => {
    await open("/", SESSION);

    for (const key of CHANGED_BY_FINISH) {
      queryClient.setQueryData(key, SEEDED);
    }

    finishElsewhere();
    await notice();

    const left = CHANGED_BY_FINISH.filter((key) => {
      const state = queryClient.getQueryState(key);

      // Invalidated, or read again by the Summary (History).
      return !state?.isInvalidated && state?.data === SEEDED;
    });

    expect(left).toEqual([]);
    expect(queryClient.getQueryData(["open-workout-session"])).toBeNull();
  });
});

describe.each(NOTICES)("deleted elsewhere, after %s", (_, notice) => {
  it("shows what the User came from, saying nothing", async () => {
    await openSession();
    deleteElsewhere();
    await notice();

    expect(pathname).toBe(WORKOUT);
    expect(screen.getByText("Start Workout")).toBeTruthy();
    expect(alerts()).toEqual([]);
  });

  it("goes Home when nothing is behind", async () => {
    await open(BARE_SESSION);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe("/");
    expect(screen.getByText("Open: none")).toBeTruthy();
  });

  it("closes only the session's own screens", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE, GUIDE);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe(GUIDE);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it("drops its read and its added sets, and reads what a discard changes again", async () => {
    await open("/", SESSION);
    await fireEvent.press(screen.getByText("Add Set"));
    queryClient.setQueryData(["exercise-history", "x"], 1);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe("/");
    expect(screen.getByText("Added sets: 0")).toBeTruthy();
    expect(queryClient.getQueryData(SESSION_KEY)).toBeUndefined();
    expect(
      queryClient.getQueryState(["exercise-history", "x"])?.isInvalidated
    ).toBe(true);
    expect(screen.getByText("Open: none")).toBeTruthy();
  });
});

describe("opened on an already finished Workout Session", () => {
  it("stays, read only, and reads nothing again", async () => {
    finishElsewhere();
    await open("/", BARE_SESSION);
    const reads = fakePublicApi.count(READ);
    await poll();
    await returnToForeground();

    expect(fakePublicApi.count(READ)).toBe(reads);
    expect(pathname).toBe(BARE_SESSION);
    expect(isSessionShown()).toBe(true);
    expect(screen.queryByTestId(FINISH_BUTTON)).toBeNull();
  });

  it("stays on its load error when it's gone from the start", async () => {
    deleteElsewhere();
    await open("/", BARE_SESSION);
    await poll();

    expect(pathname).toBe(BARE_SESSION);
    expect(fakePublicApi.count(READ)).toBe(1);
  });
});

describe("a failed refresh", () => {
  it.each([
    ["a network failure", "network"],
    ["a 429", { retryAfterSeconds: 12, status: 429 }],
    ["a 500", { status: 500 }],
  ] as const)(
    "%s keeps the screen, and the next poll moves on",
    async (_, failure) => {
      await openSession();
      const reads = fakePublicApi.count(READ);
      fakePublicApi.failNext(READ, failure);
      finishElsewhere();
      await poll();

      expect(fakePublicApi.count(READ)).toBe(reads + 1);
      expect(pathname).toBe(SESSION);
      expect(screen.getByTestId(FINISH_BUTTON)).toBeTruthy();

      await poll();
      expect(pathname).toBe(SUMMARY);
    }
  );

  it("waits out a 429 longer than a poll", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    fakePublicApi.failNext(READ, { retryAfterSeconds: 50, status: 429 });
    await poll();
    await poll();
    await returnToForeground();

    expect(fakePublicApi.count(READ)).toBe(reads + 1);
  });
});

describe("the polling", () => {
  it("reads an open session every 30 seconds", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    await poll();
    await poll();

    expect(fakePublicApi.count(READ)).toBe(reads + 2);
    expect(pathname).toBe(SESSION);
  });

  it("stops in the background", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    await setAppState("background");
    await poll();
    expect(fakePublicApi.count(READ)).toBe(reads);

    await setAppState("active");
    await settle(queryClient);
    expect(fakePublicApi.count(READ)).toBe(reads + 1);
  });

  it("reads nothing more after Control Center was opened", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    await setAppState("inactive");
    await setAppState("active");
    await settle(queryClient);

    expect(fakePublicApi.count(READ)).toBe(reads);
  });

  it("stops once the screen has closed", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    await go(() => router.back());
    await poll();

    expect(fakePublicApi.count(READ)).toBe(reads);
  });
});

describe("the app's own Finish", () => {
  /** A read answering the finish, landing while the app's own is pending. */
  const readFinishedMeanwhile = () =>
    act(async () => {
      await queryClient.refetchQueries({ queryKey: SESSION_KEY });
    });

  it("still asks Update your plan?, then shows the Summary", async () => {
    // A set added to it: something to save to the Plan.
    backend.sets.push({
      ...backend.sets[0],
      id: "s1-e1-s3",
      order: 3,
      reps_recommended: null,
      weight_recommended: null,
    });
    logEverySet();
    await openSession();
    const resume = fakePublicApi.pause(FINISH);
    await pressFinish();
    await until(() => fakePublicApi.count(FINISH) === 1);
    finishElsewhere();
    await readFinishedMeanwhile();
    expect(pathname).toBe(SESSION);

    const resumePreview = fakePublicApi.pause(PLAN_UPDATE);
    resume();
    await until(() => fakePublicApi.count(PLAN_UPDATE) === 1);
    expect(pathname).toBe(SESSION);
    resumePreview();
    await settle(queryClient);

    expect(screen.getByText("Update your plan?")).toBeTruthy();
    await poll();
    await returnToForeground();
    expect(pathname).toBe(SESSION);

    await fireEvent.press(screen.getByText("Keep plan as is"));
    await settle(queryClient);
    expect(pathname).toBe(SUMMARY);
  });

  it("moves on when its answer is lost but the read says finished", async () => {
    logEverySet();
    await openSession();
    const resume = fakePublicApi.pause(FINISH);
    fakePublicApi.failNext(FINISH, { status: 500 });
    await pressFinish();
    await until(() => fakePublicApi.count(FINISH) === 1);
    finishElsewhere();
    await readFinishedMeanwhile();
    resume();
    await settle(queryClient);

    expect(alerts()).toEqual(["Couldn't finish workout"]);
    expect(pathname).toBe(SUMMARY);
  });

  it.each([
    ["finished", finishElsewhere, SUMMARY],
    ["deleted", deleteElsewhere, WORKOUT],
  ] as const)(
    "answering its question does nothing once %s elsewhere",
    async (_, end, shown) => {
      await openSession();
      await pressFinish();
      expect(alerts()).toEqual(["Finish workout?"]);
      end();
      await poll();
      expect(pathname).toBe(shown);

      const sent = fakePublicApi.requests.length;
      await answer("Finish");
      await settle(queryClient);

      expect(fakePublicApi.requests).toHaveLength(sent);
      expect(alerts()).toHaveLength(1);
      expect(pathname).toBe(shown);
    }
  );
});

describe("the app's own Discard", () => {
  it("still says it was already finished, and stays", async () => {
    await openSession();
    await askDiscard();
    const resume = fakePublicApi.pause(READ);
    const reads = fakePublicApi.count(READ);
    finishElsewhere();
    await answer("Discard");
    await until(() => fakePublicApi.count(READ) === reads + 1);
    await startPoll();
    expect(fakePublicApi.count(READ)).toBe(reads + 1);
    resume();
    await settle(queryClient);
    await poll();
    await returnToForeground();

    expect(alerts()).toEqual(["Discard workout?", "Workout already finished"]);
    expect(pathname).toBe(SESSION);
    expect(isSessionShown()).toBe(true);
  });

  it("closes as before when a read finds it gone meanwhile", async () => {
    await openSession();
    await askDiscard();
    const resume = fakePublicApi.pause(DELETE);
    await answer("Discard");
    await until(() => fakePublicApi.count(DELETE) === 1);
    deleteElsewhere();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: SESSION_KEY });
    });
    expect(pathname).toBe(SESSION);
    resume();
    await settle(queryClient);

    expect(pathname).toBe(WORKOUT);
    expect(alerts()).toEqual(["Discard workout?"]);
    expect(sentAnalytics.events()).toHaveLength(1);
  });

  it("answering its question does nothing once finished elsewhere", async () => {
    await openSession();
    await askDiscard();
    finishElsewhere();
    await poll();

    const sent = fakePublicApi.requests.length;
    await answer("Discard");
    await settle(queryClient);

    expect(fakePublicApi.requests).toHaveLength(sent);
    expect(alerts()).toEqual(["Discard workout?"]);
    expect(pathname).toBe(SUMMARY);
  });
});

describe.each([null, "user_other"])("after signing in as %s", (userId) => {
  it("reads nothing", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    signInAs(userId);
    await poll();
    await returnToForeground();

    expect(fakePublicApi.count(READ)).toBe(reads);
    expect(pathname).toBe(SESSION);
  });

  it.each([
    ["finished", finishElsewhere],
    ["deleted", deleteElsewhere],
  ] as const)(
    "moves nothing when a read asked before says %s",
    async (_, end) => {
      await openSession();
      end();
      const resume = fakePublicApi.pause(READ);
      const reads = fakePublicApi.count(READ);
      await startPoll();
      await until(() => fakePublicApi.count(READ) === reads + 1);
      signInAs(userId);
      resume();
      await settle(queryClient);

      expect(pathname).toBe(SESSION);
    }
  );
});

describe("in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows the Summary of one finished elsewhere", async () => {
    await openSession();
    finishElsewhere();
    await poll();

    expect(pathname).toBe(SUMMARY);
    expect(screen.getByText("Тренування завершено!")).toBeTruthy();
    expect(alerts()).toEqual([]);
  });

  it("answers the open question harmlessly, and closes one deleted elsewhere", async () => {
    await openSession();
    await pressFinish();
    expect(alerts()).toEqual(["Завершити тренування?"]);
    deleteElsewhere();
    await poll();
    await answer("Завершити");
    await settle(queryClient);

    expect(pathname).toBe(WORKOUT);
    expect(screen.getByText("Почати тренування")).toBeTruthy();
    expect(alerts()).toHaveLength(1);
  });
});
