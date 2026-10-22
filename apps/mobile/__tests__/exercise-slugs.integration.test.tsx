/**
 * Plans, Workout Sessions and their summary refer to Exercises by Exercise
 * slug (FIT-241): rows come from Supabase with `exercise_slug` only, and
 * names, muscle groups and thumbnails from the Exercise Library. A slug the
 * library doesn't know shows a name made from it, no thumbnail and no link.
 *
 * Mounts the real screens on the in-memory Supabase backend and the fake
 * Exercise Library; expo-router and the SwiftUI-backed primitives are
 * swapped for plain stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import PlanScreen from "~/app/plans/[planId]/index";
import PlanSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import SummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { storage } from "~/lib/mmkv";
import { serveLibrary } from "~/test-utils/fake-exercise-library";
import {
  backend,
  libraryExerciseNamed,
} from "~/test-utils/fake-workout-backend";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    // A link shows as a view naming where it goes.
    Link: ({ children, href }: { children: ReactNode; href: string }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    Stack: { Screen: () => null },
    useIsFocused: () => true,
    useLocalSearchParams: () => mockParams.current,
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({
      dismiss: jest.fn(),
      dismissTo: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
    }),
  };
});

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
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
// The Exercise picker (still on the legacy table, FIT-242) offers Lunge.
jest.mock("~/components/views/exercises-view", () => ({
  __esModule: true,
  default: ({ itemCta }: { itemCta: (exercise: object) => ReactNode }) =>
    itemCta({ muscle_groups: ["quadriceps"], name: "Lunge", slug: "lunge" }),
}));

/** Not in the Exercise Library: shown as "Mystery move". */
const UNKNOWN_SLUG = "mystery-move";

let queryClient: QueryClient;

const renderScreen = async (
  Screen: () => ReactNode,
  params: Record<string, string>
) => {
  mockParams.current = params;
  queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <Screen />
    </QueryClientProvider>
  );
  await settle();
};

/** Waits until every request, query and mutation is done. */
const settle = async () => {
  await waitFor(() => {
    expect(backend.inFlight).toBe(0);
    expect(queryClient.isFetching()).toBe(0);
    expect(queryClient.isMutating()).toBe(0);
  });
};

const seedSession = (finished = false) =>
  backend.seed({
    exercises: [
      { name: "Squat", sets: [10, 8] },
      { name: "Mystery", sets: [12], slug: UNKNOWN_SLUG },
    ],
    finished,
    id: "s1",
  });

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  serveLibrary(["Squat", "Lunge"].map((name) => libraryExerciseNamed(name)));
});

describe("a Plan", () => {
  it("names its Exercises from the library and links only the ones it knows", async () => {
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
    await renderScreen(PlanScreen, { planId: "plan-1" });

    // Open the Workout card to list its Exercises by name.
    await fireEvent.press(screen.getByText("Leg Day"));

    const squat = screen.getByTestId("link:/exercises/squat");
    expect(within(squat).getByLabelText("Squat")).toBeTruthy();
    expect(
      within(squat).getByTestId("thumbnail:https://media.test/render/squat.jpg")
    ).toBeTruthy();

    expect(screen.getByLabelText("Mystery move")).toBeTruthy();
    expect(screen.queryByTestId(`link:/exercises/${UNKNOWN_SLUG}`)).toBeNull();
    expect(screen.getByTestId("thumbnail:none")).toBeTruthy();
  });
});

describe("a Workout Session", () => {
  it("names its Exercises from the library and by their slug when unknown", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.getByText("Chest")).toBeTruthy();
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

    expect(screen.getByLabelText("How to do Mystery move")).toBeDisabled();
  });

  it("offers the guide for an Exercise the library knows", async () => {
    seedSession();
    await renderScreen(PlanSessionExerciseScreen, {
      exerciseId: "s1-e1",
      planId: "plan-1",
      sessionId: "s1",
      workoutId: "workout-of-s1",
    });

    expect(screen.getByLabelText("How to do Squat")).toBeEnabled();
  });

  it("adds an Exercise by its slug", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    await fireEvent.press(await screen.findByText("Add Exercise"));
    await act(async () => {
      await fireEvent.press(screen.getByText("Add"));
    });
    await settle();

    expect(backend.exercises.at(-1)).toMatchObject({
      exercise_slug: "lunge",
      order: 3,
      workout_session_id: "s1",
    });
    expect(screen.getByText("Lunge")).toBeTruthy();
  });

  it("replaces an Exercise by its slug", async () => {
    seedSession();
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    const [replaceSquat] = await screen.findAllByLabelText("Replace");
    await fireEvent.press(replaceSquat as NonNullable<typeof replaceSquat>);
    await act(async () => {
      await fireEvent.press(await screen.findByText("Replace"));
    });
    await settle();

    expect(backend.exercises[0]).toMatchObject({
      exercise_slug: "lunge",
      id: "s1-e1",
    });
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("a Workout Session's summary", () => {
  it("names its Exercises from the library and by their slug when unknown", async () => {
    seedSession(true);
    await renderScreen(SummaryScreen, { workoutSessionId: "s1" });

    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.getByText("Mystery move")).toBeTruthy();
    expect(
      screen.getByTestId("thumbnail:https://media.test/render/squat.jpg")
    ).toBeTruthy();
    expect(screen.getByTestId("thumbnail:none")).toBeTruthy();
  });
});
