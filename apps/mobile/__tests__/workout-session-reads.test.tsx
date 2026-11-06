/**
 * The Workout Session screen, the Workout Session Exercise screen and the
 * Workout Summary read the Workout Session through the Public API
 * (`GET /v1/workout-sessions/{id}`, FIT-543): what each shows,
 * where each links, the answers of Start and Finish shown with no second
 * read, and a failed read with and without one already shown.
 *
 * Mounts the real screens on the fake Public API, with the fake Library
 * naming the Exercises; the SwiftUI-backed primitives are swapped for plain stand-ins.
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
import {
  closePlanUpdatePrompt,
  showPlanUpdatePrompt,
} from "~/hooks/plan-update-prompt";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { pushedRoutes, resetStubRouter } from "~/test-utils/router-stub";
import { signInAs } from "~/test-utils/signed-in-user";

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

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

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

// The real prompt store, its question recorded.
jest.mock("~/hooks/plan-update-prompt", () => {
  const actual = jest.requireActual<
    typeof import("~/hooks/plan-update-prompt")
  >("~/hooks/plan-update-prompt");

  return {
    ...actual,
    showPlanUpdatePrompt: jest.fn(actual.showPlanUpdatePrompt),
  };
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
const START = "POST /v1/workout-sessions";
const FINISH = "POST /v1/workout-sessions/{id}/finish";
const PLAN_UPDATE = "GET /v1/workout-sessions/{id}/plan-update";
const LIST = "GET /v1/workout-sessions";
const IN_PROGRESS = { status: "in_progress" };

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
    logged_at?: string | null;
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
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

describe("the Workout Session screen", () => {
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

describe("the Workout Session Exercise screen", () => {
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

describe("the Workout Summary", () => {
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

/** Seeds Plan `plan-1` with its Workout `workout-1`, Leg Day, and opens its screen. */
const mountLegDay = async () => {
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
};

/** The mutation the test just started, kept past `queryClient.clear()`. */
const pendingMutation = () => {
  const [mutation] = queryClient.getMutationCache().getAll();

  if (!mutation) {
    throw new Error("No mutation started");
  }

  return mutation;
};

/**
 * Signs the User out before a write's answer, as AuthSync does (the screen
 * gone, the cache cleared), and signs `next` in (`null`: nobody).
 */
const signOutDuringWrite = async (next: string | null) => {
  await screen.unmount();
  queryClient.clear();
  signInAs(next);
};

describe("start and Finish", () => {
  it("opens the Workout Session on Start's answer, with no second read", async () => {
    await mountLegDay();

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
  });

  it("opens a resumed Workout Session on Start's answer, its logged sets included, with no read", async () => {
    await mountLegDay();
    // Started on another device after the Workout screen read none open.
    backend.seed({
      exercises: [{ name: "Squat", sets: [8, null] }],
      id: "resumed",
      workoutId: "workout-1",
    });
    setSet("resumed-e1-s1", { weight_completed: 100 });

    await fireEvent.press(
      screen.getByRole("button", { name: "Start Workout" })
    );
    await settle(queryClient);
    expect(fakePublicApi.count(START)).toBe(1);
    expect(backend.sessions).toHaveLength(1);
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/plans/plan-1/workouts/workout-1/sessions/resumed",
    ]);

    await render(
      <QueryClientProvider client={queryClient}>
        <WorkoutSessionScreen sessionId="resumed" />
      </QueryClientProvider>
    );
    await settle(queryClient);

    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByLabelText("Edit set 1")).toBeTruthy();
    expect(screen.getByText("800 kg")).toBeTruthy();
    expect(fakePublicApi.count(READ)).toBe(0);
  });
});

