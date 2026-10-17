import type { Plan, Workout } from "@fitme/core";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import HomeView from "../home-view";

jest.mock("../active-plan-view", () => () => null);

// Renders each card as its Workout's name and state; the card has its own data hooks.
jest.mock("../workout-card", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return ({ state, workout }: { state: string; workout: Workout }) => (
    <Text testID={`workout-card-${state}`}>{workout.name}</Text>
  );
});

const workoutNamed = (name: string, order: number) =>
  ({ id: name, name, order }) as Workout;

const renderHome = (workouts: Workout[]) =>
  render(<HomeView plan={{ workouts } as Plan} />);

const upcomingNames = () =>
  screen
    .queryAllByTestId("workout-card-default")
    .map((card) => card.children.join(""));

describe("HomeView", () => {
  it("shows the first Workout by order as Next Workout and the rest under Upcoming, in rotation order", async () => {
    await renderHome([
      workoutNamed("Day C", 3),
      workoutNamed("Day A", 1),
      workoutNamed("Day B", 2),
    ]);

    expect(screen.getByTestId("workout-card-upcoming")).toHaveTextContent(
      "Day A"
    );
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(upcomingNames()).toEqual(["Day B", "Day C"]);
  });

  it("lists the other Workout under Upcoming in a two-Workout Plan", async () => {
    await renderHome([workoutNamed("Day B", 1), workoutNamed("Day A", 2)]);

    expect(screen.getByTestId("workout-card-upcoming")).toHaveTextContent(
      "Day B"
    );
    expect(upcomingNames()).toEqual(["Day A"]);
  });

  it("hides the Upcoming heading for a single-Workout Plan", async () => {
    await renderHome([workoutNamed("Day A", 1)]);

    expect(screen.getByTestId("workout-card-upcoming")).toHaveTextContent(
      "Day A"
    );
    expect(screen.queryByText("Upcoming")).toBeNull();
  });

  it("doesn't reorder the Plan's Workouts", async () => {
    const workouts = [workoutNamed("Day B", 2), workoutNamed("Day A", 1)];

    await renderHome(workouts);

    expect(workouts.map(({ name }) => name)).toEqual(["Day B", "Day A"]);
  });
});
