/**
 * Discarding an open Workout Session from its screen's menu (FIT-783) and from
 * the Finish alert with nothing logged (FIT-784): the question, the re-read and the DELETE, what closes after it, and every way
 * it can fail. Mounts the real screens on the real expo-router over the fake
 * Public API; the SwiftUI-backed primitives are swapped for plain stand-ins
 * and the native header for its items as buttons.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Slot, usePathname } from "expo-router";
import type { Href } from "expo-router";
import { useEffect } from "react";
import { Alert, Text } from "react-native";

import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanWorkoutSessionRoute from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import WorkoutSessionRoute from "~/app/workout-sessions/[workoutSessionId]";
import { useAddedSets } from "~/hooks/added-sets";
import {
  useOpenWorkoutSessionQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
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
const START = "POST /v1/workout-sessions";
const LIST = "GET /v1/workout-sessions";
const IN_PROGRESS = { status: "in_progress" };

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;
const GUIDE = "/exercises/squat/guide";
const BARE_SESSION = "/workout-sessions/s1";

const SESSION_KEY = ["workout-session", { sessionId: "s1" }];

const OPTIONS = "Workout options";
const DISCARD = "Discard Workout";

const FAILED = [
  "Couldn't discard workout",
  "Check your connection and try again.",
];

const SESSION_LOAD_ERROR =
  "Couldn't load this workout. Check your connection and try again.";

// Each test mounts whole screens and steps through many requests.
jest.setTimeout(30_000);

let queryClient: QueryClient;
let pathname: string;
let watchesSession = false;

/** Still reads the session once its own screens have closed. */
const SessionWatcher = () => {
  useWorkoutSessionQuery({ variables: { sessionId: "s1" } });
  // Renders on every change of the open session too, as a screen would.
  useOpenWorkoutSessionQuery();

  return null;
};

/** Home: which Workout Session is open, and one of its Exercises' added sets. */
const HomeStub = () => {
  const { data } = useOpenWorkoutSessionQuery();
  const added = useAddedSets("s1-e1");

  return (
    <>
      <Text>{`Open: ${data === undefined ? "?" : (data?.id ?? "none")}`}</Text>
      <Text>{`Added sets: ${added.length}`}</Text>
      {watchesSession ? <SessionWatcher /> : null}
    </>
  );
};

const TabsStub = () => <Slot />;

const SummaryStub = () => <Text>Summary</Text>;

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
      </InAppLanguage>
    </QueryClientProvider>
  );
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
      "workout-sessions/[workoutSessionId]/summary": SummaryStub,
    },
    path
  );
  await settle(queryClient);

  for (const next of pushed) {
    // oxlint-disable-next-line no-await-in-loop -- Each is pushed over the last.
    await go(() => router.push(next));
  }
};

const go = async (navigate: () => void) => {
  await act(async () => {
    navigate();
    await Promise.resolve();
  });
  await settle(queryClient);
};

const alerts = () =>
  jest
    .mocked(Alert.alert)
    .mock.calls.map(([title, message]) =>
      message === undefined ? [title] : [title, message]
    );

const lastButtons = () => jest.mocked(Alert.alert).mock.lastCall?.[2] ?? [];

const buttonNamed = (text: string) =>
  lastButtons().find((button) => button.text === text);

const pressButton = async (button: ReturnType<typeof buttonNamed>) => {
  await act(async () => {
    button?.onPress?.();
    await Promise.resolve();
  });
};

const answer = (text: string) => pressButton(buttonNamed(text));

const ask = () => fireEvent.press(screen.getByLabelText(DISCARD));

/** Asks, forgets the question and confirms, leaving the discard running. */
const startDiscard = async () => {
  await ask();

  // Forgotten before the press, which can already bring up the next alert.
  const button = buttonNamed("Discard");
  jest.mocked(Alert.alert).mockClear();
  await pressButton(button);
};

