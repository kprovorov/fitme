import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PlanWorkout } from "~/hooks/queries/plans";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import WorkoutCard from "../workout-card";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  useRouter: () => ({ push: mockPush }),
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({ getCurrentUserId: () => "user_test" }));

jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

const SET = {
  reps_recommended: 10,
  rest_recommended: 90,
  weight_recommended: 0,
};

const pushDay: PlanWorkout = {
  cover: null,
  description: "",
  exercises: [],
  id: "workout-1",
  name: "Push Day",
  order: 1,
};

const withExercise: PlanWorkout = {
  ...pushDay,
  exercises: [
    {
      exercise_slug: "dips",
      id: "we-1",
      order: 1,
      sets: [
        { ...SET, id: "we-1-s1", order: 1 },
        { ...SET, id: "we-1-s2", order: 2 },
      ],
    },
  ],
};

const HOUR_MS = 3_600_000;
const ELAPSED = /^01:0[23]:\d\d$/;

/** The User's open Workout Session, of `workoutId`, started `ago` ms ago. */
const seedOpenSession = (workoutId: string | null, ago = 0) => {
  backend.sessions.push({
    finished_at: null,
    id: "session-1",
    plan_id: "plan-1",
    started_at: new Date(Date.now() - ago).toISOString(),
    workout_id: workoutId,
    workoutName: "Some Workout",
  });
};

const renderCard = async (shown: PlanWorkout) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <WorkoutCard planId="plan-1" workout={shown} />
    </QueryClientProvider>
  );
  await settle(client);
};

describe("A Plan screen's WorkoutCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    backend.reset();
  });

  it("opens the Workout screen without an open session", async () => {
    // Finished Workout Sessions of it don't count.
    backend.seed({ exercises: [], finished: true, id: "session-0" });
    await renderCard(withExercise);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 1 Exercise" })
    );

    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/workout-1");
  });

  it("opens the open Workout Session instead when there is one", async () => {
    seedOpenSession("workout-1");
    await renderCard(pushDay);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 0 Exercises" })
    );

    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-1/sessions/session-1"
    );
    // Read through the Public API, the app's one answer to "is it open?".
    expect(
      fakePublicApi.count("GET /v1/workout-sessions", {
        limit: "1",
        status: "in_progress",
      })
    ).toBe(1);
  });

  it("times the open Workout Session from when it was started", async () => {
    seedOpenSession("workout-1", HOUR_MS + 2 * 60_000);
    await renderCard(pushDay);

    expect(
      await screen.findByText(ELAPSED, {}, { timeout: 3000 })
    ).toBeTruthy();
  });

  it("opens its Workout screen while another Workout's session is open", async () => {
    seedOpenSession("workout-2", HOUR_MS);
    await renderCard(pushDay);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 0 Exercises" })
    );

    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/workout-1");
  });

  it("shows no Exercise names or set counts: it never expands", async () => {
    await renderCard(withExercise);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 1 Exercise" })
    );

    expect(screen.queryByText("Dips")).toBeNull();
    expect(screen.queryByText("2 x ")).toBeNull();
  });

  it("has no Start or Finish: those are the Workout screen's and the session's", async () => {
    await renderCard(withExercise);

    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finish Workout" })).toBeNull();
  });
});
