/**
 * The Workout Session Exercise screen and the Exercise picker moving on when
 * their Workout Session ends elsewhere (FIT-816), as the session screen does
 * (FIT-813): finished shows the Summary, gone closes the session's screens,
 * whichever of them is open and however the User got there, the stack ending
 * as if it had happened on the session screen. Mounts the real screens on
 * the real expo-router over the fake Public API; the SwiftUI-backed
 * primitives are swapped for plain stand-ins and the native header for its
 * items as buttons.
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

import MusclesSheet from "~/app/muscles";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanWorkoutSessionRoute from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import WorkoutSessionRoute from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { useAddedSets } from "~/hooks/added-sets";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
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

const mockTrack = jest.fn();

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

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: (...args: unknown[]) => mockTrack(...args) },
}));

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

// The countdown animates through Reanimated: only whether it shows matters.
jest.mock("~/components/workout-sessions/rest-timer", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return () => <MockText>Resting</MockText>;
});

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
const PLAN_UPDATE = "GET /v1/workout-sessions/{id}/plan-update";

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;
const GUIDE = "/exercises/squat/guide";
const BARE_SESSION = "/workout-sessions/s1";
const SUMMARY = `${BARE_SESSION}/summary`;
const PICKER = `${BARE_SESSION}/exercise-picker` as const;

const SESSION_KEY = ["workout-session", { sessionId: "s1" }];

const DONE = "Workout Complete!";

const EXERCISE_LOAD_ERROR =
  "Couldn't load this exercise. Check your connection and try again.";

const POLL_MS = 30_000;

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
      muscles: MusclesSheet,
      "plans/[planId]/workouts/[workoutId]/index": WorkoutScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index":
        WorkoutSessionExerciseScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index":
        PlanWorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]": WorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]/exercise-picker":
        ExercisePickerScreen,
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

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls.map(([title]) => title);

/** Logs set `order` of the Exercise on screen, as typed or as planned. */
const logSet = async (order: number) => {
  await fireEvent.press(screen.getByTestId(`log-set-button-${order}`));
  await settle(queryClient);
};

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

/** A third set on the Exercise, unplanned, so finishing has a Plan Update. */
const addUnplannedSet = () => {
  backend.sets.push({
    ...backend.sets[0],
    id: "s1-e1-s3",
    logged_at: null,
    order: 3,
    reps_completed: null,
    reps_recommended: null,
    weight_recommended: null,
  });
};

describe.each(NOTICES)("finished elsewhere, after %s", (_, notice) => {
  it("replaces the Exercise screen and the session screen with the Summary", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE);
    finishElsewhere();
    await notice();

    expect(pathname).toBe(SUMMARY);
    expect(screen.getByText(DONE)).toBeTruthy();
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(PLAN_UPDATE)).toBe(0);

    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it.each([
    ["the Exercise screen", [WORKOUT, SESSION, EXERCISE, PICKER]],
    ["the session screen", [WORKOUT, SESSION, PICKER]],
  ] as const)("closes the picker open over %s", async (__, pushed) => {
    await open("/", ...pushed);
    finishElsewhere();
    await notice();

    expect(pathname).toBe(SUMMARY);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it.each([
    ["the Exercise screen", []],
    ["the Exercise screen with the picker over it", [PICKER]],
  ] as const)(
    "replaces %s opened from a link with the Summary",
    async (__, pushed) => {
      await open(EXERCISE, ...pushed);
      finishElsewhere();
      await notice();

      expect(pathname).toBe(SUMMARY);
      expect(screen.getByText(DONE)).toBeTruthy();
      expect(alerts()).toEqual([]);
    }
  );

  it("leaves another screen above it alone", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE, GUIDE);
    finishElsewhere();
    await notice();

    expect(pathname).toBe(GUIDE);
    await go(() => router.back());
    expect(pathname).toBe(SUMMARY);
  });

  it("stops the rest timer", async () => {
    addUnplannedSet();
    Object.assign(backend.sets[1], { rest_recommended: 60 });
    await open("/", WORKOUT, SESSION, EXERCISE);
    await logSet(2);
    expect(screen.getByText("Resting")).toBeTruthy();

    finishElsewhere();
    await notice();

    expect(pathname).toBe(SUMMARY);
    expect(screen.queryByText("Resting")).toBeNull();
  });
});