const discard = async () => {
  await startDiscard();
  await settle(queryClient);
};

const isSessionShown = () => screen.queryByText("Workout s1") !== null;

const openSession = () => open("/", WORKOUT, SESSION);

const setLogged = (id: string, reps: number) => {
  const set = backend.sets.find((candidate) => candidate.id === id);

  if (!set) {
    throw new Error(`No seeded set ${id}`);
  }

  Object.assign(set, {
    logged_at: "2026-10-08T10:10:00.000Z",
    reps_completed: reps,
  });
};

const finishElsewhere = () => {
  Object.assign(backend.sessions[0], {
    finished_at: "2026-10-08T11:00:00.000Z",
  });
};

/** Requests sent since `from`, by route. */
const requestsSince = (from: number) =>
  fakePublicApi.requests.slice(from).map(({ route }) => route);

beforeEach(() => {
  jest.clearAllMocks();
  watchesSession = false;
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
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
      {
        exercises: [{ sets: 2, slug: "squat" }],
        id: "workout-2",
        name: "Day B",
      },
    ],
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

describe("the menu", () => {
  it("has Discard Workout for an open Workout Session, on both routes", async () => {
    await openSession();
    expect(screen.getByRole("button", { name: OPTIONS })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: DISCARD })).toBeTruthy();

    await go(() => router.replace(BARE_SESSION));
    expect(screen.getByRole("menuitem", { name: DISCARD })).toBeTruthy();
  });

  it("discards an open Workout Session whose Workout is gone", async () => {
    Object.assign(backend.sessions[0], { plan_id: null, workout_id: null });
    await open("/", BARE_SESSION);
    await discard();

    expect(backend.session("s1")).toBeUndefined();
    expect(screen.getByText("Open: none")).toBeTruthy();
  });

  it("isn't there while loading", async () => {
    const resume = fakePublicApi.pause(READ);
    await open("/");
    await act(async () => {
      router.push(BARE_SESSION);
      await Promise.resolve();
    });
    await until(() => fakePublicApi.count(READ) === 1);
    expect(screen.queryByLabelText(OPTIONS)).toBeNull();

    resume();
    await settle(queryClient);
    expect(screen.getByLabelText(OPTIONS)).toBeTruthy();
  });

  it("isn't there after a failed first read", async () => {
    fakePublicApi.failNext(READ, { status: 500 });
    await open("/", BARE_SESSION);

    expect(screen.getByText(SESSION_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByLabelText(OPTIONS)).toBeNull();
  });

  it("isn't there once finished, nor on the Workout Session Exercise screen", async () => {
    finishElsewhere();
    await open("/", BARE_SESSION);
    expect(isSessionShown()).toBe(true);
    expect(screen.queryByLabelText(OPTIONS)).toBeNull();

    Object.assign(backend.sessions[0], { finished_at: null });
    await open(EXERCISE);
    expect(screen.queryByLabelText(OPTIONS)).toBeNull();
  });
});

describe("the question", () => {
  it("says how many logged sets will be deleted, and Keep Training changes nothing", async () => {
    await openSession();
    await ask();

    expect(alerts()).toEqual([
      [
        "Discard workout?",
        "1 logged set will be deleted. This can't be undone.",
      ],
    ]);
    expect(lastButtons().map(({ style, text }) => ({ style, text }))).toEqual([
      { style: "cancel", text: "Keep Training" },
      { style: "destructive", text: "Discard" },
    ]);

    const sent = fakePublicApi.requests.length;
    await answer("Keep Training");
    await settle(queryClient);

    expect(requestsSince(sent)).toEqual([]);
    expect(isSessionShown()).toBe(true);
  });

  it("is asked once while it's open, and again once dismissed", async () => {
    await openSession();
    await ask();
    await ask();
    expect(alerts()).toHaveLength(1);

    jest.mocked(Alert.alert).mock.lastCall?.[3]?.onDismiss?.();
    await ask();
    expect(alerts()).toHaveLength(2);
  });

  it("counts a set logged with 0 reps", async () => {
    setLogged("s1-e1-s2", 0);
    await openSession();
    await ask();

    expect(alerts()).toEqual([
      [
        "Discard workout?",
        "2 logged sets will be deleted. This can't be undone.",
      ],
    ]);
  });

  it("says when nothing has been logged", async () => {
    Object.assign(backend.sets[0], { logged_at: null, reps_completed: null });
    await openSession();
    await ask();

    expect(alerts()).toEqual([
      ["Discard workout?", "Nothing has been logged yet."],
    ]);
  });
});

