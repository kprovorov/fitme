/**
 * Plans, Workout Sessions and their summary refer to Exercises by Exercise
 * slug (FIT-241): rows come from Supabase with `exercise_slug` only, and
 * names, muscle groups and thumbnails from the Library. A slug the
 * library doesn't know shows a name made from it, no thumbnail and no link.
 *
 * Mounts the real screens on the in-memory Supabase backend and the fake
 * Library; expo-router and the SwiftUI-backed primitives are
 * swapped for plain stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import PlanScreen from "~/app/plans/[planId]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import PlanSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import SummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { storage } from "~/lib/mmkv";
import { serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  libraryExerciseNamed,
} from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle as settleQueries,
} from "~/test-utils/query-client";
import { PushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = { current: {} };
const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    // A link shows as a view naming where it goes.
    Link: ({ children, href }: { children: ReactNode; href: string }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    Stack: { Screen: () => null },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({
      ...stub.stubRouter,
      push: (href: Parameters<typeof stub.stubRouter.push>[0]) => {
        mockPush(href);
        stub.stubRouter.push(href);
      },
    }),
  };
});

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);
jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
}));
jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { KeyboardAwareScrollView: ScrollView };
});
// A thumbnail shows as a view naming its image, or `none`.
jest.mock("~/components/exercises/exercise-image", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return ({ exercise }: { exercise: { thumbnail_url: string | null } }) => (
    <View testID={`thumbnail:${exercise.thumbnail_url ?? "none"}`} />
  );
});
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/workout-sessions/rest-timer", () => () => null);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);
jest.mock("~/components/ui/dropdown-menu", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DropdownMenu: ({
      items,
    }: {
      items: Array<{ label: string; onPress?: () => void }>;
    }) =>
      items.map((item) => (
        <Pressable
          accessibilityLabel={item.label}
          accessibilityRole="menuitem"
          key={item.label}
          onPress={item.onPress}
        />
      )),
  };
});
// The Exercise picker's muscle group menu (SwiftUI) shows nothing.
jest.mock("~/components/ui/picker", () => ({ Picker: () => null }));

// The Exercise header reads the name, then the muscle groups.
const SQUAT = /^Squat/;
const MYSTERY_MOVE = /^Mystery move/;

/** Not in the Library: shown as "Mystery move". */
const UNKNOWN_SLUG = "mystery-move";

let queryClient: QueryClient;

const renderScreen = async (
  Screen: () => ReactNode,
  params: Record<string, string>
) => {
  mockParams.current = params;
  resetStubRouter();
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <Screen />
      <PushedRoutes
        screens={{
          "/workout-sessions/[workoutSessionId]/exercise-picker":
            ExercisePickerScreen,
        }}
      />
    </QueryClientProvider>
  );
  await settle();
};

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

const seedSession = (finished = false) =>
  backend.seed({
    exercises: [
      { name: "Squat", sets: [10, 8] },
      { name: "Mystery", sets: [12], slug: UNKNOWN_SLUG },
    ],
    finished,
    id: "s1",
  });

// Each test mounts whole screens and steps through many requests, so a test
// takes seconds of CPU; Jest's 5 s default fails them on a busy 2-core runner.
// Waits are counted in ticks (`settle`, `until`), so this only bounds a hang.
jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  serveLibrary(["Squat", "Lunge"].map((name) => libraryExerciseNamed(name)));
});

describe("a Plan", () => {
  beforeEach(() => {
    backend.seedPlan({
      id: "plan-1",
      name: "Strength",
      workouts: [
        {
          exercises: [
            { sets: 3, slug: "squat" },
            { sets: 2, slug: UNKNOWN_SLUG },
          ],
          id: "w1",
          name: "Leg Day",
        },
      ],
    });
  });

  it("shows each Workout's Exercises as thumbnails, a blank one for a slug the library doesn't know, and opens the Workout", async () => {
    await renderScreen(PlanScreen, { planId: "plan-1" });

    expect(await screen.findByText("Leg Day")).toBeTruthy();
    expect(
      screen.getByTestId("thumbnail:https://media.test/render/squat.jpg")
    ).toBeTruthy();
    expect(screen.getByTestId("thumbnail:none")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Leg Day, 2 Exercises" })
    );
    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/w1");
  });

  it("names a Workout's Exercises from the library and links only the ones it knows", async () => {
    await renderScreen(WorkoutScreen, { planId: "plan-1", workoutId: "w1" });

    await fireEvent.press(await screen.findByRole("button", { name: SQUAT }));
    expect(mockPush).toHaveBeenCalledWith("/exercises/squat");

    expect(screen.getByText("Mystery move")).toBeTruthy();
    expect(screen.queryByRole("button", { name: MYSTERY_MOVE })).toBeNull();
  });
});

describe("a Workout Session", () => {
  it("names its Exercises from the library and by their slug when unknown", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    expect(await screen.findByText("Squat")).toBeTruthy();
    expect(await screen.findByText("Chest")).toBeTruthy();
    expect(screen.getByText("Mystery move")).toBeTruthy();
    expect(
      screen.getByTestId("thumbnail:https://media.test/render/squat.jpg")
    ).toBeTruthy();
    expect(screen.getByTestId("thumbnail:none")).toBeTruthy();
  });

  it("offers no guide for an Exercise the library doesn't know", async () => {
    seedSession();
    await renderScreen(PlanSessionExerciseScreen, {
      exerciseId: "s1-e2",
      planId: "plan-1",
      sessionId: "s1",
      workoutId: "workout-of-s1",
    });

    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "How to?" })).toBeNull();
  });

  it("offers the guide for an Exercise the library knows", async () => {
    seedSession();
    await renderScreen(PlanSessionExerciseScreen, {
      exerciseId: "s1-e1",
      planId: "plan-1",
      sessionId: "s1",
      workoutId: "workout-of-s1",
    });

    expect(
      await screen.findByRole("button", { name: "How to?" })
    ).toBeEnabled();
  });

  it("adds an Exercise by its slug", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    await fireEvent.press(await screen.findByText("Add Exercise"));
    // Tapping Lunge's row in the picker adds it.
    const addLunge = await screen.findByRole("button", { name: "Add Lunge" });
    await act(async () => {
      await fireEvent.press(addLunge);
    });
    await settle();

    expect(backend.exercises.at(-1)).toMatchObject({
      exercise_slug: "lunge",
      order: 3,
      workout_session_id: "s1",
    });
    expect(await screen.findByText("Lunge")).toBeTruthy();
  });

  it("replaces an Exercise by its slug", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    const [replaceSquat] = await screen.findAllByLabelText("Replace");
    await fireEvent.press(replaceSquat as NonNullable<typeof replaceSquat>);
    const replaceWithLunge = await screen.findByRole("button", {
      name: "Replace with Lunge",
    });
    await act(async () => {
      await fireEvent.press(replaceWithLunge);
    });
    await settle();

    expect(backend.exercises[0]).toMatchObject({
      exercise_slug: "lunge",
      id: "s1-e1",
    });
    expect(await screen.findByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("a Workout Session's summary", () => {
  it("names its Exercises from the library and by their slug when unknown", async () => {
    seedSession(true);
    await renderScreen(SummaryScreen, { workoutSessionId: "s1" });

    expect(await screen.findByText("Squat")).toBeTruthy();
    expect(screen.getByText("Mystery move")).toBeTruthy();
    expect(
      screen.getByTestId("thumbnail:https://media.test/render/squat.jpg")
    ).toBeTruthy();
    expect(screen.getByTestId("thumbnail:none")).toBeTruthy();
  });
});
