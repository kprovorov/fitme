/**
 * Arnold's plan card on the mounted-screen seam: the real card, hooks and
 * Public API client, with Supabase swapped for the in-memory backend and the
 * client's `fetch` for the fake Public API over the same rows (both from
 * `test-utils/`). A Plan list next to the card reads the Plans back through
 * Supabase, as the app's lists do.
 */

import { LibraryUnavailableError } from "@fitme/library-sdk";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { usePlansQuery } from "~/hooks/queries/plans";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import {
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-exercise-library";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { type WorkoutPlan, WorkoutPlanCard } from "../workout-plan-card";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => undefined },
  };
});
jest.mock("@/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("@/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const PLAN_ROUTE = "POST /v1/plans";
const UNKNOWN_EXERCISES =
  "This plan has exercises we don't know, so it can't be saved. Ask Arnold for another plan.";

// What display_workout_plan answers: each Exercise by slug.
const plan: WorkoutPlan = {
  description: "Three days a week",
  frequencyPerWeek: 3,
  goal: "strength",
  name: "Strength Plan",
  workouts: [
    {
      dayLabel: "Day 1",
      exercises: [
        {
          exercise_slug: "bench-press",
          name: "Arnold's bench",
          reps: "8-10",
          restSeconds: 120,
          sets: 3,
        },
        {
          exercise_slug: "mystery-move",
          name: "Mystery Move",
          reps: "12",
          sets: 2,
        },
      ],
      name: "Push",
    },
  ],
};

/** The Plans as the app's lists read them, through Supabase. */
function PlanList() {
  const { data: plans } = usePlansQuery();
  return (
    <>
      {plans?.map((saved) => (
        <Text key={saved.id}>
          {`Listed: ${saved.name}${saved.is_active ? " (active)" : ""}`}
        </Text>
      ))}
    </>
  );
}

const renderCard = async (card: WorkoutPlan = plan) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <WorkoutPlanCard plan={card} />
      <PlanList />
    </QueryClientProvider>
  );
  await settle(client);
  return client;
};

const save = async (client: ReturnType<typeof createTestQueryClient>) => {
  await fireEvent.press(screen.getByText("Save Plan"));
  await settle(client);
};

const planRequests = () =>
  fakePublicApi.requests.filter((request) => request.route === PLAN_ROUTE);

const tracked = () => jest.mocked(segmentClient.track).mock.calls;

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
  backend.reset();
  serveLibrary([
    libraryExercise("bench-press", { name: "Bench Press" }),
    libraryExercise("mystery-move"),
  ]);
});