describe("a discard", () => {
  it("reads the session again, deletes it and goes back, where Start is free", async () => {
    await openSession();
    const sent = fakePublicApi.requests.length;
    await discard();

    expect(requestsSince(sent).slice(0, 2)).toEqual([READ, DELETE]);
    // Nothing else it may have changed is read again.
    expect(new Set(requestsSince(sent).slice(2))).toEqual(new Set([LIST]));
    expect(backend.session("s1")).toBeUndefined();
    expect(backend.sets).toEqual([]);
    expect(pathname).toBe(WORKOUT);
    expect(alerts()).toEqual([]);
    expect(backend.plans[0].workouts.map(({ id }) => id)).toEqual([
      "workout-1",
      "workout-2",
    ]);

    // The same Workout starts afresh.
    await fireEvent.press(screen.getByText("Start Workout"));
    await settle(queryClient);

    expect(fakePublicApi.count(START)).toBe(1);
    expect(backend.sessions).toHaveLength(1);
    expect(backend.sessions[0].id).not.toBe("s1");
  });

  it("goes Home when nothing is behind", async () => {
    await open(BARE_SESSION);
    await discard();

    expect(pathname).toBe("/");
    expect(screen.getByText("Open: none")).toBeTruthy();
  });

  it("closes only the session's own screens, whatever was opened meanwhile", async () => {
    await openSession();
    const resume = fakePublicApi.pause(DELETE);
    await startDiscard();
    await until(() => fakePublicApi.count(DELETE) === 1);
    await act(async () => {
      router.push(EXERCISE);
      await Promise.resolve();
      // Not next to the push above, which the linter takes for an array's.
      router.push(GUIDE);
      await Promise.resolve();
    });
    resume();
    await settle(queryClient);

    expect(pathname).toBe(GUIDE);
    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });

  it("closes nothing once the User has left the session", async () => {
    await openSession();
    const resume = fakePublicApi.pause(DELETE);
    await startDiscard();
    await until(() => fakePublicApi.count(DELETE) === 1);
    await act(async () => {
      router.back();
      await Promise.resolve();
    });
    resume();
    await settle(queryClient);

    expect(pathname).toBe(WORKOUT);
    expect(backend.session("s1")).toBeUndefined();
  });

  it("never reads the deleted session or shows a load error", async () => {
    await openSession();
    const reads = fakePublicApi.count(READ);
    await discard();

    expect(fakePublicApi.count(READ)).toBe(reads + 1);
    expect(queryClient.getQueryData(SESSION_KEY)).toBeUndefined();

    // Its old link reads it, and finds it gone.
    await go(() => router.push(BARE_SESSION));
    expect(screen.getByText(SESSION_LOAD_ERROR)).toBeTruthy();
  });

  it("keeps the session's read while something still shows it", async () => {
    watchesSession = true;
    await open("/", SESSION);
    const reads = fakePublicApi.count(READ);
    await discard();

    expect(fakePublicApi.count(READ)).toBe(reads + 1);
  });

  it("forgets the session's added sets", async () => {
    await open("/", SESSION);
    await fireEvent.press(screen.getByText("Add Set"));
    await go(() => router.back());
    expect(screen.getByText("Added sets: 1")).toBeTruthy();

    await go(() => router.push(SESSION));
    await discard();

    expect(screen.getByText("Added sets: 0")).toBeTruthy();
  });

  it("reads Exercise history again", async () => {
    await open("/", SESSION);
    queryClient.setQueryData(["exercise-history", "x"], 1);
    await discard();

    expect(
      queryClient.getQueryState(["exercise-history", "x"])?.isInvalidated
    ).toBe(true);
  });

  it("frees Start even when the open Workout Session can't be read again", async () => {
    await open("/", SESSION);
    fakePublicApi.failNext(LIST, "network", IN_PROGRESS);
    await discard();

    expect(screen.getByText("Open: none")).toBeTruthy();
  });

  it("sends the event once it succeeded", async () => {
    setLogged("s1-e1-s2", 0);
    await openSession();
    fakePublicApi.failNext(DELETE, { status: 500 });
    await discard();
    expect(sentAnalytics.events()).toEqual([]);

    await discard();
    expect(sentAnalytics.events()).toEqual([
      {
        name: "Workout Discarded",
        properties: { logged_set_count: 2, source: "menu" },
      },
    ]);
  });
});

