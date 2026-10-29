import type {
  WorkoutSessionExercise,
  WorkoutSessionExerciseSet,
} from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { ShownExercise } from "~/hooks/queries/library";
import { createTestQueryClient } from "~/test-utils/query-client";
import WorkoutSessionExerciseCard from "../workout-session-exercise-card";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({
    data: { measurement_system: "metric" },
    isPending: false,
  }),
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({
    accessibilityLabel,
    items,
  }: {
    accessibilityLabel: string;
    items: { label: string }[];
  }) => {
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <Text>{`${accessibilityLabel}: ${items.map((item) => item.label).join(", ")}`}</Text>
    );
  },
}));

const BENCH: ShownExercise = {
  isResolved: true,
  muscle_groups: ["chest"],
  name: "Bench Press",
  slug: "bench-press",
  thumbnail_url: null,
  video_url: null,
};

// The header reads the name, then the muscle groups.
const BENCH_PRESS = /^Bench Press/;
const MENU = /^More options/;

const set = (order: number): WorkoutSessionExerciseSet => ({
  created_at: "2026-10-29T10:00:00Z",
  id: `set-${order}`,
  logged_at: null,
  order,
  reps_completed: null,
  reps_recommended: 12,
  rest_recommended: 90,
  updated_at: "2026-10-29T10:00:00Z",
  weight_completed: null,
  weight_recommended: 45,
  workout_session_exercise_id: "wse-1",
});

const SESSION_EXERCISE: WorkoutSessionExercise = {
  created_at: "2026-10-29T10:00:00Z",
  exercise_slug: "bench-press",
  id: "wse-1",
  order: 1,
  sets: [set(1), set(2)],
  updated_at: "2026-10-29T10:00:00Z",
  workout_session_id: "session-1",
};

const renderCard = (element: ReactElement) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      {element}
    </QueryClientProvider>
  );

beforeEach(() => {
  mockPush.mockClear();
});

describe("WorkoutSessionExerciseCard", () => {
  it("opens the Exercise of an open session, with its menu and Add Set", async () => {
    await renderCard(
      <WorkoutSessionExerciseCard
        exercise={BENCH}
        onDelete={jest.fn()}
        onReplace={jest.fn()}
        planId="plan-1"
        readOnly={false}
        sessionId="session-1"
        workoutId="workout-1"
        workoutSessionExercise={SESSION_EXERCISE}
      />
    );

    expect(
      screen.getByText("More options for Bench Press: Replace, Delete")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Set" })).toBeTruthy();
    // Each set is a row to log, its target beside it.
    expect(screen.getAllByText("12×45kg")).toHaveLength(2);

    await fireEvent.press(screen.getByRole("button", { name: BENCH_PRESS }));
    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-1/sessions/session-1/exercises/wse-1"
    );
  });

  it("has no menu or Add Set once finished, and opens nothing without its Workout", async () => {
    await renderCard(
      <WorkoutSessionExerciseCard
        exercise={BENCH}
        planId={null}
        readOnly
        sessionId="session-1"
        workoutId={null}
        workoutSessionExercise={SESSION_EXERCISE}
      />
    );

    expect(screen.queryByText(MENU)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Set" })).toBeNull();
    expect(screen.queryByRole("button", { name: BENCH_PRESS })).toBeNull();
    await fireEvent.press(screen.getByText("Bench Press"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
