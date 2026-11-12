/**
 * Add Set in an open Workout Session (FIT-632): the added row starts from the
 * set before it (its logged reps and weight, or its targets while it isn't
 * logged), as the Plan editor's Add Set does, and nothing is written until
 * the User logs it. An Exercise with no set starts at 0.
 *
 * Renders the real sets table and set rows; the save goes to the fake Public
 * API.
 */
import { describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { WorkoutSessionSet } from "~/hooks/queries/workout-sessions";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

import WorkoutSessionExerciseSetsTableView from "../workout-session-exercise-sets-table-view";

// The real Clerk SDK (reached through the set rows' saves) opens a
// MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const ADD_SET_ROUTE = "POST /v1/workout-session-exercises/{id}/sets";

const sessionSet = (
  order: number,
  values: Partial<WorkoutSessionSet>
): WorkoutSessionSet => ({
  id: `s1-e1-s${order}`,
  logged_at: null,
  order,
  reps_completed: null,
  reps_recommended: 10,
  rest_recommended: 90,
  weight_completed: null,
  weight_recommended: 40,
  ...values,
});

const renderTable = async (sets: WorkoutSessionSet[]) => {
  backend.seed({
    exercises: [{ name: "Dumbbell Arnold Press", sets: [] }],
    id: "s1",
  });
  const client = createTestQueryClient();

  await render(
    <QueryClientProvider client={client}>
      <WorkoutSessionExerciseSetsTableView
        exerciseId="s1-e1"
        sessionId="s1"
        weightUnit="kg"
        workoutSessionExerciseSets={sets}
      />
    </QueryClientProvider>
  );

  return client;
};

const addSetRequests = () =>
  fakePublicApi.requests.filter((request) => request.route === ADD_SET_ROUTE);

describe("Add Set in a Workout Session", () => {
  it("starts from the logged set before it and logs it as shown", async () => {
    const client = await renderTable([
      sessionSet(1, {
        logged_at: "2026-10-08T10:30:00.000Z",
        reps_completed: 12,
        weight_completed: 12,
      }),
      sessionSet(2, {
        logged_at: "2026-10-08T10:32:00.000Z",
        reps_completed: 11,
        weight_completed: 12.5,
      }),
    ]);

    await fireEvent.press(screen.getByRole("button", { name: "Add Set" }));

    const reps = screen.getByLabelText("Set 3 reps");
    const weight = screen.getByLabelText("Set 3 weight");
    expect(reps.props.placeholder).toBe("11");
    expect(weight.props.placeholder).toBe("12.5");
    // Nothing is written until the User logs it.
    expect(addSetRequests()).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: "Log set 3" }));
    await settle(client);

    expect(addSetRequests().map((request) => request.body)).toEqual([
      { reps_completed: 11, weight_completed: 12.5 },
    ]);
  });

  it("starts from the targets of a set before it that isn't logged yet", async () => {
    await renderTable([
      sessionSet(1, { reps_recommended: 8, weight_recommended: 60 }),
    ]);

    await fireEvent.press(screen.getByRole("button", { name: "Add Set" }));

    expect(screen.getByLabelText("Set 2 reps").props.placeholder).toBe("8");
    expect(screen.getByLabelText("Set 2 weight").props.placeholder).toBe("60");
  });

  it("starts at 0 for an Exercise with no set", async () => {
    const client = await renderTable([]);

    await fireEvent.press(screen.getByRole("button", { name: "Add Set" }));

    expect(screen.getByLabelText("Set 1 reps").props.placeholder).toBe("0");
    expect(screen.getByLabelText("Set 1 weight").props.placeholder).toBe("0");

    await fireEvent.press(screen.getByRole("button", { name: "Log set 1" }));
    await settle(client);

    expect(addSetRequests().map((request) => request.body)).toEqual([
      { reps_completed: 0, weight_completed: 0 },
    ]);
  });
});