describe("when the session isn't open any more", () => {
  it("deletes nothing finished elsewhere, and shows it finished", async () => {
    await openSession();
    finishElsewhere();
    await discard();

    expect(fakePublicApi.count(DELETE)).toBe(0);
    expect(backend.session("s1")).toBeDefined();
    expect(alerts()).toEqual([["Workout already finished"]]);
    expect(isSessionShown()).toBe(true);
    expect(screen.queryByTestId("finish-workout-button")).toBeNull();
    expect(screen.queryByLabelText(OPTIONS)).toBeNull();
    expect(sentAnalytics.events()).toEqual([]);
  });

  it("keeps a newer read of the finished session", async () => {
    await openSession();
    const resume = fakePublicApi.pause(READ);
    const reads = fakePublicApi.count(READ);
    finishElsewhere();
    await startDiscard();
    await until(() => fakePublicApi.count(READ) === reads + 1);
    // A read landing meanwhile, after another client's change.
    const shown = queryClient.getQueryData<object>(SESSION_KEY);
    queryClient.setQueryData(SESSION_KEY, { ...shown, weight_unit: "lbs" });
    backend.profiles[0].measurement_system = "us";
    resume();
    await settle(queryClient);

    // Read again rather than shown from the older answer.
    expect(fakePublicApi.count(READ)).toBe(reads + 2);
    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      finished_at: expect.any(String),
      weight_unit: "lbs",
    });
  });

  it("shows it finished even when reading it again fails", async () => {
    await openSession();
    const resume = fakePublicApi.pause(READ);
    const reads = fakePublicApi.count(READ);
    finishElsewhere();
    await startDiscard();
    await until(() => fakePublicApi.count(READ) === reads + 1);
    const shown = queryClient.getQueryData<object>(SESSION_KEY);
    queryClient.setQueryData(SESSION_KEY, { ...shown });
    fakePublicApi.failNext(READ, "pass");
    fakePublicApi.failNext(READ, { status: 500 });
    resume();
    await settle(queryClient);

    expect(queryClient.getQueryData(SESSION_KEY)).toMatchObject({
      finished_at: expect.any(String),
    });
    expect(alerts()).toEqual([["Workout already finished"]]);
  });

  it("counts one deleted elsewhere as discarded, with no DELETE", async () => {
    await openSession();
    backend.sessions = [];
    await discard();

    expect(fakePublicApi.count(DELETE)).toBe(0);
    expect(alerts()).toEqual([]);
    expect(pathname).toBe(WORKOUT);
    expect(sentAnalytics.events()).toEqual([
      {
        name: "Workout Discarded",
        properties: { logged_set_count: 1, source: "menu" },
      },
    ]);
  });
});

