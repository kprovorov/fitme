import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { storage } from "~/lib/mmkv";
import {
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-exercise-library";
import { type WorkoutPlan, WorkoutPlanCard } from "../workout-plan-card";

const mockPush = jest.fn();
const mockRpc = jest.fn((name: string, _args: Record<string, unknown>) =>
  Promise.resolve({
    data: name === "create_plan" ? "plan-1" : { id: "plan-1" },
    error: null,
  })
);

jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { id: "plan-1" }, error: null }),
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));
jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
);
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

// What display_workout_plan answers: each Exercise by slug, plus the legacy
// uuid the Coach still sends for older builds.
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
          exercise_id: "uuid-bench",
          exercise_slug: "bench-press",
          name: "Coach's bench",
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
      ] as WorkoutPlan["workouts"][number]["exercises"],
      name: "Push",
    },
  ],
};

const renderCard = async (card: WorkoutPlan = plan) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <WorkoutPlanCard plan={card} />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
  serveLibrary([libraryExercise("bench-press", { name: "Bench Press" })]);
});

describe("WorkoutPlanCard", () => {
  it("names each Exercise from the library and links it by slug", async () => {
    await renderCard();

    await fireEvent.press(await screen.findByText("Bench Press"));
    expect(mockPush).toHaveBeenCalledWith("/exercises/bench-press");
  });

  it("doesn't link an Exercise the library doesn't know", async () => {
    await renderCard();
    await screen.findByText("Bench Press");

    await fireEvent.press(screen.getByText("Mystery Move"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("creates the Plan from each Exercise's slug", async () => {
    await renderCard();

    await fireEvent.press(screen.getByText("Save Plan"));

    await waitFor(() => expect(screen.getByText("Plan Saved")).toBeTruthy());
    expect(mockRpc).toHaveBeenCalledWith("create_plan", {
      p_plan_data: expect.objectContaining({
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
      }),
    });
  });

  it("won't save a card from before Exercise slugs", async () => {
    const legacy = structuredClone(plan);
    for (const exercise of legacy.workouts[0]?.exercises ?? []) {
      exercise.exercise_slug = undefined;
    }
    await renderCard(legacy);

    expect(screen.getByText("Save Plan")).toBeDisabled();
  });
});
