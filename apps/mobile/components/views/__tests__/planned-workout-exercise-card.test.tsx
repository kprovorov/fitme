import type { WorkoutExercise, WorkoutExerciseSet } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ShownExercise } from "~/hooks/queries/library";
import PlannedWorkoutExerciseCard from "../planned-workout-exercise-card";

const mockPush = jest.fn();
const mockProfile: { current: { measurement_system: string } | null } = {
  current: { measurement_system: "metric" },
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: mockProfile.current, isPending: false }),
}));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const BENCH: ShownExercise = {
  isResolved: true,
  muscle_groups: ["chest", "triceps"],
  name: "Bench Press",
  slug: "bench-press",
  thumbnail_url: "https://media.test/render/bench-press.jpg",
  video_url: null,
};

const set = (
  order: number,
  values: Partial<WorkoutExerciseSet> = {}
): WorkoutExerciseSet => ({
  created_at: "2026-10-29T10:00:00Z",
  id: `set-${order}`,
  order,
  reps_recommended: 12,
  rest_recommended: 90,
  updated_at: "2026-10-29T10:00:00Z",
  weight_recommended: 45,
  workout_exercise_id: "we-1",
  ...values,
});

const workoutExercise = (
  sets: WorkoutExerciseSet[],
  slug = "bench-press"
): WorkoutExercise =>
  ({
    created_at: "2026-10-29T10:00:00Z",
    exercise_slug: slug,
    id: "we-1",
    order: 1,
    sets,
    updated_at: "2026-10-29T10:00:00Z",
    workout_id: "workout-1",
  }) as WorkoutExercise;

// A row's set number cell.
const SET_NUMBER = /^#\d$/;
const ANY_VALUE = /.*/;
// The header reads the name, then the muscle groups.
const BENCH_PRESS = /^Bench Press/;

beforeEach(() => {
  mockPush.mockClear();
  mockProfile.current = { measurement_system: "metric" };
});

describe("PlannedWorkoutExerciseCard", () => {
  it("shows every set's target and rest, in order", async () => {
    await render(
      <PlannedWorkoutExerciseCard
        exercise={BENCH}
        workoutExercise={workoutExercise([
          set(3, { reps_recommended: 8, rest_recommended: 0 }),
          set(1),
          set(2, {
            reps_recommended: 10,
            rest_recommended: 45,
            weight_recommended: 50.5,
          }),
        ])}
      />
    );

    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Chest, Triceps")).toBeTruthy();
    expect(
      screen.getAllByText(SET_NUMBER).map((cell) => cell.props.children)
    ).toEqual(["#1", "#2", "#3"]);
    for (const header of ["#", "target", "rest"]) {
      expect(
        screen.getByText(header, { includeHiddenElements: true })
      ).toBeTruthy();
    }
    for (const text of ["12×45kg", "10×50,5kg", "8×45kg", "1:30", "0:45"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // No rest reads as none, not as a zero clock.
    expect(screen.queryByText("0:00")).toBeNull();
    // VoiceOver reads each set as one sentence.
    expect(
      screen.getByLabelText("Set 1: 12 reps at 45 kg, rest 90 seconds")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Set 3: 8 reps at 45 kg, no rest")
    ).toBeTruthy();
  });

  it("shows weights in the Profile's unit", async () => {
    mockProfile.current = { measurement_system: "us" };
    await render(
      <PlannedWorkoutExerciseCard
        exercise={BENCH}
        workoutExercise={workoutExercise([set(1, { weight_recommended: 100 })])}
      />
    );

    expect(screen.getByText("12×100lbs")).toBeTruthy();
    expect(
      screen.getByLabelText("Set 1: 12 reps at 100 lbs, rest 90 seconds")
    ).toBeTruthy();
  });

  it("has no inputs, add-set button or replace / remove menu", async () => {
    await render(
      <PlannedWorkoutExerciseCard
        exercise={BENCH}
        workoutExercise={workoutExercise([set(1), set(2)])}
      />
    );

    // Every TextInput has a display value, an empty one included.
    expect(screen.queryAllByDisplayValue(ANY_VALUE)).toEqual([]);
    expect(screen.queryByRole("button", { name: "Add Set" })).toBeNull();
    // The only control is the Exercise itself.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("opens the Exercise's detail once the Library resolved it", async () => {
    await render(
      <PlannedWorkoutExerciseCard
        exercise={BENCH}
        workoutExercise={workoutExercise([set(1)])}
      />
    );

    await fireEvent.press(screen.getByRole("button", { name: BENCH_PRESS }));
    expect(mockPush).toHaveBeenCalledWith("/exercises/bench-press");
  });

  it("names an Exercise the Library can't resolve from its slug, with no link", async () => {
    await render(
      <PlannedWorkoutExerciseCard
        exercise={undefined}
        workoutExercise={workoutExercise([set(1)], "barbell-back-squat")}
      />
    );

    await fireEvent.press(screen.getByText("Barbell back squat"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
