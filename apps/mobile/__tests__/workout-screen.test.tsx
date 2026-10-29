/**
 * The Workout screen on the mounted-screen seam: the real route, its Workout
 * read and the planned Exercise cards, with Supabase swapped for the
 * in-memory backend and the Library for its fake (both from `test-utils/`).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend, type SeedPlan } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockBack = jest.fn();
const mockPush = jest.fn();
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
