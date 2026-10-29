/**
 * The Workout screen on the mounted-screen seam: the real route, its Workout
 * read and the planned Exercise cards, with Supabase swapped for the
 * in-memory backend and the Library for its fake (both from `test-utils/`).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend, type SeedPlan } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockWorkoutId = { current: "workout-1" };

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    planId: "plan-1",
    workoutId: mockWorkoutId.current,
  }),
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Profile read) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const PLAN: SeedPlan = {
  id: "plan-1",
  is_active: true,
  name: "Strength",
  workouts: [
    {
      exercises: [
        {
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 100,
            },
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 100,
            },
          ],
          slug: "barbell-back-squat",
        },
        { sets: 3, slug: "romanian-deadlift" },
      ],
      id: "workout-1",
      name: "Leg Day",
    },
    { exercises: [], id: "workout-2", name: "Rest Day Mobility" },
  ],
};

const LOAD_ERROR = /^Couldn't load this workout/;

// A planned set's row, as VoiceOver reads it.
const SET_ROW = /^Set \d:/;

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <WorkoutScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  backend.seedPlan(structuredClone(PLAN));
  mockWorkoutId.current = "workout-1";
});

describe("The Workout screen", () => {
  it("shows the Workout's name, planned stats and a planned card per Exercise, in order", async () => {
    await mount();

    expect(screen.getByText("Leg Day")).toBeTruthy();
    expect(screen.getByText("Exercises")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Sets")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(
      screen
        .getAllByLabelText(SET_ROW)
        .map((row) => row.props.accessibilityLabel)
    ).toEqual([
      "Set 1: 5 reps at 100 kg, rest 180 seconds",
      "Set 2: 5 reps at 100 kg, rest 180 seconds",
      "Set 1: 10 reps, rest 90 seconds",
      "Set 2: 10 reps, rest 90 seconds",
      "Set 3: 10 reps, rest 90 seconds",
    ]);
    // Unresolved by the fake Library: the slug's name, no link.
    expect(screen.getByText("Barbell back squat")).toBeTruthy();
    expect(screen.getByText("Romanian deadlift")).toBeTruthy();
  });

  it("shows the planned Workout duration", async () => {
    await mount();

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("60 min")).toBeTruthy();
  });

  it("shows a spinner while the Workout loads", async () => {
    const resume = backend.pause("workouts", "select");
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <WorkoutScreen />
      </QueryClientProvider>
    );

    expect(screen.getByTestId("workout-loading")).toBeTruthy();
    expect(screen.queryByText("Leg Day")).toBeNull();

    resume();
    await settle(queryClient);
    expect(screen.getByText("Leg Day")).toBeTruthy();
  });

  it("shows an error with Try Again, which reads the Workout again", async () => {
    backend.failNext("workouts", "select");
    await mount();

    expect(
      screen.getByText(
        "Couldn't load this workout. Check your connection and try again."
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Leg Day")).toBeTruthy();
  });

  it("says a Workout replaced by a Plan edit no longer exists, with a way back", async () => {
    mockWorkoutId.current = "workout-gone";
    await mount();

    expect(screen.getByText("This workout no longer exists")).toBeTruthy();
    expect(screen.queryByText("Try Again")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Go Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says a Workout of a deleted Plan no longer exists", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      deleted_at: "2026-10-28T10:00:00.000Z",
    });
    await mount();

    expect(screen.getByText("This workout no longer exists")).toBeTruthy();
    expect(screen.queryByText("Leg Day")).toBeNull();
  });

  it("says so when the Workout has no Exercises", async () => {
    mockWorkoutId.current = "workout-2";
    await mount();

    expect(screen.getByText("Rest Day Mobility")).toBeTruthy();
    expect(screen.getByText("This workout has no exercises yet.")).toBeTruthy();
    // No Exercises, no sets.
    expect(screen.getAllByText("0")).toHaveLength(2);
  });
});

const START = "POST /v1/workout-sessions";

/** An open Workout Session of `workoutId`, as left by an earlier Start. */
const seedOpenSession = (workoutId: string) => {
  backend.sessions.push({
    finished_at: null,
    id: "open-session",
    plan_id: "plan-1",
    started_at: "2026-10-29T09:00:00.000Z",
    workout_id: workoutId,
    workoutName: "Leg Day",
  });
};

describe("Starting a Workout from its screen", () => {
  it.each([
    ["the Next Workout", "workout-1"],
    ["an Upcoming Workout, with no Exercises", "workout-2"],
  ])(
    "starts %s and replaces the screen with its Workout Session",
    async (_, workoutId) => {
      mockWorkoutId.current = workoutId;
      await mount();

      await fireEvent.press(
        screen.getByRole("button", { name: "Start Workout" })
      );
      await settle(queryClient);

      const started = backend.sessions.find(
        (session) => session.workout_id === workoutId
      );
      expect(started?.finished_at).toBeNull();
      expect(fakePublicApi.count(START)).toBe(1);
      // Replaced, not pushed: Back goes to Home or the Plan.
      expect(mockReplace).toHaveBeenCalledWith(
        `/plans/plan-1/workouts/${workoutId}/sessions/${started?.id}`
      );
      expect(mockPush).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    }
  );

  it("reads the Workout again once started", async () => {
    await mount();
    const reads = backend.count("workouts", "select");

    await fireEvent.press(
      screen.getByRole("button", { name: "Start Workout" })
    );
    await settle(queryClient);

    expect(backend.count("workouts", "select")).toBeGreaterThan(reads);
  });

  it("alerts on a failed Start and stays on the Workout screen", async () => {
    fakePublicApi.failNext(START, "network");
    await mount();

    await fireEvent.press(
      screen.getByRole("button", { name: "Start Workout" })
    );
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Check your connection and try again."
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start Workout" })).toBeTruthy();
  });

  it("gives the wait when Start is rate limited", async () => {
    fakePublicApi.failNext(START, { retryAfterSeconds: 12, status: 429 });
    await mount();

    await fireEvent.press(
      screen.getByRole("button", { name: "Start Workout" })
    );
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Too many requests: please try again in 12 s."
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start Workout" })).toBeTruthy();
  });

  it("offers Continue Workout for the Workout's own open session, with no new request", async () => {
    seedOpenSession("workout-1");
    await mount();

    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue Workout" })
    );
    await settle(queryClient);

    expect(mockReplace).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-1/sessions/open-session"
    );
    expect(fakePublicApi.count(START)).toBe(0);
  });

  it("has no Start while the Workout loads, fails or is gone", async () => {
    const resume = backend.pause("workouts", "select");
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <WorkoutScreen />
      </QueryClientProvider>
    );
    expect(screen.getByTestId("workout-loading")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
    resume();
    await settle(queryClient);

    backend.failNext("workouts", "select");
    await mount();
    expect(screen.getByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();

    mockWorkoutId.current = "workout-gone";
    await mount();
    expect(screen.getByText("This workout no longer exists")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
  });
});
