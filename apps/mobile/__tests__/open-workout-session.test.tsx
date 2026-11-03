/**
 * The Open Workout Session across the screens asking "is it open?": the
 * Workout tab, the Workout screen and the empty History, mounted together
 * over one QueryClient, with the open Workout Session read through the fake
 * Public API and the Plans over the in-memory Supabase backend (both over the
 * same rows). One query answers for all three, so they never disagree.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import type { RefreshControlProps } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import HistoryScreen from "~/app/(tabs)/history/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: "plan-1", workoutId: "workout-push" }),
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// its empty component (History has nothing finished here) in a plain view.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: ({
    ListEmptyComponent,
    refreshControl,
  }: {
    ListEmptyComponent: ReactNode;
    refreshControl: ReactElement<RefreshControlProps>;
  }) => {
    const { ScrollView } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ScrollView refreshControl={refreshControl}>
        {ListEmptyComponent}
      </ScrollView>
    );
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: () => Promise.resolve() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const LIST = "GET /v1/workout-sessions";
/** The open Workout Session's read of the list. */
const IN_PROGRESS = { limit: "1", status: "in_progress" };

let queryClient = createTestQueryClient();

/** The three screens at once, sharing one QueryClient as the app does. */
const mountAll = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
      <WorkoutScreen />
      <HistoryScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** The cards' Workout names, in the carousel's order. */
const cardNames = () =>
  within(screen.getByTestId("workout-carousel"))
    .getAllByRole("heading")
    .map((heading) => heading.props.children);

const cardOf = (workoutId: string) =>
  screen.getByTestId(`workout-card-${workoutId}`);

beforeEach(() => {
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      {
        exercises: [{ sets: 3, slug: "bench-press" }],
        id: "workout-push",
        name: "Push",
      },
      {
        exercises: [{ sets: 3, slug: "squat" }],
        id: "workout-legs",
        name: "Legs",
      },
    ],
  });
  backend.sessions.push({
    finished_at: null,
    id: "open-session",
    plan_id: "plan-1",
    started_at: "2026-10-29T09:00:00.000Z",
    workout_id: "workout-legs",
    workoutName: "Legs",
  });
});

describe("The Open Workout Session", () => {
  it("is the same on the Workout tab, the Workout screen and History, from one read", async () => {
    await mountAll();

    // The Workout tab: Legs first, reading Continue.
    expect(cardNames()).toEqual(["Legs", "Push"]);
    expect(
      within(cardOf("workout-legs")).getByRole("button", {
        name: "Continue Legs",
      })
    ).toBeTruthy();
    // Push's Workout screen: blocked on Legs.
    expect(
      screen.getByRole("button", { name: "Start Workout" })
    ).toBeDisabled();
    expect(screen.getByText("Finish Legs first")).toBeTruthy();
    // The empty History: Resume Legs.
    expect(
      within(screen.getByTestId("history-empty")).getByRole("button", {
        name: "Resume Legs",
      })
    ).toBeTruthy();
    // One query answered all three, read through the Public API: the fake
    // Supabase backend refuses the old read of open Workout Sessions.
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY })
    ).toHaveLength(1);
    expect(fakePublicApi.count(LIST, IN_PROGRESS)).toBeGreaterThan(0);
    expect(backend.unsupported).toEqual([]);
  });

  it("changes on all of them at once when it's finished elsewhere", async () => {
    await mountAll();

    const open = backend.session("open-session");
    if (open) {
      open.finished_at = "2026-10-29T10:00:00.000Z";
    }
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      })
    );
    await settle(queryClient);

    expect(cardNames()).toEqual(["Push", "Legs"]);
    expect(
      within(cardOf("workout-legs")).getByRole("button", { name: "Start Legs" })
    ).toBeTruthy();
    expect(screen.queryByText("Finish Legs first")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume Legs" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start Workout" })).toBeEnabled();
    expect(
      within(screen.getByTestId("history-empty")).getByRole("button", {
        name: "Start Push",
      })
    ).toBeTruthy();
  });
});
