/**
 * `Workout Started` and `Workout Completed`: the shared start and finish
 * hooks over the fake Public API, read from the shared analytics fake. Only a
 * new Workout Session's start and a first finish count, each once the API has
 * answered and only while the User who asked is still signed in.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { useStartWorkout } from "~/hooks/start-workout";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

jest.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => undefined }),
  useRouter: () => ({ dismiss: jest.fn(), replace: jest.fn() }),
}));

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

const START = "POST /v1/workout-sessions";
const FINISH = "POST /v1/workout-sessions/{id}/finish";

const workoutEvents = () =>
  sentAnalytics
    .events()
    .filter(
      ({ name }) => name === "Workout Started" || name === "Workout Completed"
    );

let queryClient = createTestQueryClient();

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = createTestQueryClient();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      { exercises: [], id: "workout-1", name: "Leg Day" },
      { exercises: [], id: "workout-2", name: "Push Day" },
    ],
  });
});

const seedSession = (
  overrides: Partial<(typeof backend.sessions)[number]> = {}
) => {
  backend.sessions.push({
    finished_at: null,
    id: "session-1",
    plan_id: "plan-1",
    started_at: "2026-11-27T09:00:00.000Z",
    workout_id: "workout-1",
    workoutName: "Leg Day",
    ...overrides,
  });
};

const start = async (workoutId = "workout-1") => {
  const { result } = await renderHook(
    () => useStartWorkout(workoutId, jest.fn()),
    { wrapper }
  );

  await act(() => {
    result.current.startWorkout();
  });
  await settle(queryClient);
};

const finish = async (sessionId = "session-1") => {
  const { result } = await renderHook(
    () => useFinishWorkoutSession(sessionId),
    { wrapper }
  );

  await act(() => {
    result.current.finish();
  });
  await settle(queryClient);
};

describe("Workout Started", () => {
  it("is sent once for a new Workout Session, with its Plan and Workout", async () => {
    await start();

    expect(fakePublicApi.count(START)).toBe(1);
    expect(workoutEvents()).toEqual([
      {
        name: "Workout Started",
        properties: { plan_id: "plan-1", workout_id: "workout-1" },
      },
    ]);
  });

  it("isn't sent when the Workout's open session is resumed", async () => {
    seedSession();

    await start();

    expect(fakePublicApi.count(START)).toBe(1);
    expect(workoutEvents()).toEqual([]);
  });

  it("isn't sent when the start is refused for another Workout's session", async () => {
    seedSession({ workout_id: "workout-2", workoutName: "Push Day" });

    await start();

    expect(workoutEvents()).toEqual([]);
  });

  it("isn't sent when the start fails", async () => {
    fakePublicApi.failNext(START, "network");

    await start();

    expect(workoutEvents()).toEqual([]);
  });

  it("isn't sent once the User who started it has signed out", async () => {
    const resume = fakePublicApi.pause(START);

    const { result } = await renderHook(
      () => useStartWorkout("workout-1", jest.fn()),
      { wrapper }
    );

    await act(() => {
      result.current.startWorkout();
    });
    signInAs(null);
    resume();
    await settle(queryClient);

    expect(backend.sessions).toHaveLength(1);
    expect(workoutEvents()).toEqual([]);
  });
});

describe("Workout Completed", () => {
  it("is sent once for a first finish, with its Plan and Workout", async () => {
    seedSession();

    await finish();

    expect(fakePublicApi.count(FINISH)).toBe(1);
    expect(workoutEvents()).toEqual([
      {
        name: "Workout Completed",
        properties: { plan_id: "plan-1", workout_id: "workout-1" },
      },
    ]);
  });

  it("leaves out the Plan and Workout once they're gone", async () => {
    seedSession({ plan_id: null, workout_id: null });

    await finish();

    expect(workoutEvents()).toEqual([
      { name: "Workout Completed", properties: {} },
    ]);
  });

  it("isn't sent for a repeat finish", async () => {
    seedSession({ finished_at: "2026-11-27T10:00:00.000Z" });

    await finish();

    expect(fakePublicApi.count(FINISH)).toBe(1);
    expect(workoutEvents()).toEqual([]);
  });

  it("isn't sent when the finish fails", async () => {
    seedSession();
    fakePublicApi.failNext(FINISH, "network");

    await finish();

    expect(workoutEvents()).toEqual([]);
  });

  it("isn't sent once the User who finished it has signed out", async () => {
    seedSession();
    const resume = fakePublicApi.pause(FINISH);

    const { result } = await renderHook(
      () => useFinishWorkoutSession("session-1"),
      { wrapper }
    );

    await act(() => {
      result.current.finish();
    });
    signInAs(null);
    resume();
    await settle(queryClient);

    expect(backend.sessions[0]?.finished_at).not.toBeNull();
    expect(workoutEvents()).toEqual([]);
  });
});
