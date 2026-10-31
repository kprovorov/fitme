import type { Workout } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createTestQueryClient } from "~/test-utils/query-client";
import WorkoutCard from "../workout-card";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  useRouter: () => ({ push: mockPush }),
}));

// The card reaches Supabase only through `findOpenSession`'s module.
jest.mock("~/lib/supabase", () => ({ supabase: {} }));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

const withOpenSession = {
  exercises: [],
  id: "workout-1",
  name: "Push Day",
  plan_id: "plan-1",
  sessions: [
    { finished_at: null, id: "session-1", started_at: "2026-10-21T10:00:00Z" },
  ],
} as unknown as Workout;

const withoutOpenSession = {
  ...withOpenSession,
  exercises: [{ exercise_slug: "dips", id: "we-1", order: 1, sets: [{}, {}] }],
  sessions: [
    {
      finished_at: "2026-10-20T11:00:00Z",
      id: "session-0",
      started_at: "2026-10-20T10:00:00Z",
    },
  ],
} as unknown as Workout;

const renderCard = async (shown: Workout) => {
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WorkoutCard workout={shown} />
    </QueryClientProvider>
  );
};

describe("A Plan screen's WorkoutCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens the Workout screen without an open session", async () => {
    await renderCard(withoutOpenSession);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 1 Exercise" })
    );

    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/workout-1");
  });

  it("opens the open Workout Session instead when there is one", async () => {
    await renderCard(withOpenSession);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 0 Exercises" })
    );

    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-1/sessions/session-1"
    );
  });

  it("shows no Exercise names or set counts: it never expands", async () => {
    await renderCard(withoutOpenSession);

    await fireEvent.press(
      screen.getByRole("button", { name: "Push Day, 1 Exercise" })
    );

    expect(screen.queryByText("Dips")).toBeNull();
    expect(screen.queryByText("2 x ")).toBeNull();
  });

  it("has no Start or Finish: those are the Workout screen's and the session's", async () => {
    await renderCard(withoutOpenSession);

    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finish Workout" })).toBeNull();
  });
});