describe("a late Start or Finish answer", () => {
  it.each([
    ["nobody", null],
    ["another User", "user_next"],
  ])(
    "never shows or opens a Start's answer once %s is signed in",
    async (_, next) => {
      await mountLegDay();
      const resume = fakePublicApi.pause(START);
      await fireEvent.press(
        screen.getByRole("button", { name: "Start Workout" })
      );
      await until(() => fakePublicApi.count(START) === 1);
      const starting = pendingMutation();

      await signOutDuringWrite(next);
      const openReads = fakePublicApi.count(LIST, IN_PROGRESS);
      resume();
      await until(() => starting.state.status === "success");
      await settle(queryClient);

      expect(
        queryClient.getQueriesData({ queryKey: ["workout-session"] })
      ).toEqual([]);
      expect(fakePublicApi.count(LIST, IN_PROGRESS)).toBe(openReads);
      expect(pushedRoutes()).toEqual([]);
      expect(Alert.alert).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["nobody", null],
    ["another User", "user_next"],
  ])(
    "never shows a Finish's answer or its Summary once %s is signed in",
    async (_, next) => {
      backend.seed({
        exercises: [{ name: "Squat", sets: [8] }],
        id: "s1",
        workoutId: "workout-1",
      });
      await mountSession();
      const resume = fakePublicApi.pause(FINISH);
      await fireEvent.press(screen.getByTestId("finish-workout-button"));
      await until(() => fakePublicApi.count(FINISH) === 1);
      const finishing = pendingMutation();

      await signOutDuringWrite(next);
      // The next User's own read of that key is on its way.
      const reads = fakePublicApi.count(READ);
      const resumeRead = fakePublicApi.pause(READ);

      const nextUsersRead = next
        ? queryClient.fetchQuery(
            useWorkoutSessionQuery.getFetchOptions({ sessionId: "s1" })
          )
        : null;

      if (next) {
        await until(() => fakePublicApi.count(READ) === reads + 1);
      }

      const openReads = fakePublicApi.count(LIST, IN_PROGRESS);

      resume();
      await until(() => finishing.state.status === "success");

      // Not shown, not read again, and the next User's read not cancelled.
      expect(
        queryClient.getQueryData(
          useWorkoutSessionQuery.getKey({ sessionId: "s1" })
        )
      ).toBeUndefined();
      expect(fakePublicApi.count(LIST, IN_PROGRESS)).toBe(openReads);
      expect(fakePublicApi.count(PLAN_UPDATE)).toBe(0);
      expect(pushedRoutes()).toEqual([]);
      resumeRead();

      if (nextUsersRead) {
        await expect(nextUsersRead).resolves.toMatchObject({ id: "s1" });
      }

      await settle(queryClient);
      expect(fakePublicApi.count(READ)).toBe(reads + (next ? 1 : 0));
      expect(pushedRoutes()).toEqual([]);
    }
  );

  it("reads the session again instead when a newer read landed before Finish's answer", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [8] }],
      id: "s1",
      workoutId: "workout-1",
    });
    await mountSession();
    const resume = fakePublicApi.pause(FINISH);
    await fireEvent.press(screen.getByTestId("finish-workout-button"));
    await until(() => fakePublicApi.count(FINISH) === 1);

    // A read asked after the finish started lands first (a pull to refresh).
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: useWorkoutSessionQuery.getKey({ sessionId: "s1" }),
      });
    });
    const reads = fakePublicApi.count(READ);

    resume();
    await settle(queryClient);

    // The answer isn't put over it: the session is read again, finished.
    expect(fakePublicApi.count(READ)).toBe(reads + 1);
    expect(
      queryClient.getQueryData(
        useWorkoutSessionQuery.getKey({ sessionId: "s1" })
      )
    ).toMatchObject({ finished_at: expect.any(String), id: "s1" });
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/workout-sessions/s1/summary",
    ]);
  });

  describe("a resumed Start whose session is already read", () => {
    /** The Workout screen, then the session resumed: read, then a set logged elsewhere. */
    const mountWithCachedSession = async () => {
      await mountLegDay();
      backend.seed({
        exercises: [{ name: "Squat", sets: [8, null] }],
        id: "resumed",
        workoutId: "workout-1",
      });
      await act(async () => {
        await queryClient.fetchQuery(
          useWorkoutSessionQuery.getFetchOptions({ sessionId: "resumed" })
        );
      });
      setSet("resumed-e1-s2", {
        logged_at: "2026-10-08T10:40:00.000Z",
        reps_completed: 6,
      });
    };

    const shownSecondSet = () =>
      queryClient.getQueryData(
        useWorkoutSessionQuery.getKey({ sessionId: "resumed" })
      )?.exercises[0]?.sets[1]?.reps_completed;

    it("shows Start's answer over the read it started from, with no second read", async () => {
      await mountWithCachedSession();
      expect(fakePublicApi.count(READ)).toBe(1);

      await fireEvent.press(
        screen.getByRole("button", { name: "Start Workout" })
      );
      await settle(queryClient);

      expect(fakePublicApi.count(START)).toBe(1);
      expect(fakePublicApi.count(READ)).toBe(1);
      expect(shownSecondSet()).toBe(6);
      expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
        "/plans/plan-1/workouts/workout-1/sessions/resumed",
      ]);
    });

    it("reads it again instead when a newer read landed before Start's answer", async () => {
      await mountWithCachedSession();
      const resume = fakePublicApi.pause(START);
      await fireEvent.press(
        screen.getByRole("button", { name: "Start Workout" })
      );
      await until(() => fakePublicApi.count(START) === 1);

      await act(async () => {
        await queryClient.refetchQueries({
          queryKey: useWorkoutSessionQuery.getKey({ sessionId: "resumed" }),
        });
      });
      expect(fakePublicApi.count(READ)).toBe(2);

      resume();
      await settle(queryClient);

      // Not put over the newer read: marked to be read again, which the
      // session screen the Start opens does as it mounts.
      expect(
        queryClient.getQueryState(
          useWorkoutSessionQuery.getKey({ sessionId: "resumed" })
        )?.isInvalidated
      ).toBe(true);
      expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
        "/plans/plan-1/workouts/workout-1/sessions/resumed",
      ]);
      await render(
        <QueryClientProvider client={queryClient}>
          <WorkoutSessionScreen sessionId="resumed" />
        </QueryClientProvider>
      );
      await settle(queryClient);
      expect(fakePublicApi.count(READ)).toBe(3);
      expect(shownSecondSet()).toBe(6);
    });
  });

  describe("a Finish whose Plan Update is still being previewed", () => {
    const PROMPT = jest.mocked(showPlanUpdatePrompt);

    /** Squat logged where the Plan has Bench Press: a Plan Update to ask about. */
    const mountChangedSession = async () => {
      backend.seedPlan({
        id: "plan-1",
        is_active: true,
        name: "Strength",
        workouts: [
          {
            exercises: [{ sets: 1, slug: "bench-press" }],
            id: "workout-1",
            name: "Leg Day",
          },
        ],
      });
      backend.seed({
        exercises: [{ name: "Squat", sets: [8] }],
        id: "s1",
        workoutId: "workout-1",
      });
      await mountSession();
    };

    afterEach(() => {
      closePlanUpdatePrompt("s1");
    });

    it("asks about it once previewed", async () => {
      await mountChangedSession();

      await fireEvent.press(screen.getByTestId("finish-workout-button"));
      await settle(queryClient);

      expect(PROMPT).toHaveBeenCalledTimes(1);
      expect(pushedRoutes()).toEqual([]);
    });

    it.each([
      ["nobody", null],
      ["another User", "user_next"],
    ])(
      "never asks, nor opens the Summary, once %s is signed in",
      async (_, next) => {
        await mountChangedSession();
        const resume = fakePublicApi.pause(PLAN_UPDATE);
        await fireEvent.press(screen.getByTestId("finish-workout-button"));
        await until(() => fakePublicApi.count(PLAN_UPDATE) === 1);

        await signOutDuringWrite(next);
        const reads = fakePublicApi.requests.length;
        resume();
        await settle(queryClient);

        expect(PROMPT).not.toHaveBeenCalled();
        expect(pushedRoutes()).toEqual([]);
        expect(Alert.alert).not.toHaveBeenCalled();
        // Nothing read, or put in the cache, for whoever is signed in now.
        expect(fakePublicApi.requests).toHaveLength(reads);
        expect(queryClient.getQueryCache().getAll()).toEqual([]);
      }
    );
  });

  it.each([
    ["nobody", null],
    ["another User", "user_next"],
  ])(
    "never alerts nor opens anything when %s is signed in during a 409's re-read",
    async (_, next) => {
      await mountLegDay();
      // Another Workout's session, opened elsewhere after the screen read none.
      backend.seed({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "elsewhere",
        workoutId: "workout-other",
      });
      const reads = fakePublicApi.count(LIST, IN_PROGRESS);
      const resume = fakePublicApi.pause(LIST, IN_PROGRESS);
      await fireEvent.press(
        screen.getByRole("button", { name: "Start Workout" })
      );
      await until(() => fakePublicApi.count(LIST, IN_PROGRESS) === reads + 1);
      expect(fakePublicApi.count(START)).toBe(1);

      await signOutDuringWrite(next);
      resume();
      await settle(queryClient);

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(pushedRoutes()).toEqual([]);
      expect(fakePublicApi.count(LIST, IN_PROGRESS)).toBe(reads + 1);
      expect(
        queryClient.getQueryData(["open-workout-session"])
      ).toBeUndefined();
    }
  );
});
