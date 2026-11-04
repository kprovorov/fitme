/**
 * The Exercise history card on the Workout Session Exercise screen reads
 * `GET /v1/workout-session-exercises` through the Public API (FIT-546): the
 * entries and their sets (a bodyweight set and a set's target
 * among them), the next page read as the screen scrolls near its end, and a
 * failed read with and without a page already read.
 *
 * Mounts the real screen on the fake Public API, with the fake Library naming
 * the Exercises; the SwiftUI-backed primitives are swapped for plain
 * stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    Stack: { Screen: stub.StackScreenStub },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({ ...stub.stubRouter, canGoBack: () => true }),
  };
});
// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));
jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/workout-sessions/rest-timer", () => () => null);
jest.mock(
  "~/components/workout-sessions/workout-session-finish-suggestion",
  () => ({ WorkoutSessionFinishSuggestion: () => null })
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const HISTORY = "GET /v1/workout-session-exercises";
const HISTORY_LOAD_ERROR =
  "Couldn't load this exercise's history. Check your connection and try again.";
const RATE_LIMITED = "Too many requests: please try again in 12 s.";

// A session's date in the card, this year, so without it; an American device
// puts the month first.
const SESSION_DATE = /^(January|February) \d+$/;

const SCROLL_VIEW = "workout-session-exercise-scroll";

/** Each test mounts a whole screen and steps through many requests. */
jest.setTimeout(30_000);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await settle(queryClient);
};

/** The screen of the Squat the open Workout Session `now` is logging. */
const mountExerciseScreen = () => {
  mockParams.current = {
    exerciseId: "now-e1",
    planId: "plan-1",
    sessionId: "now",
    workoutId: "workout-1",
  };
  return mount(<WorkoutSessionExerciseScreen />);
};

/** Sets a seeded set's targets and result, weights in the Profile's unit. */
const setSet = (
  id: string,
  values: {
    reps_completed?: number | null;
    reps_recommended?: number | null;
    weight_completed?: number | null;
    weight_recommended?: number | null;
  }
) => {
  const set = backend.sets.find((candidate) => candidate.id === id);
  if (!set) {
    throw new Error(`No seeded set ${id}`);
  }
  Object.assign(set, values);
};

/** A past Workout Session of one Squat with `sets` logged reps. */
const seedPast = (id: string, startedAt: string, sets: Array<number | null>) =>
  backend.seed({
    exercises: [{ name: "Squat", sets }],
    finished: true,
    id,
    startedAt,
  });

const scrollEvent = (offset: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: offset },
    contentSize: { height: 10_000, width: 400 },
    layoutMeasurement: { height: 800, width: 400 },
  },
});

/** Scrolls the screen to `offset`, on a 800 pt screen of 10,000 pt content. */
const scrollTo = async (offset: number) => {
  await fireEvent.scroll(screen.getByTestId(SCROLL_VIEW), scrollEvent(offset));
  await settle(queryClient);
};

/** Ends a drag at `offset`, the User's own gesture. */
const dragEndAt = async (offset: number) => {
  await fireEvent(
    screen.getByTestId(SCROLL_VIEW),
    "scrollEndDrag",
    scrollEvent(offset)
  );
  await settle(queryClient);
};

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([libraryExercise("squat", { muscle_groups: ["quadriceps"] })]);
  // The session being logged, left out of its own history.
  backend.seed({
    exercises: [{ name: "Squat", sets: [null] }],
    id: "now",
    startedAt: "2026-02-10T10:00:00.000Z",
    workoutId: "workout-1",
  });
});

