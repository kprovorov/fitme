/**
 * The Workout Session screen, the Workout Session Exercise screen and the
 * Workout Summary read the Workout Session through the Public API
 * (`GET /v1/workout-sessions/{id}`, FIT-543), never Supabase: what each shows,
 * where each links, the answers of Start and Finish shown with no second
 * read, and a failed read with and without one already shown.
 *
 * Mounts the real screens on the fake Public API, with the fake Library
 * naming the Exercises and Exercise history still on the in-memory Supabase
 * backend; the SwiftUI-backed primitives are swapped for plain stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { pushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

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

// Exercise history is still read through Supabase.
jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
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
// A symbol shows as a view naming it: a Summary row's trophy.
jest.mock("~/components/symbol-image", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SymbolImage: ({ name }: { name: string }) => (
      <View testID={`symbol:${name}`} />
    ),
  };
});
// The body diagram reads theme colors uniwind has no stylesheet for in Jest.
jest.mock("~/components/views/workout-session-summary-body", () => ({
  WorkoutSessionSummaryBodyBack: () => null,
  WorkoutSessionSummaryBodyFront: () => null,
}));
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
const SESSION_LOAD_ERROR =
  "Couldn't load this workout. Check your connection and try again.";
const EXERCISE_LOAD_ERROR =
  "Couldn't load this exercise. Check your connection and try again.";
const RATE_LIMITED = "Too many requests: please try again in 12 s.";

// An Exercise card's or row's header, read with its muscle groups.
const SQUAT = /^Squat/;
const BENCH_PRESS = /^Bench Press/;

const TROPHY = "symbol:trophy.fill";

const SESSION_SCREEN = "/plans/plan-1/workouts/workout-1/sessions/s1";

// Each test mounts a whole screen and steps through many requests.
jest.setTimeout(30_000);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await settle(queryClient);
};

const mountSession = (sessionId = "s1") =>
  mount(<WorkoutSessionScreen sessionId={sessionId} />);

const mountExercise = (exerciseId: string) => {
  mockParams.current = {
    exerciseId,
    planId: "plan-1",
    sessionId: "s1",
    workoutId: "workout-1",
  };
  return mount(<WorkoutSessionExerciseScreen />);
};

const mountSummary = () => {
  mockParams.current = { workoutSessionId: "s1" };
  return mount(<WorkoutSessionSummaryScreen />);
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

/**
 * No Workout Session was read through Supabase (the fake backend refuses a
 * Workout Session Exercise read by id outright, failing the test).
 */
const readNothingThroughSupabase = () =>
  expect(
    backend.requests.filter(({ table }) => table === "workout_sessions")
  ).toEqual([]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([
    libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
    libraryExercise("bench-press", {
      muscle_groups: ["chest"],
      name: "Bench Press",
    }),
  ]);
});

describe("The Workout Session screen", () => {
  beforeEach(() => {
    backend.seed({
      exercises: [
        { name: "Squat", sets: [8, null] },
        { name: "Bench Press", sets: [null] },
      ],
      id: "s1",
      workoutId: "workout-1",
    });
    setSet("s1-e1-s1", { weight_completed: 100, weight_recommended: 100 });
    setSet("s1-e1-s2", { weight_recommended: 105 });
    setSet("s1-e2-s1", { reps_recommended: 5, weight_recommended: 60 });
  });

  it("shows its Workout, Exercises and sets, read through the Public API", async () => {
    await mountSession();

    expect(screen.getByText("Workout s1")).toBeTruthy();
    expect(screen.getByRole("button", { name: SQUAT })).toBeTruthy();
    expect(screen.getByRole("button", { name: BENCH_PRESS })).toBeTruthy();
    // Each set's target, in the session's unit; one of three sets logged.
    expect(screen.getByText("10×100kg")).toBeTruthy();
    expect(screen.getByText("10×105kg")).toBeTruthy();
    expect(screen.getByText("5×60kg")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    // The logged set: 8 × 100 kg.
    expect(screen.getByText("800 kg")).toBeTruthy();
    expect(fakePublicApi.count(READ)).toBe(1);
    readNothingThroughSupabase();
  });

  it("shows weights in the unit the session answers with", async () => {
    backend.profiles[0].measurement_system = "us";
    await mountSession();

    expect(screen.getByText("10×100lbs")).toBeTruthy();
    expect(screen.getByText("800 lbs")).toBeTruthy();
  });

  it("opens each Exercise under the session's Plan and Workout", async () => {
    await mountSession();

    await fireEvent.press(screen.getByRole("button", { name: BENCH_PRESS }));

    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      `${SESSION_SCREEN}/exercises/s1-e2`,
    ]);
  });

  it("opens no Exercise once its Workout is gone", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    backend.seed({
      exercises: [{ name: "Squat", sets: [null] }],
      id: "s1",
      planId: null,
      workoutId: null,
    });
    await mountSession();

    expect(screen.getByText(SQUAT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: SQUAT })).toBeNull();
  });

  it("shows the load error with nothing read, and Try Again reads it again", async () => {
    fakePublicApi.failNext(READ, { status: 500 });
    await mountSession();

    expect(screen.getByText(SESSION_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText("Workout s1")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Workout s1")).toBeTruthy();
    expect(screen.queryByText(SESSION_LOAD_ERROR)).toBeNull();
  });

  it("gives the wait when the read is rate limited", async () => {
    fakePublicApi.failNext(READ, { retryAfterSeconds: 12, status: 429 });
    await mountSession();

    expect(screen.getByText(RATE_LIMITED)).toBeTruthy();
    expect(screen.queryByText(SESSION_LOAD_ERROR)).toBeNull();
  });

  it("keeps the session on screen when a refresh fails", async () => {
    await mountSession();
    fakePublicApi.failNext(READ, "network");

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
    });
    await settle(queryClient);

    expect(fakePublicApi.count(READ)).toBe(2);
    expect(screen.getByText("Workout s1")).toBeTruthy();
    expect(screen.getByText("10×100kg")).toBeTruthy();
    expect(screen.queryByText(SESSION_LOAD_ERROR)).toBeNull();
  });

  it("shows another User's Workout Session as the load error", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "theirs",
      userId: "user_other",
    });
    await mountSession("theirs");

    expect(screen.getByText(SESSION_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText("Workout theirs")).toBeNull();
  });
});