describe("WorkoutPlanCard", () => {
  it("names each Exercise from the library and links it by slug", async () => {
    await renderCard();

    await fireEvent.press(screen.getByText("Bench Press"));
    expect(mockPush).toHaveBeenCalledWith("/exercises/bench-press");
  });

  it("doesn't link an Exercise the library doesn't know", async () => {
    serveLibrary([libraryExercise("bench-press", { name: "Bench Press" })]);
    await renderCard();

    await fireEvent.press(screen.getByText("Mystery Move"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("saves the Plan as the active one in one request", async () => {
    backend.seedPlan({
      id: "plan-old",
      is_active: true,
      name: "Old Plan",
      workouts: [],
    });
    const client = await renderCard();

    await save(client);

    expect(fakePublicApi.requests.map(({ route }) => route)).toEqual([
      PLAN_ROUTE,
    ]);
    expect(backend.count("create_plan", "rpc")).toBe(0);
    expect(backend.count("activate_plan", "rpc")).toBe(0);
    expect(planRequests()[0]?.body).toEqual({
      activate: true,
      description: "Three days a week",
      experience_level: "intermediate",
      frequency: 3,
      goal: "strength-performance",
      name: "Strength Plan",
      place: "gym",
      workout_duration: 60,
      workouts: [
        {
          description: "",
          exercises: [
            {
              exercise_slug: "bench-press",
              sets: Array.from({ length: 3 }, () => ({
                reps_recommended: 8,
                rest_recommended: 120,
                weight_recommended: 0,
              })),
            },
            {
              exercise_slug: "mystery-move",
              sets: Array.from({ length: 2 }, () => ({
                reps_recommended: 12,
                rest_recommended: 90,
                weight_recommended: 0,
              })),
            },
          ],
          name: "Push",
        },
      ],
    });
    expect(screen.getByText("Plan Saved")).toBeDisabled();
    expect(screen.getByText("Listed: Strength Plan (active)")).toBeTruthy();
    expect(screen.getByText("Listed: Old Plan")).toBeTruthy();
  });

  it("fires Plan Saved and Plan Activated once each, on success", async () => {
    const client = await renderCard();

    await save(client);

    const [created] = backend.plans;
    expect(tracked()).toEqual([
      ["Plan Saved", { plan_id: created?.id }],
      ["Plan Activated", { plan_id: created?.id }],
    ]);
  });

  it("fits an out-of-bounds card into the Public API's bounds", async () => {
    const loose: WorkoutPlan = {
      ...plan,
      frequencyPerWeek: 9.4,
      workoutDuration: 700.6,
      workouts: [
        {
          dayLabel: "Day 1",
          exercises: [
            {
              exercise_slug: "bench-press",
              name: "Bench",
              reps: "2000",
              restSeconds: 7200,
              sets: 25,
            },
            {
              exercise_slug: "mystery-move",
              name: "Mystery Move",
              reps: "0",
              restSeconds: 45.6,
              sets: 2.6,
            },
          ],
          name: "Push",
        },
        { dayLabel: "Day 2", exercises: [], name: "Rest day" },
      ],
    };
    const client = await renderCard(loose);

    await save(client);

    const body = planRequests()[0]?.body as {
      frequency: number;
      workout_duration: number;
      workouts: Array<{
        exercises: Array<{ sets: unknown[] }>;
        name: string;
      }>;
    };
    expect(body.frequency).toBe(7);
    expect(body.workout_duration).toBe(600);
    expect(body.workouts.map(({ name }) => name)).toEqual(["Push"]);
    const [bench, mystery] = body.workouts[0]?.exercises ?? [];
    expect(bench?.sets).toHaveLength(20);
    expect(bench?.sets[0]).toEqual({
      reps_recommended: 1000,
      rest_recommended: 3600,
      weight_recommended: 0,
    });
    expect(mystery?.sets).toHaveLength(3);
    expect(mystery?.sets[0]).toEqual({
      reps_recommended: 1,
      rest_recommended: 46,
      weight_recommended: 0,
    });
    expect(screen.getByText("Listed: Strength Plan (active)")).toBeTruthy();
  });

  it("disables Save when no Workout has an Exercise", async () => {
    await renderCard({
      ...plan,
      workouts: [{ dayLabel: "Day 1", exercises: [], name: "Push" }],
    });

    expect(screen.getByText("Save Plan")).toBeDisabled();
  });

  it("won't save a card from before Exercise slugs", async () => {
    const legacy = structuredClone(plan);
    for (const exercise of legacy.workouts[0]?.exercises ?? []) {
      exercise.exercise_slug = undefined;
    }
    await renderCard(legacy);

    expect(screen.getByText("Save Plan")).toBeDisabled();
  });

  it("says the plan has Exercises we don't know, saving nothing until they're known", async () => {
    serveLibrary([libraryExercise("bench-press", { name: "Bench Press" })]);
    const client = await renderCard();

    await save(client);

    expect(screen.getByText(UNKNOWN_EXERCISES)).toBeTruthy();
    expect(backend.plans).toEqual([]);
    expect(tracked()).toEqual([]);

    serveLibrary([
      libraryExercise("bench-press", { name: "Bench Press" }),
      libraryExercise("mystery-move"),
    ]);
    await save(client);

    expect(backend.plans).toHaveLength(1);
    expect(screen.getByText("Plan Saved")).toBeTruthy();
    expect(screen.queryByText(UNKNOWN_EXERCISES)).toBeNull();
  });

  it("asks to try again while the Exercise Library is down, saving nothing", async () => {
    const library = serveLibrary([
      libraryExercise("bench-press", { name: "Bench Press" }),
      libraryExercise("mystery-move"),
    ]);
    const client = await renderCard();
    library.failWith(new LibraryUnavailableError());

    await save(client);

    expect(
      screen.getByText("Couldn't check this plan's exercises. Try again.")
    ).toBeTruthy();
    expect(backend.plans).toEqual([]);
    expect(tracked()).toEqual([]);

    library.failWith(null);
    await save(client);

    expect(backend.plans).toHaveLength(1);
    expect(screen.getByText("Plan Saved")).toBeTruthy();
  });

  it("says how long to wait when rate limited", async () => {
    fakePublicApi.failNext(PLAN_ROUTE, { retryAfterSeconds: 12, status: 429 });
    const client = await renderCard();

    await save(client);

    expect(
      screen.getByText("Too many requests. Try again in 12 s.")
    ).toBeTruthy();
    expect(backend.plans).toEqual([]);
  });

  it.each([
    ["a network failure", "network" as const],
    ["a server error", { status: 500 }],
  ])(
    "shows the error state on %s, never falling back to Supabase",
    async (_, failure) => {
      fakePublicApi.failNext(PLAN_ROUTE, failure);
      const client = await renderCard();

      await save(client);

      expect(
        screen.getByText("Couldn't save the plan. Try again.")
      ).toBeTruthy();
      expect(screen.getByText("Save Plan")).toBeEnabled();
      expect(backend.plans).toEqual([]);
      expect(backend.count("create_plan", "rpc")).toBe(0);
      expect(backend.count("plans", "insert")).toBe(0);
      expect(tracked()).toEqual([]);
    }
  );

  it("shows the error state when the Public API isn't configured", async () => {
    fakePublicApi.baseUrl = "";
    const client = await renderCard();

    await save(client);

    expect(screen.getByText("Couldn't save the plan. Try again.")).toBeTruthy();
    expect(backend.plans).toEqual([]);
  });
});