describe("The Exercise history card", () => {
  beforeEach(() => {
    // Two past sessions: one with a weight and a target, one bodyweight.
    seedPast("past-1", "2026-02-03T10:00:00.000Z", [8, 10]);
    setSet("past-1-e1-s1", {
      reps_recommended: 10,
      weight_completed: 100,
      weight_recommended: 95,
    });
    setSet("past-1-e1-s2", { reps_recommended: 10, weight_completed: 105 });
    seedPast("past-2", "2026-01-27T10:00:00.000Z", [12]);
    setSet("past-2-e1-s1", {
      reps_recommended: null,
      weight_completed: null,
      weight_recommended: null,
    });
  });

  it("shows each past session and its sets, read through the Public API", async () => {
    await mountExerciseScreen();

    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();
    // Newest Workout Session first, by its `started_at`.
    expect(
      screen.getAllByText(SESSION_DATE).map((date) => date.children)
    ).toEqual([["February 3"], ["January 27"]]);
    // The sets of the newer session: 8 × 100 kg, then 10 × 105 kg.
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("105")).toBeTruthy();
    // Its first set's target, in the answer's unit.
    expect(screen.getByText("10×95kg")).toBeTruthy();
    // One read, for the Exercise on screen.
    expect(fakePublicApi.count(HISTORY, { exercise_slug: "squat" })).toBe(1);
  });

  it("shows a bodyweight set, which logs no weight, with no target", async () => {
    await mountExerciseScreen();

    expect(screen.getByLabelText("Set 1: 12 reps")).toBeTruthy();
    // Nothing logged and nothing targeted shows as a dash.
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("shows the weights in the unit the answer carries", async () => {
    backend.profiles[0].measurement_system = "us";
    await mountExerciseScreen();

    expect(screen.getByText("10×95lbs")).toBeTruthy();
    expect(
      screen.getByLabelText("Set 1: 8 reps, 100 lbs. Target 10×95lbs")
    ).toBeTruthy();
  });

  it("leaves out the session being logged", async () => {
    setSet("now-e1-s1", { reps_completed: 6 });
    await mountExerciseScreen();

    expect(screen.queryByText("February 10")).toBeNull();
    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(2);
  });
});

describe("The Exercise history card's pages", () => {
  beforeEach(() => {
    // 21 past sessions: a first page of 20, then one more. Each set carries a
    // weight target, so its own entry's unit shows inline (`10×95kg`).
    for (let index = 0; index < 21; index += 1) {
      seedPast(
        `past-${index}`,
        `2026-01-${String(21 - index).padStart(2, "0")}T10:00:00.000Z`,
        [8]
      );
      setSet(`past-${index}-e1-s1`, { weight_recommended: 95 });
    }
  });

  it("reads 20 entries first, then the next page as the screen scrolls near its end", async () => {
    await mountExerciseScreen();

    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(20);
    expect(fakePublicApi.count(HISTORY)).toBe(1);

    await scrollTo(9000);

    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(21);
    expect(fakePublicApi.count(HISTORY)).toBe(2);
    expect(
      fakePublicApi.requests.filter(({ route }) => route === HISTORY).at(-1)
        ?.query
    ).toEqual({ exercise_slug: "squat", limit: "20", offset: "20" });
  });

  it("reads no further page once every entry has been read", async () => {
    await mountExerciseScreen();
    await scrollTo(9000);
    await scrollTo(9500);

    expect(fakePublicApi.count(HISTORY)).toBe(2);
  });

  it("asks for no page while the screen is far from its end", async () => {
    await mountExerciseScreen();
    await scrollTo(100);

    expect(fakePublicApi.count(HISTORY)).toBe(1);
  });

  it("stops asking on scroll once a page has failed, and a drag asks again", async () => {
    await mountExerciseScreen();
    fakePublicApi.failNext(HISTORY, { status: 500 });
    await scrollTo(9000);

    // The failed page left the first one's entries on screen.
    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(20);
    expect(fakePublicApi.count(HISTORY)).toBe(2);

    // Scrolling on, however much, never asks again: it would hammer the API.
    await scrollTo(9100);
    await scrollTo(9200);
    expect(fakePublicApi.count(HISTORY)).toBe(2);

    // The User's own gesture does.
    await dragEndAt(9200);

    expect(fakePublicApi.count(HISTORY)).toBe(3);
    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(21);
  });

  it("waits out a rate-limited page before even a drag asks again", async () => {
    await mountExerciseScreen();
    fakePublicApi.failNext(HISTORY, { retryAfterSeconds: 12, status: 429 });
    await scrollTo(9000);
    expect(fakePublicApi.count(HISTORY)).toBe(2);

    await dragEndAt(9000);
    expect(fakePublicApi.count(HISTORY)).toBe(2);

    // Once `Retry-After` has passed, a drag asks again.
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 13_000);
    await dragEndAt(9000);

    expect(fakePublicApi.count(HISTORY)).toBe(3);
  });

  it("shows each page's entries in that page's own unit", async () => {
    await mountExerciseScreen();
    expect(screen.getAllByText("10×95kg")).toHaveLength(20);

    // The measurement system is switched elsewhere (Arnold, MCP, another
    // device) between the two reads, so the API answers the next page in the
    // other unit.
    backend.profiles[0].measurement_system = "us";
    await scrollTo(9000);

    // The pages already read keep their own unit; only the new one is lbs.
    expect(screen.getAllByText("10×95kg")).toHaveLength(20);
    expect(screen.getAllByText("10×95lbs")).toHaveLength(1);
  });
});

describe("The Exercise history card's failures", () => {
  beforeEach(() => {
    seedPast("past-1", "2026-02-03T10:00:00.000Z", [8]);
  });

  it("shows its load error with nothing read, and Try Again reads it again", async () => {
    fakePublicApi.failNext(HISTORY, { status: 500 });
    await mountExerciseScreen();

    expect(screen.getByText(HISTORY_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText(SESSION_DATE)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("February 3")).toBeTruthy();
    expect(screen.queryByText(HISTORY_LOAD_ERROR)).toBeNull();
  });

  it("gives the wait when the read is rate limited", async () => {
    fakePublicApi.failNext(HISTORY, { retryAfterSeconds: 12, status: 429 });
    await mountExerciseScreen();

    expect(screen.getByText(RATE_LIMITED)).toBeTruthy();
    expect(screen.queryByText(HISTORY_LOAD_ERROR)).toBeNull();
  });

  it("keeps what it read when a refresh fails", async () => {
    await mountExerciseScreen();
    expect(screen.getByText("February 3")).toBeTruthy();

    fakePublicApi.failNext(HISTORY, { status: 500 });
    await queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
    await settle(queryClient);

    expect(screen.getByText("February 3")).toBeTruthy();
    expect(screen.queryByText(HISTORY_LOAD_ERROR)).toBeNull();
  });
});