describe("a failure", () => {
  it.each([READ, DELETE] as const)(
    "%s keeps the session on screen, and is reported",
    async (route) => {
      await openSession();
      fakePublicApi.failNext(route, { status: 500 });
      await discard();

      expect(alerts()).toEqual([FAILED]);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(backend.session("s1")).toBeDefined();
      expect(isSessionShown()).toBe(true);
      expect(fakePublicApi.count(DELETE)).toBe(route === DELETE ? 1 : 0);

      await discard();
      expect(backend.session("s1")).toBeUndefined();
    }
  );

  it.each([READ, DELETE] as const)(
    "%s rate limited gives the wait, unreported",
    async (route) => {
      await openSession();
      fakePublicApi.failNext(route, { retryAfterSeconds: 12, status: 429 });
      await discard();

      expect(alerts()).toEqual([
        [
          "Couldn't discard workout",
          "Too many requests: please try again in 12 s.",
        ],
      ]);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(isSessionShown()).toBe(true);
    }
  );

  it("counts trying again after a lost answer as discarded", async () => {
    await openSession();
    fakePublicApi.failNext(DELETE, "lost");
    await discard();

    expect(alerts()).toEqual([FAILED]);
    expect(isSessionShown()).toBe(true);

    await discard();
    expect(fakePublicApi.count(DELETE)).toBe(1);
    expect(alerts()).toEqual([]);
    expect(pathname).toBe(WORKOUT);
    expect(sentAnalytics.events()).toHaveLength(1);
  });
});

const pressFinish = () =>
  fireEvent.press(screen.getByTestId("finish-workout-button"));

const logNothing = () => {
  Object.assign(backend.sets[0], { logged_at: null, reps_completed: null });
};

const NOTHING_LOGGED = ["Finish workout?", "Nothing has been logged yet."];