describe.each(NOTICES)("deleted elsewhere, after %s", (_, notice) => {
  it("closes the Exercise screen and the session screen", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe(WORKOUT);
    expect(screen.getByText("Start Workout")).toBeTruthy();
    expect(alerts()).toEqual([]);
  });

  it.each([
    ["the Exercise screen", [WORKOUT, SESSION, EXERCISE, PICKER]],
    ["the session screen", [WORKOUT, SESSION, PICKER]],
  ] as const)("closes the picker open over %s", async (__, pushed) => {
    await open("/", ...pushed);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe(WORKOUT);
    await go(() => router.back());
    expect(pathname).toBe("/");
  });

  it.each([
    ["the Exercise screen", []],
    ["the Exercise screen with the picker over it", [PICKER]],
  ] as const)("goes Home from %s opened from a link", async (__, pushed) => {
    await open(EXERCISE, ...pushed);
    deleteElsewhere();
    await notice();

    expect(pathname).toBe("/");
    expect(screen.getByText("Open: none")).toBeTruthy();
    expect(alerts()).toEqual([]);
  });

  it("drops the added sets the Exercise screen showed", async () => {
    await open(EXERCISE);
    await fireEvent.press(screen.getByText("Add Set"));
    deleteElsewhere();
    await notice();

    expect(screen.getByText("Added sets: 0")).toBeTruthy();
    expect(queryClient.getQueryData(SESSION_KEY)).toBeUndefined();
  });
});

describe("several screens of one Workout Session", () => {
  const openAll = () => open("/", WORKOUT, SESSION, EXERCISE, PICKER);

  it("read it once per poll and once per return to the foreground", async () => {
    await openAll();
    const reads = fakePublicApi.count(READ);
    await poll();
    expect(fakePublicApi.count(READ)).toBe(reads + 1);

    await returnToForeground();
    expect(fakePublicApi.count(READ)).toBe(reads + 2);

    await poll();
    expect(fakePublicApi.count(READ)).toBe(reads + 3);
  });

  it("move on to one Summary", async () => {
    await openAll();
    finishElsewhere();
    await poll();

    expect(pathname).toBe(SUMMARY);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
    await go(() => router.back());
    expect(pathname).toBe("/");
  });

  it("close once", async () => {
    await openAll();
    deleteElsewhere();
    await returnToForeground();

    expect(pathname).toBe(WORKOUT);
    await go(() => router.back());
    expect(pathname).toBe("/");
  });
});

describe.each([
  ["finished", finishElsewhere, SUMMARY],
  ["deleted", deleteElsewhere, WORKOUT],
] as const)(
  "%s elsewhere, under the picker's Muscles sheet",
  (_, end, shown) => {
    it("closes the sheet with the picker", async () => {
      await open("/", WORKOUT, SESSION, PICKER);
      await go(() => fireEvent.press(screen.getByText("Muscles")));
      expect(pathname).toBe("/muscles");

      end();
      await poll();

      expect(pathname).toBe(shown);
    });
  }
);

describe("an Exercise removed elsewhere, its session still open", () => {
  it("shows its load error and stays", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE);
    backend.exercises = [];
    backend.sets = [];
    await poll();
    await returnToForeground();

    expect(pathname).toBe(EXERCISE);
    expect(screen.getByText(EXERCISE_LOAD_ERROR)).toBeTruthy();
  });
});

describe("an Exercise of an already finished Workout Session", () => {
  it("opens read only, and reads nothing again", async () => {
    finishElsewhere();
    await open(EXERCISE);
    const reads = fakePublicApi.count(READ);
    await poll();
    await returnToForeground();

    expect(fakePublicApi.count(READ)).toBe(reads);
    expect(pathname).toBe(EXERCISE);
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Add Set")).toBeNull();
  });
});

describe("the app's own Finish from the Exercise screen", () => {
  it("still asks Update your plan?, then shows the Summary", async () => {
    addUnplannedSet();
    await open("/", WORKOUT, SESSION, EXERCISE);
    await logSet(2);
    await logSet(3);

    const resumePreview = fakePublicApi.pause(PLAN_UPDATE);
    await fireEvent.press(
      screen.getByTestId("finish-workout-suggestion-finish")
    );
    await until(() => fakePublicApi.count(PLAN_UPDATE) === 1);
    // Neither may overtake it while the Plan Update is asked.
    const reads = fakePublicApi.count(READ);
    await startPoll();
    await setAppState("background");
    await setAppState("active");
    expect(fakePublicApi.count(READ)).toBe(reads);
    expect(pathname).toBe(EXERCISE);

    resumePreview();
    await settle(queryClient);
    expect(screen.getByText("Update your plan?")).toBeTruthy();
    await poll();
    expect(screen.getByText("Update your plan?")).toBeTruthy();

    await fireEvent.press(screen.getByText("Keep plan as is"));
    await settle(queryClient);
    expect(pathname).toBe(SUMMARY);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });
});

describe("in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows the Summary from the picker over the Exercise screen", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE, PICKER);
    finishElsewhere();
    await poll();

    expect(pathname).toBe(SUMMARY);
    expect(screen.getByText("Тренування завершено!")).toBeTruthy();
    expect(alerts()).toEqual([]);
  });

  it("closes the Exercise screen of one deleted elsewhere", async () => {
    await open("/", WORKOUT, SESSION, EXERCISE);
    deleteElsewhere();
    await poll();

    expect(pathname).toBe(WORKOUT);
    expect(screen.getByText("Почати тренування")).toBeTruthy();
  });
});