describe("The Workout Session Exercise screen", () => {
  beforeEach(() => {
    backend.seed({
      exercises: [
        { name: "Squat", sets: [8, null] },
        { name: "Bench Press", sets: [6, null] },
      ],
      id: "s1",
      workoutId: "workout-1",
    });
    setSet("s1-e2-s1", { weight_completed: 60, weight_recommended: 60 });
    setSet("s1-e2-s2", { reps_recommended: 8, weight_recommended: 65 });
  });

  it("shows its Exercise's sets and targets, picked from the session's read", async () => {
    await mountExercise("s1-e2");

    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("10×60kg")).toBeTruthy();
    expect(screen.getByText("8×65kg")).toBeTruthy();
    // The other Exercise's sets aren't here.
    expect(screen.queryByText(SQUAT)).toBeNull();
    expect(fakePublicApi.count(READ)).toBe(1);
    readNothingThroughSupabase();
  });

  it("shows the load error for an Exercise the session no longer has", async () => {
    await mountExercise("s1-e9");

    expect(screen.getByText(EXERCISE_LOAD_ERROR)).toBeTruthy();
  });

  it("shows the load error with nothing read, and Try Again reads it again", async () => {
    fakePublicApi.failNext(READ, "network");
    await mountExercise("s1-e2");

    expect(screen.getByText(EXERCISE_LOAD_ERROR)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("10×60kg")).toBeTruthy();
  });

  it("gives the wait when the read is rate limited", async () => {
    fakePublicApi.failNext(READ, { retryAfterSeconds: 12, status: 429 });
    await mountExercise("s1-e2");

    expect(screen.getByText(RATE_LIMITED)).toBeTruthy();
  });

  it("keeps its sets on screen when a refresh fails", async () => {
    await mountExercise("s1-e2");
    fakePublicApi.failNext(READ, { status: 500 });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
    });
    await settle(queryClient);

    expect(fakePublicApi.count(READ)).toBe(2);
    expect(screen.getByText("10×60kg")).toBeTruthy();
    expect(screen.queryByText(EXERCISE_LOAD_ERROR)).toBeNull();
  });
});