describe("the Finish alert", () => {
  it("offers Discard with no set logged, without a second question", async () => {
    logNothing();
    await openSession();
    await pressFinish();

    expect(alerts()).toEqual([NOTHING_LOGGED]);
    expect(lastButtons().map(({ style, text }) => ({ style, text }))).toEqual([
      { style: "cancel", text: "Cancel" },
      { style: "destructive", text: "Discard" },
      { style: undefined, text: "Finish" },
    ]);

    const sent = fakePublicApi.requests.length;
    await answer("Discard");
    await settle(queryClient);

    expect(requestsSince(sent).slice(0, 2)).toEqual([READ, DELETE]);
    expect(backend.session("s1")).toBeUndefined();
    expect(pathname).toBe(WORKOUT);
    expect(alerts()).toHaveLength(1);
    expect(sentAnalytics.events()).toEqual([
      {
        name: "Workout Discarded",
        properties: { logged_set_count: 0, source: "finish_alert" },
      },
    ]);
  });

  it("offers Discard when every Exercise has been removed", async () => {
    Object.assign(backend, { exercises: [], sets: [] });
    await openSession();
    await pressFinish();

    expect(alerts()).toEqual([NOTHING_LOGGED]);
    await answer("Discard");
    await settle(queryClient);
    expect(backend.session("s1")).toBeUndefined();
  });

  it("finishes anyway on Finish", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    await answer("Finish");
    await settle(queryClient);

    expect(fakePublicApi.count(FINISH)).toBe(1);
    expect(fakePublicApi.count(DELETE)).toBe(0);
    expect(backend.session("s1")?.finished_at).not.toBeNull();
    expect(pathname).toBe(`${BARE_SESSION}/summary`);
    // Finished, not discarded.
    expect(sentAnalytics.events()).toEqual([
      {
        name: "Workout Completed",
        properties: { plan_id: "plan-1", workout_id: "workout-1" },
      },
    ]);
  });

  it("changes nothing when cancelled or dismissed, and asks again after", async () => {
    logNothing();
    await openSession();
    const sent = fakePublicApi.requests.length;
    await pressFinish();
    await answer("Cancel");
    await pressFinish();
    jest.mocked(Alert.alert).mock.lastCall?.[3]?.onDismiss?.();
    await settle(queryClient);

    expect(alerts()).toEqual([NOTHING_LOGGED, NOTHING_LOGGED]);
    expect(requestsSince(sent)).toEqual([]);
    expect(isSessionShown()).toBe(true);
  });

  it.each([0, 8])(
    "has no Discard once a set is logged with %i reps",
    async (reps) => {
      setLogged("s1-e1-s1", reps);
      await openSession();
      await pressFinish();

      expect(alerts()).toEqual([
        ["Finish workout?", "1 planned set isn't logged."],
      ]);
      expect(lastButtons().map(({ text }) => text)).toEqual([
        "Cancel",
        "Finish",
      ]);
    }
  );

  it("is asked once, and never with the menu's question", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    await pressFinish();
    await ask();
    expect(alerts()).toEqual([NOTHING_LOGGED]);

    await answer("Cancel");
    await ask();
    await pressFinish();
    expect(alerts()).toEqual([
      NOTHING_LOGGED,
      ["Discard workout?", "Nothing has been logged yet."],
    ]);
  });

  it("discards once, and nothing else runs meanwhile", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    const buttons = lastButtons();
    const resume = fakePublicApi.pause(DELETE);
    await answer("Discard");
    await until(() => fakePublicApi.count(DELETE) === 1);
    await act(async () => {
      for (const button of buttons) {
        button.onPress?.();
      }

      await Promise.resolve();
    });
    await ask();
    resume();
    await settle(queryClient);

    expect(alerts()).toEqual([NOTHING_LOGGED]);
    expect(fakePublicApi.count(DELETE)).toBe(1);
    expect(fakePublicApi.count(FINISH)).toBe(0);
  });

  it("keeps the session when the discard fails, then tries again", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    fakePublicApi.failNext(DELETE, { status: 500 });
    await answer("Discard");
    await settle(queryClient);

    expect(alerts().at(-1)).toEqual(FAILED);
    expect(isSessionShown()).toBe(true);
    expect(sentAnalytics.events()).toEqual([]);

    await pressFinish();
    await answer("Discard");
    await settle(queryClient);
    expect(backend.session("s1")).toBeUndefined();
    expect(sentAnalytics.events()).toHaveLength(1);
  });

  it("deletes nothing finished elsewhere", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    finishElsewhere();
    await answer("Discard");
    await settle(queryClient);

    expect(alerts().at(-1)).toEqual(["Workout already finished"]);
    expect(fakePublicApi.count(DELETE)).toBe(0);
    expect(sentAnalytics.events()).toEqual([]);
  });
});

describe("one at a time", () => {
  it("Finish and another discard do nothing while a discard is pending", async () => {
    await openSession();
    await ask();
    const first = lastButtons();
    const resume = fakePublicApi.pause(READ);
    const reads = fakePublicApi.count(READ);
    await answer("Discard");
    await until(() => fakePublicApi.count(READ) === reads + 1);
    jest.mocked(Alert.alert).mockClear();

    await act(async () => {
      first.at(-1)?.onPress?.();
      await Promise.resolve();
    });
    await ask();
    await fireEvent.press(screen.getByTestId("finish-workout-button"));
    expect(alerts()).toEqual([]);
    resume();
    await settle(queryClient);

    expect(fakePublicApi.count(FINISH)).toBe(0);
    expect(fakePublicApi.count(DELETE)).toBe(1);
  });

  it("a discard does nothing while a finish is pending, confirmed or not", async () => {
    setLogged("s1-e1-s2", 8);
    await openSession();
    await ask();
    const resume = fakePublicApi.pause(FINISH);
    await fireEvent.press(screen.getByTestId("finish-workout-button"));
    await until(() => fakePublicApi.count(FINISH) === 1);

    await answer("Discard");
    jest.mocked(Alert.alert).mockClear();
    await ask();
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(DELETE)).toBe(0);
    resume();
    await settle(queryClient);

    expect(backend.session("s1")?.finished_at).not.toBeNull();
    expect(fakePublicApi.count(DELETE)).toBe(0);
  });
});

