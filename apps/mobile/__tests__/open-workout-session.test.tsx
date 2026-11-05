/**
 * The Open Workout Session across the screens asking "is it open?": the
 * Workout tab, the Workout screen and the empty History, mounted together
 * over one QueryClient, with the open Workout Session and the Plans read
 * through the fake Public API. One query answers for all three, so they never disagree.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import type { RefreshControlProps } from "react-native";
import { it, describe, expect, beforeEach } from "vitest";

import HomeScreen from "~/app/(tabs)/(home)/index";
import HistoryScreen from "~/app/(tabs)/history/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockPush = jest.fn();

jest.mock<typeof import("expo-router")>(import("expo-router"), () => ({
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: "plan-1", workoutId: "workout-push" }),
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    navigate: jest.fn(),
    push: mockPush,
    replace: jest.fn(),
  }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// its empty component (History has nothing finished here) in a plain view.
jest.mock<typeof import("@legendapp/list/react-native")>(
  import("@legendapp/list/react-native"),
  () => ({
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
  })
);

jest.mock<typeof import("@clerk/expo")>(import("@clerk/expo"), () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

jest.mock<typeof import("react-native-purchases")>(
  import("react-native-purchases"),
  () => ({
    __esModule: true,
    default: { invalidateCustomerInfoCache: () => Promise.resolve() },
  })
);

jest.mock<typeof import("react-native-safe-area-context")>(
  import("react-native-safe-area-context"),
  () => ({
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  })
);

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock<typeof import("~/lib/clerk")>(import("~/lib/clerk"), () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock<typeof import("~/lib/segment")>(import("~/lib/segment"), () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock<typeof import("~/components/exercises/exercise-image")>(
  import("~/components/exercises/exercise-image"),
  () => () => null
);

jest.mock<typeof import("~/components/symbol-image")>(
  import("~/components/symbol-image"),
  () => ({ SymbolImage: () => null })
);

jest.mock<typeof import("~/components/ui/dropdown-menu")>(
  import("~/components/ui/dropdown-menu"),
  () => jest.requireActual("~/test-utils/dropdown-menu-stub")
);

jest.mock<typeof import("~/components/ui/button")>(
  import("~/components/ui/button"),
  () => jest.requireActual("~/test-utils/button-stub")
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
  jest.clearAllMocks();
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

describe("the Open Workout Session", () => {
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
    // One query answered all three, read through the Public API.
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY })
    ).toHaveLength(1);
    expect(fakePublicApi.count(LIST, IN_PROGRESS)).toBeGreaterThan(0);
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

describe("the Open Workout Session's failed reads", () => {
  it("keep the last answer on every screen when a refresh fails", async () => {
    await mountAll();
    fakePublicApi.failNext(LIST, { status: 500 }, IN_PROGRESS);

    await act(() =>
      queryClient.invalidateQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      })
    );
    await settle(queryClient);

    expect(cardNames()).toEqual(["Legs", "Push"]);
    expect(
      within(cardOf("workout-legs")).getByRole("button", {
        name: "Continue Legs",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start Workout" })
    ).toBeDisabled();
    expect(screen.getByText("Finish Legs first")).toBeTruthy();
    expect(
      within(screen.getByTestId("history-empty")).getByRole("button", {
        name: "Resume Legs",
      })
    ).toBeTruthy();
  });

  it("leave the Workout tab's Start, which resumes the open session through the API, when the first one fails", async () => {
    // Each screen mounting after a failure reads again: fail them all.
    for (const _screen of ["Workout tab", "Workout screen", "History"]) {
      fakePublicApi.failNext(LIST, { status: 500 }, IN_PROGRESS);
    }

    await mountAll();

    // The Workout screen and History don't guess: their load errors.
    expect(screen.queryByRole("button", { name: "Start Workout" })).toBeNull();
    expect(screen.queryByTestId("history-empty")).toBeNull();
    // The Workout tab keeps its cards in rotation order.
    expect(cardNames()).toEqual(["Push", "Legs"]);

    await act(() =>
      fireEvent.press(screen.getByRole("button", { name: "Start Legs" }))
    );
    await settle(queryClient);

    // The API resumed Legs' open session instead of starting another.
    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-legs/sessions/open-session"
    );
    expect(backend.sessions).toHaveLength(1);
  });
});