describe("The Workout Summary", () => {
  beforeEach(() => {
    // An earlier finished session: Bench Press at 60 kg, Squat at 120 kg.
    backend.seed({
      exercises: [
        { name: "Bench Press", sets: [5] },
        { name: "Squat", sets: [5] },
      ],
      finished: true,
      id: "s0",
    });
    setSet("s0-e1-s1", { weight_completed: 60 });
    setSet("s0-e2-s1", { weight_completed: 120 });
    // This one: Bench Press up to 70 kg, Squat below its best, a skipped Dip.
    backend.seed({
      exercises: [
        { name: "Bench Press", sets: [5, 5] },
        { name: "Squat", sets: [5] },
        { name: "Dip", sets: [null] },
      ],
      finished: true,
      id: "s1",
      workoutId: "workout-1",
    });
    setSet("s1-e1-s1", { weight_completed: 60 });
    setSet("s1-e1-s2", { weight_completed: 70 });
    setSet("s1-e2-s1", { weight_completed: 100 });
  });

  it("shows the finished session's stats, read through the Public API", async () => {
    await mountSummary();

    expect(screen.getByText("Workout Complete!")).toBeTruthy();
    expect(screen.getByLabelText("Duration: 1h 0min")).toBeTruthy();
    // 60×5 + 70×5 + 100×5; the skipped Dip doesn't count.
    expect(screen.getByLabelText("Volume: 1,150 kilograms")).toBeTruthy();
    expect(screen.getByLabelText("Exercises: 2 exercises")).toBeTruthy();
    expect(screen.getByLabelText("Sets: 3 sets")).toBeTruthy();
    expect(screen.getByLabelText("Bench Press, 2 sets")).toBeTruthy();
    expect(screen.getByLabelText("Squat, 1 set")).toBeTruthy();
    expect(screen.queryByText("Dip")).toBeNull();
    expect(fakePublicApi.count(READ)).toBe(1);
    readNothingThroughSupabase();
  });

  it("marks the Exercises whose weight is a Personal record", async () => {
    await mountSummary();

    const bench = screen.getByLabelText("Bench Press, 2 sets");
    const squat = screen.getByLabelText("Squat, 1 set");
    expect(within(bench).queryAllByTestId(TROPHY)).toHaveLength(1);
    expect(within(squat).queryAllByTestId(TROPHY)).toHaveLength(0);
  });

  it("opens its Exercises under the session's Plan and Workout", async () => {
    await mountSummary();

    await fireEvent.press(screen.getByLabelText("Squat, 1 set"));

    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/plans/plan-1/workouts/workout-1/sessions/s1/exercises/s1-e2",
    ]);
  });

  it("opens no Exercise once its Plan and Workout are gone", async () => {
    backend.sessions[1].plan_id = null;
    backend.sessions[1].workout_id = null;
    await mountSummary();

    const squat = screen.getByLabelText("Squat, 1 set");
    expect(squat.props.accessibilityRole).toBeUndefined();
    await fireEvent.press(squat);

    expect(pushedRoutes()).toEqual([]);
  });

  it("shows the load error with nothing read, or the wait", async () => {
    fakePublicApi.failNext(READ, { status: 500 });
    await mountSummary();

    expect(screen.getByText(SESSION_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText("Workout Complete!")).toBeNull();

    fakePublicApi.failNext(READ, { retryAfterSeconds: 12, status: 429 });
    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText(RATE_LIMITED)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Workout Complete!")).toBeTruthy();
  });
});

describe("Start and Finish", () => {
  it("opens the Workout Session on Start's answer, with no second read", async () => {
    backend.seedPlan({
      id: "plan-1",
      is_active: true,
      name: "Strength",
      workouts: [
        {
          exercises: [
            { sets: 2, slug: "squat" },
            { sets: 1, slug: "bench-press" },
          ],
          id: "workout-1",
          name: "Leg Day",
        },
      ],
    });
    mockParams.current = { planId: "plan-1", workoutId: "workout-1" };
    await mount(<WorkoutScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Start Workout" })
    );
    await settle(queryClient);
    const [started] = backend.sessions;
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      `/plans/plan-1/workouts/workout-1/sessions/${started?.id}`,
    ]);

    // The pushed route's screen, in the same app.
    await render(
      <QueryClientProvider client={queryClient}>
        <WorkoutSessionScreen sessionId={started?.id ?? ""} />
      </QueryClientProvider>
    );
    await settle(queryClient);

    expect(screen.getByText("Leg Day")).toBeTruthy();
    expect(screen.getByRole("button", { name: SQUAT })).toBeTruthy();
    expect(screen.getByRole("button", { name: BENCH_PRESS })).toBeTruthy();
    expect(screen.getByText("0/3")).toBeTruthy();
    expect(fakePublicApi.count(READ)).toBe(0);
    readNothingThroughSupabase();
  });

  it("opens the Summary on Finish's answer, with no second read", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [8] }],
      id: "s1",
      workoutId: "workout-1",
    });
    await mountSession();
    expect(fakePublicApi.count(READ)).toBe(1);

    await fireEvent.press(screen.getByTestId("finish-workout-button"));
    await settle(queryClient);

    expect(fakePublicApi.count("POST /v1/workout-sessions/{id}/finish")).toBe(
      1
    );
    // It replaces the session's screen with its Summary
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/workout-sessions/s1/summary",
    ]);

    // The pushed route's screen, in the same app.
    mockParams.current = { workoutSessionId: "s1" };
    await render(
      <QueryClientProvider client={queryClient}>
        <WorkoutSessionSummaryScreen />
      </QueryClientProvider>
    );
    await settle(queryClient);

    expect(screen.getByText("Workout Complete!")).toBeTruthy();
    expect(screen.getByLabelText("Sets: 1 set")).toBeTruthy();
    expect(fakePublicApi.count(READ)).toBe(1);
    readNothingThroughSupabase();
  });
});