describe.each([null, "user_other"])("after signing in as %s", (userId) => {
  it("sends nothing when the question is answered", async () => {
    await openSession();
    await ask();
    const sent = fakePublicApi.requests.length;
    signInAs(userId);
    await answer("Discard");
    await settle(queryClient);

    expect(requestsSince(sent)).toEqual([]);
  });

  it("sends nothing when the Finish alert's Discard is answered", async () => {
    logNothing();
    await openSession();
    await pressFinish();
    const sent = fakePublicApi.requests.length;
    signInAs(userId);
    await answer("Discard");
    await settle(queryClient);

    expect(requestsSince(sent)).toEqual([]);
  });

  it.each([READ, DELETE] as const)(
    "shows, opens and sends nothing once %s answers",
    async (route) => {
      await openSession();
      const resume = fakePublicApi.pause(route);
      const before = fakePublicApi.count(route);
      await startDiscard();
      await until(() => fakePublicApi.count(route) === before + 1);
      const sent = fakePublicApi.requests.length;
      signInAs(userId);
      resume();
      await settle(queryClient);

      expect(requestsSince(sent)).toEqual([]);
      expect(alerts()).toEqual([]);
      expect(pathname).toBe(SESSION);
      expect(sentAnalytics.events()).toEqual([]);
    }
  );

  it("alerts nothing about a failure", async () => {
    await openSession();
    const resume = fakePublicApi.pause(DELETE);
    fakePublicApi.failNext(DELETE, { status: 500 });
    await startDiscard();
    await until(() => fakePublicApi.count(DELETE) === 1);
    signInAs(userId);
    resume();
    await settle(queryClient);

    expect(alerts()).toEqual([]);
  });
});

describe("in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("asks, with the plural, and discards", async () => {
    setLogged("s1-e1-s2", 0);
    await openSession();

    expect(screen.getByLabelText("Параметри тренування")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Відкинути тренування"));
    expect(alerts()).toEqual([
      [
        "Відкинути тренування?",
        "2 записані підходи буде видалено. Це не можна скасувати.",
      ],
    ]);
    expect(lastButtons().map(({ text }) => text)).toEqual([
      "Продовжити тренування",
      "Відкинути",
    ]);
    fakePublicApi.failNext(DELETE, { retryAfterSeconds: 12, status: 429 });
    await answer("Відкинути");
    await settle(queryClient);
    expect(alerts().at(-1)).toEqual([
      "Не вдалося відкинути тренування",
      "Забагато запитів: спробуйте ще раз через 12 с.",
    ]);

    await fireEvent.press(screen.getByLabelText("Відкинути тренування"));
    await answer("Відкинути");
    await settle(queryClient);
    expect(backend.session("s1")).toBeUndefined();
  });

  it("offers Discard in the Finish alert with nothing logged", async () => {
    logNothing();
    await openSession();
    await pressFinish();

    expect(alerts()).toEqual([
      ["Завершити тренування?", "Ще нічого не записано."],
    ]);
    expect(lastButtons().map(({ text }) => text)).toEqual([
      "Скасувати",
      "Відкинути",
      "Завершити",
    ]);
    await answer("Відкинути");
    await settle(queryClient);
    expect(backend.session("s1")).toBeUndefined();
  });

  it("says it's already finished", async () => {
    await openSession();
    await fireEvent.press(screen.getByLabelText("Відкинути тренування"));
    finishElsewhere();
    await answer("Відкинути");
    await settle(queryClient);

    expect(alerts().at(-1)).toEqual(["Тренування вже завершено"]);
  });
});
