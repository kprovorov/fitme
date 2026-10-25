/**
 * End-to-end regression coverage for the finish workout suggestion (FIT-55).
 *
 * Mounts the real workout session screens, exercise screen, set rows, finish
 * suggestion controller and finish flow, for both workout session routes
 * (opened from a plan and from `/workout-sessions/:id`), the Workout card
 * that starts and finishes a session, and the "Update your plan?" sheet. Only the edges are swapped out: Supabase for an
 * in-memory backend, the Public API for a fake over the same rows (starting,
 * logging a set, finishing and the Plan Update go through it), expo-router for a small
 * stack navigator that keeps lower screens mounted like the native stack, and
 * the SwiftUI-backed primitives (Button, Dialog, menus) for plain
 * React Native stand-ins. See `e2e/manual/finish-workout-suggestion.md` for
 * what still needs checking on a device.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { captureException } from "@sentry/react-native";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { createContext, type ReactNode, useSyncExternalStore } from "react";
import { AccessibilityInfo, Alert, View } from "react-native";
import PlanSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanSessionScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import HomeView from "~/components/views/home-view";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { closePlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { usePlansQuery } from "~/hooks/queries/plans";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import {
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-exercise-library";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import {
  backend,
  libraryExerciseNamed,
  type SeedSession,
} from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle as settleQueries,
  until,
} from "~/test-utils/query-client";

// ---------------------------------------------------------------------------
// Navigation: a stack of mounted screens; only the top one is focused.
// ---------------------------------------------------------------------------

type RouteName =
  | "exercise"
  | "history-session"
  | "home"
  | "plan-session"
  | "summary";

interface Route {
  key: string;
  name: RouteName;
  params: Record<string, string>;
}

/** The app's paths, with their params as named groups. */
const PATHS: [RouteName, RegExp][] = [
  [
    "exercise",
    /^\/plans\/(?<planId>[^/]+)\/workouts\/(?<workoutId>[^/]+)\/sessions\/(?<sessionId>[^/]+)\/exercises\/(?<exerciseId>[^/]+)$/,
  ],
  [
    "plan-session",
    /^\/plans\/(?<planId>[^/]+)\/workouts\/(?<workoutId>[^/]+)\/sessions\/(?<sessionId>[^/]+)$/,
  ],
  ["summary", /^\/workout-sessions\/(?<workoutSessionId>[^/]+)\/summary$/],
  ["history-session", /^\/workout-sessions\/(?<workoutSessionId>[^/]+)$/],
  ["home", /^\/$/],
];

let routeKey = 0;

const toRoute = (path: string): Route => {
  for (const [name, pattern] of PATHS) {
    const matched = path.match(pattern);
    if (matched) {
      routeKey += 1;
      return { key: `route-${routeKey}`, name, params: { ...matched.groups } };
    }
  }
  throw new Error(`Unknown route ${path}`);
};

const mockNavigator = {
  dismiss(count = 1) {
    mockNavigator.set(mockNavigator.routes.slice(0, -count));
  },
  getState: () => ({
    index: mockNavigator.routes.length - 1,
    routes: mockNavigator.routes,
  }),
  listeners: new Set<() => void>(),
  push(path: string) {
    mockNavigator.set([...mockNavigator.routes, toRoute(path)]);
  },
  replace(path: string) {
    mockNavigator.set([...mockNavigator.routes.slice(0, -1), toRoute(path)]);
  },
  routes: [] as Route[],
  set(routes: Route[]) {
    mockNavigator.routes = routes;
    for (const listener of mockNavigator.listeners) {
      listener();
    }
  },
  subscribe(listener: () => void) {
    mockNavigator.listeners.add(listener);
    return () => {
      mockNavigator.listeners.delete(listener);
    };
  },
};

const mockRouteContext = createContext<{
  focused: boolean;
  params: Record<string, string>;
}>({ focused: false, params: {} });

jest.mock("expo-router", () => {
  const { useContext } = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ children }: { children: ReactNode }) => children,
    Stack: { Screen: () => null },
    useIsFocused: () => useContext(mockRouteContext).focused,
    useLocalSearchParams: () => useContext(mockRouteContext).params,
    useNavigation: () => ({ getState: mockNavigator.getState }),
    useRouter: () => ({
      dismiss: mockNavigator.dismiss,
      push: mockNavigator.push,
      replace: mockNavigator.replace,
    }),
  };
});

// ---------------------------------------------------------------------------
// Backend and native edges.
// ---------------------------------------------------------------------------

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
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/exercises/exercise-video", () => () => null);
jest.mock("~/components/views/exercise-history-view", () => () => null);
// Reanimated can't load under Jest; seeded sets have no rest, so it never shows.
jest.mock("~/components/workout-sessions/rest-timer", () => () => null);
// The exercise picker offers a single exercise to add.
jest.mock("~/components/views/exercises-view", () => ({
  __esModule: true,
  default: ({ itemCta }: { itemCta: (exercise: object) => ReactNode }) =>
    itemCta({ muscle_groups: ["quadriceps"], name: "Lunge", slug: "lunge" }),
}));

jest.mock("~/components/ui/button", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({
      disabled,
      isLoading,
      label,
      onPress,
      systemImage,
      testID,
    }: {
      disabled?: boolean;
      isLoading?: boolean;
      label?: string;
      onPress?: () => void;
      systemImage?: string;
      testID?: string;
    }) => (
      <Pressable
        accessibilityLabel={label ?? systemImage}
        accessibilityRole="button"
        accessibilityState={{ busy: !!isLoading, disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
      >
        {label ? <Text>{label}</Text> : null}
      </Pressable>
    ),
  };
});

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

/** Times the suggestion sheet has been presented. */
const mockPresentations = { count: 0 };

jest.mock("~/components/ui/dialog", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Dialog: ({
      children,
      isPresented,
      onIsPresentedChange,
    }: {
      children?: ReactNode;
      isPresented: boolean;
      onIsPresentedChange: (isPresented: boolean) => void;
    }) => {
      useEffect(() => {
        if (isPresented) {
          mockPresentations.count += 1;
        }
      }, [isPresented]);
      // Tests fire `isPresentedChange` on this view the way the native sheet
      // does when swiped down or tapped outside.
      return isPresented ? (
        <MockView {...{ onIsPresentedChange }} testID="finish-suggestion">
          {children}
        </MockView>
      ) : null;
    },
  };
});

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

/** Home's Plan, its next Workout's card first, as the Home tab shows it. */
function HomeScreen() {
  const { data: plans } = usePlansQuery();
  const plan = plans?.find(({ is_active }) => is_active);
  return plan ? <HomeView plan={plan} /> : null;
}

const SCREENS: Record<RouteName, () => ReactNode> = {
  exercise: PlanSessionExerciseScreen,
  "history-session": HistorySessionScreen,
  home: HomeScreen,
  "plan-session": PlanSessionScreen,
  summary: () => <View testID="summary-screen" />,
};

function Navigator() {
  const routes = useSyncExternalStore(
    mockNavigator.subscribe,
    () => mockNavigator.routes
  );
  return routes.map((route, index) => {
    const focused = index === routes.length - 1;
    const Screen = SCREENS[route.name];
    return (
      <mockRouteContext.Provider
        key={route.key}
        value={{ focused, params: route.params }}
      >
        <View testID={focused ? "focused-screen" : `screen-${index}`}>
          <Screen />
        </View>
      </mockRouteContext.Provider>
    );
  });
}

let queryClient: QueryClient;

const renderApp = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <Navigator />
      {/* In the root layout, next to every screen. */}
      <PlanUpdateSheetHost />
    </QueryClientProvider>
  );
};

/**
 * Waits until every request, query, mutation and suggestion check is done (the
 * check resolves a tick after the last response, within `settle`'s idle ticks).
 */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

const focused = () => within(screen.getByTestId("focused-screen"));

interface EntryRoute {
  name: string;
  /** Path of a session's screen, as the app navigates to it. */
  sessionPath: (sessionId: string) => string;
  /** The session screen's route. */
  sessionRoute: RouteName;
}

const ENTRY_ROUTES: EntryRoute[] = [
  {
    name: "plan session route",
    sessionPath: (sessionId) =>
      `/plans/plan-1/workouts/workout-of-${sessionId}/sessions/${sessionId}`,
    sessionRoute: "plan-session",
  },
  {
    name: "/workout-sessions route",
    sessionPath: (sessionId) => `/workout-sessions/${sessionId}`,
    sessionRoute: "history-session",
  },
];

const START = "POST /v1/workout-sessions";
const LOG_SET = "PATCH /v1/workout-session-sets/{id}";
const FINISH = "POST /v1/workout-sessions/{id}/finish";

/** What a set row shows when its save fails. */
const SET_SAVE_ERROR = "Couldn't save this set. Try again.";

const isSuggestionShown = () =>
  screen.queryByTestId("finish-suggestion") !== null;

/** Every Exercise the tests seed, as the Exercise Library has them. */
const LIBRARY = ["Squat", "Bench Press", "Deadlift", "Lunge", "Plank"].map(
  libraryExerciseNamed
);

// Each test mounts whole screens and steps through many requests, so a test
// takes seconds of CPU; Jest's 5 s default fails them on a busy 2-core runner.
// Waits are counted in ticks (`settle`, `until`), so this only bounds a hang.
jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  serveLibrary(LIBRARY);
  mockNavigator.routes = [];
  mockPresentations.count = 0;
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  expect(backend.unsupported).toEqual([]);
});

describe.each(ENTRY_ROUTES)(
  "finish workout suggestion via the $name",
  ({ sessionPath, sessionRoute }) => {
    /** Opens the session's screen, as a fresh start of the app would. */
    const openSession = async (sessionId: string) => {
      await act(() => mockNavigator.set([toRoute(sessionPath(sessionId))]));
      await settle();
    };

    const startApp = async (...sessions: SeedSession[]) => {
      for (const session of sessions) {
        backend.seed(session);
      }
      await renderApp();
      await openSession(sessions[0]?.id ?? "");
    };

    /** Taps an exercise of the focused session screen, once it's named. */
    const openExercise = async (name: string) => {
      await fireEvent.press(await focused().findByText(name));
      await settle();
      expect(mockNavigator.routes.at(-1)?.name).toBe("exercise");
    };

    const back = async () => {
      await act(() => mockNavigator.dismiss());
      await settle();
    };

    /** Logs set `order` of the open exercise, optionally typing its reps. */
    const trackSet = async (order: number, reps?: string) => {
      if (reps !== undefined) {
        await fireEvent.changeText(
          focused().getByTestId(`set-reps-input-${order}`),
          reps
        );
      }
      const sent = () =>
        fakePublicApi.count(LOG_SET) +
        backend.count("workout_session_exercise_sets", "insert");
      const before = sent();
      await fireEvent.press(focused().getByTestId(`log-set-button-${order}`));
      await settle();
      expect(sent()).toBeGreaterThan(before);
    };

    /** Edits a set that was tracked already. */
    const editSet = async (order: number, reps: string) => {
      await fireEvent.press(focused().getByTestId(`edit-set-button-${order}`));
      await trackSet(order, reps);
    };

    /** Adds the picker's exercise from the focused session screen. */
    const addExercise = async () => {
      await fireEvent.press(focused().getByText("Add Exercise"));
      // Picking an exercise awaits its save and then closes the picker; keep
      // that whole update inside `act`.
      const add = focused().getByText("Add");
      await act(async () => {
        await fireEvent.press(add);
      });
      await settle();
      expect(focused().queryByText("Add")).toBeNull();
    };

    const keepTraining = async () => {
      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-keep-training")
      );
      await settle();
    };

    it("edits a logged set that comes after one still to log", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null, 10] }],
        id: "s1",
      });
      await openExercise("Squat");

      await editSet(2, "8");

      expect(focused().queryByTestId("log-set-button-2")).toBeNull();
      expect(focused().getByTestId("edit-set-button-2")).toBeTruthy();
      expect(focused().queryByText(SET_SAVE_ERROR)).toBeNull();
    });

    it("suggests exactly once when the last untracked set is saved", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        id: "s1",
      });
      await openExercise("Squat");

      expect(isSuggestionShown()).toBe(false);
      await trackSet(2);

      expect(isSuggestionShown()).toBe(true);
      expect(focused().getByTestId("finish-suggestion")).toBeTruthy();
      expect(screen.getByText("Workout completed!")).toBeTruthy();
      expect(mockPresentations.count).toBe(1);
    });

    it("suggests once when the last set is logged on the session screen", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        id: "s1",
      });

      await trackSet(2);

      expect(mockNavigator.routes.at(-1)?.name).toBe(sessionRoute);
      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(1);
    });

    it("never suggests while the session is only partly tracked", async () => {
      await startApp({
        exercises: [
          { name: "Squat", sets: [null, null] },
          { name: "Bench Press", sets: [null] },
        ],
        id: "s1",
      });
      await openExercise("Squat");

      await trackSet(1);
      await trackSet(2);

      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(0);
    });

    it("never suggests when saving the last set fails, and does once it succeeds", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        id: "s1",
      });
      await openExercise("Squat");

      fakePublicApi.failNext(LOG_SET, { status: 500 });
      await trackSet(2);

      expect(isSuggestionShown()).toBe(false);
      expect(
        backend.sets.find(({ id }) => id === "s1-e1-s2")?.reps_completed
      ).toBeNull();

      await trackSet(2);

      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(1);
    });

    it("shows an error on the set when saving it fails, and clears it once a retry succeeds", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null, null] }],
        id: "s1",
      });
      await openExercise("Squat");

      fakePublicApi.failNext(LOG_SET, "network");
      await trackSet(1, "8");

      expect(focused().getByText(SET_SAVE_ERROR)).toBeTruthy();
      expect(focused().queryByText("Network request failed")).toBeNull();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
        SET_SAVE_ERROR
      );
      // The row stays editable: its ✓ is still there to retry.
      expect(focused().getByTestId("log-set-button-1")).toBeTruthy();

      await trackSet(1);

      expect(focused().queryByText(SET_SAVE_ERROR)).toBeNull();
      expect(
        backend.sets.find(({ id }) => id === "s1-e1-s1")?.reps_completed
      ).toBe(8);
    });

    it("shows an error on a tracked set when saving an edit fails, and clears it once a retry succeeds", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        id: "s1",
      });
      await openExercise("Squat");

      fakePublicApi.failNext(LOG_SET, { status: 503 });
      await editSet(1, "12");

      expect(focused().getByText(SET_SAVE_ERROR)).toBeTruthy();
      expect(focused().getByTestId("log-set-button-1")).toBeTruthy();
      expect(
        backend.sets.find(({ id }) => id === "s1-e1-s1")?.reps_completed
      ).toBe(10);

      await trackSet(1);

      expect(focused().queryByText(SET_SAVE_ERROR)).toBeNull();
      expect(
        backend.sets.find(({ id }) => id === "s1-e1-s1")?.reps_completed
      ).toBe(12);
    });

    it("shows an error on an added set when creating it fails, and clears it once a retry succeeds", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10] }],
        id: "s1",
      });
      await openExercise("Squat");
      await fireEvent.press(focused().getByText("Add Set"));

      backend.failNext("workout_session_exercise_sets", "insert");
      await trackSet(2, "6");

      expect(focused().getByText(SET_SAVE_ERROR)).toBeTruthy();
      expect(focused().getByTestId("log-set-button-2")).toBeTruthy();
      const squatSets = () =>
        backend.sets.filter(
          (set) => set.workout_session_exercise_id === "s1-e1"
        );
      expect(squatSets()).toHaveLength(1);

      await trackSet(2);

      expect(focused().queryByText(SET_SAVE_ERROR)).toBeNull();
      expect(squatSets().map(({ reps_completed }) => reps_completed)).toEqual([
        10, 6,
      ]);
    });

    it("never suggests when the completion check cannot read the session", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");

      backend.failNext("workout_sessions", "select");
      await trackSet(1);

      expect(isSuggestionShown()).toBe(false);
      // The check's own read failed, not the screens' refetch.
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it("suggests whichever order the sets are tracked in", async () => {
      await startApp({
        exercises: [
          { name: "Squat", sets: [null, null] },
          { name: "Bench Press", sets: [null] },
        ],
        id: "s1",
      });

      await openExercise("Bench Press");
      await trackSet(1);
      await back();
      expect(isSuggestionShown()).toBe(false);

      await openExercise("Squat");
      await trackSet(1);
      expect(isSuggestionShown()).toBe(false);
      await trackSet(2);

      expect(isSuggestionShown()).toBe(true);
    });

    it("counts zero reps as tracked", async () => {
      await startApp({
        exercises: [{ name: "Plank", sets: [null] }],
        id: "s1",
      });
      await openExercise("Plank");

      await trackSet(1, "0");

      expect(backend.sets[0]?.reps_completed).toBe(0);
      expect(isSuggestionShown()).toBe(true);
    });

    it.each([
      [
        "Keep Training",
        () =>
          fireEvent.press(
            screen.getByTestId("finish-workout-suggestion-keep-training")
          ),
      ],
      [
        "the close button",
        () =>
          fireEvent.press(
            screen.getByTestId("finish-workout-suggestion-close")
          ),
      ],
      [
        "swiping the sheet away",
        () =>
          fireEvent(
            screen.getByTestId("finish-suggestion"),
            "isPresentedChange",
            false
          ),
      ],
    ])(
      "keeps the session going and never suggests again after %s",
      async (_, closeSuggestion) => {
        await startApp({
          exercises: [{ name: "Squat", sets: [null] }],
          id: "s1",
        });
        await openExercise("Squat");
        await trackSet(1);

        await closeSuggestion();
        await settle();

        expect(isSuggestionShown()).toBe(false);
        expect(backend.session("s1")?.finished_at).toBeNull();
        expect(fakePublicApi.count(FINISH)).toBe(0);
        expect(mockNavigator.routes.map(({ name }) => name).at(-1)).toBe(
          "exercise"
        );

        // Neither on the session screen, nor after more tracking.
        await back();
        expect(isSuggestionShown()).toBe(false);
        await openExercise("Squat");
        await fireEvent.press(focused().getByText("Add Set"));
        await trackSet(2);

        expect(isSuggestionShown()).toBe(false);
        expect(mockPresentations.count).toBe(1);
      }
    );

    it("does not suggest again for a set added and tracked after the suggestion", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);
      await keepTraining();

      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(2);
      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(3, "0");

      expect(backend.count("workout_session_exercise_sets", "insert")).toBe(2);
      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(1);
    });

    it("does not suggest again for an exercise added and tracked after the suggestion", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);
      await keepTraining();
      await back();

      await addExercise();
      await openExercise("Lunge");
      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(1);

      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(1);
    });

    it("never suggests on edits of tracked sets", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, 10] }],
        id: "s1",
      });
      await openExercise("Squat");

      await editSet(2, "12");
      await editSet(1, "0");
      // A set tracked with zero reps is an edit too.
      await editSet(1, "5");

      expect(fakePublicApi.count(LOG_SET)).toBe(3);
      expect(backend.sets.map(({ reps_completed }) => reps_completed)).toEqual([
        5, 12,
      ]);
      expect(isSuggestionShown()).toBe(false);
    });

    it("never suggests when deleting the last untracked exercise completes the session", async () => {
      await startApp({
        exercises: [
          { name: "Squat", sets: [10] },
          { name: "Bench Press", sets: [null] },
        ],
        id: "s1",
      });

      const deleteButtons = focused().getAllByLabelText("Delete");
      // Deleting awaits the save and then updates the screen; keep that whole
      // update inside `act`.
      await act(async () => {
        await fireEvent.press(
          deleteButtons[1] as (typeof deleteButtons)[number]
        );
      });
      await settle();

      expect(backend.exercises).toHaveLength(1);
      expect(isSuggestionShown()).toBe(false);

      // Nor on a later edit of the remaining, already tracked set.
      await openExercise("Squat");
      await editSet(1, "8");
      expect(isSuggestionShown()).toBe(false);
    });

    it("finishes the workout and opens its Summary from the suggestion", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);

      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();
      expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["summary"]);

      expect(mockNavigator.routes[0]?.params).toEqual({
        workoutSessionId: "s1",
      });
      expect(fakePublicApi.count(FINISH)).toBe(1);
      expect(
        fakePublicApi.requests.find(({ route }) => route === FINISH)?.path
      ).toBe("/v1/workout-sessions/s1/finish");
      expect(backend.session("s1")?.finished_at).not.toBeNull();
      expect(isSuggestionShown()).toBe(false);
    });

    it("suggests on the session screen when the last save lands after going back", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");

      // A slow save: the user goes back to the session before it lands.
      const resume = fakePublicApi.pause(LOG_SET);
      await fireEvent.press(focused().getByTestId("log-set-button-1"));
      await until(() => fakePublicApi.count(LOG_SET) === 1);
      await act(() => mockNavigator.dismiss());
      await act(() => resume());
      await settle();

      expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
        sessionRoute,
      ]);
      expect(
        focused().getByTestId("finish-workout-suggestion-finish")
      ).toBeTruthy();
      expect(mockPresentations.count).toBe(1);

      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();
      expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["summary"]);
      expect(backend.session("s1")?.finished_at).not.toBeNull();
    });

    it("finishes only once on repeated taps of Finish", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);

      const finish = screen.getByTestId("finish-workout-suggestion-finish");
      await fireEvent.press(finish);
      await fireEvent.press(finish);
      await settle();
      expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["summary"]);

      expect(fakePublicApi.count(FINISH)).toBe(1);
    });

    it("opens the Summary when a retried finish lands on a finished session", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);

      // The finish is applied, but its answer is lost on the way back.
      fakePublicApi.failNext(FINISH, "lost");
      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(backend.session("s1")?.finished_at).not.toBeNull();

      // The retry answers `already_finished`, a success.
      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();

      expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["summary"]);
      expect(fakePublicApi.count(FINISH)).toBe(2);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    it("keeps the session active and lets the user retry when finishing fails", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);

      fakePublicApi.failNext(FINISH, { status: 500 });
      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();

      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(backend.session("s1")?.finished_at).toBeNull();
      expect(mockNavigator.routes.map(({ name }) => name).at(-1)).toBe(
        "exercise"
      );
      expect(isSuggestionShown()).toBe(true);

      await fireEvent.press(
        screen.getByTestId("finish-workout-suggestion-finish")
      );
      await settle();
      expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["summary"]);
    });

    it("never suggests for a session without exercises", async () => {
      await startApp({ exercises: [], id: "s1" });

      await addExercise();

      expect(backend.exercises).toHaveLength(1);
      expect(isSuggestionShown()).toBe(false);

      // Tracking a set of the added exercise completes the session.
      await openExercise("Lunge");
      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(1);

      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(1);
    });

    it("never suggests while an exercise has no sets", async () => {
      await startApp({
        exercises: [
          { name: "Squat", sets: [null] },
          { name: "Bench Press", sets: [] },
        ],
        id: "s1",
      });
      await openExercise("Squat");

      await trackSet(1);

      expect(isSuggestionShown()).toBe(false);

      // Tracking a set of the empty exercise completes the session.
      await back();
      await openExercise("Bench Press");
      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(1);

      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(1);
    });

    it("suggests once for fast duplicate saves of the last set", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        id: "s1",
      });
      await openExercise("Squat");

      // A double tap on a slow connection: the second save is sent before the
      // first one is answered.
      const resume = fakePublicApi.pause(LOG_SET);
      const logSet = focused().getByTestId("log-set-button-2");
      await fireEvent.press(logSet);
      await fireEvent.press(logSet);
      await until(() => fakePublicApi.count(LOG_SET) === 2);
      await act(() => resume());
      await settle();

      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(1);
      expect(screen.getAllByTestId("finish-suggestion")).toHaveLength(1);
    });

    it("never suggests when reopening an incomplete or fully tracked session", async () => {
      await startApp(
        { exercises: [{ name: "Squat", sets: [10, null] }], id: "s1" },
        { exercises: [{ name: "Squat", sets: [10, 10] }], id: "s2" }
      );
      await openExercise("Squat");
      await back();
      await openSession("s1");
      expect(isSuggestionShown()).toBe(false);

      await openSession("s2");
      await openExercise("Squat");

      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(0);
    });

    it("does not suggest again after reopening the suggested session", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);
      expect(isSuggestionShown()).toBe(true);

      // Leaves the session without answering, then comes back to it.
      await act(() => mockNavigator.set([]));
      await openSession("s1");
      expect(isSuggestionShown()).toBe(false);

      await openExercise("Squat");
      await fireEvent.press(focused().getByText("Add Set"));
      await trackSet(2);

      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(1);
    });

    it("never suggests for a session that is already finished", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [10, null] }],
        finished: true,
        id: "s1",
      });
      expect(focused().queryByTestId("finish-workout-button")).toBeNull();
      await openExercise("Squat");

      expect(focused().queryByText("Add Set")).toBeNull();
      // Its sets can't change: the API refuses (409 `session_finished`).
      await trackSet(2);

      expect(focused().getByText(SET_SAVE_ERROR)).toBeTruthy();
      expect(
        backend.sets.find(({ id }) => id === "s1-e1-s2")?.reps_completed
      ).toBeNull();
      expect(isSuggestionShown()).toBe(false);
      expect(mockPresentations.count).toBe(0);
    });

    it("suggests separately for another workout session", async () => {
      await startApp(
        { exercises: [{ name: "Squat", sets: [null] }], id: "s1" },
        { exercises: [{ name: "Deadlift", sets: [null] }], id: "s2" }
      );
      await openExercise("Squat");
      await trackSet(1);
      await keepTraining();

      await openSession("s2");
      await openExercise("Deadlift");
      await trackSet(1);

      expect(isSuggestionShown()).toBe(true);
      expect(mockPresentations.count).toBe(2);
    });
  }
);

describe("starting a Workout from Home", () => {
  const PLAN = {
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      {
        exercises: [{ sets: 2, slug: "squat" }],
        id: "w1",
        name: "Leg Day",
      },
      {
        exercises: [{ sets: 1, slug: "bench-press" }],
        id: "w2",
        name: "Push Day",
      },
    ],
  };

  const startApp = async () => {
    backend.seedPlan(structuredClone(PLAN));
    await renderApp();
    await act(() => mockNavigator.set([toRoute("/")]));
    await settle();
  };

  const startWorkout = async () => {
    await fireEvent.press(await focused().findByText("Start Workout"));
    await settle();
  };

  const sessionsOf = (workoutId: string) =>
    backend.sessions.filter((session) => session.workout_id === workoutId);

  it("starts the next Workout and opens its session with the Plan's sets", async () => {
    await startApp();

    await startWorkout();

    expect(fakePublicApi.requests.at(-1)).toMatchObject({
      body: { workout_id: "w1" },
      route: START,
    });
    const [started] = sessionsOf("w1");
    expect(mockNavigator.routes.at(-1)).toMatchObject({
      name: "plan-session",
      params: { sessionId: started?.id, workoutId: "w1" },
    });
    expect(await focused().findByText("Squat")).toBeTruthy();
    expect(backend.count("start_workout_session", "rpc")).toBe(0);
  });

  it("resumes the Workout's open session instead of starting another", async () => {
    await startApp();
    // Started elsewhere (Arnold, another device) after Home was read.
    backend.sessions.push({
      finished_at: null,
      id: "open-1",
      plan_id: "plan-1",
      started_at: "2026-10-08T09:00:00.000Z",
      workout_id: "w1",
      workoutName: "Leg Day",
    });

    await startWorkout();

    expect(sessionsOf("w1").map(({ id }) => id)).toEqual(["open-1"]);
    expect(mockNavigator.routes.at(-1)).toMatchObject({
      name: "plan-session",
      params: { sessionId: "open-1" },
    });
  });

  it("logs the started session's sets and finishes it, rotating the Workout to the end of the Plan", async () => {
    await startApp();
    await startWorkout();

    await fireEvent.press(await focused().findByText("Squat"));
    await settle();
    const logFive = async (order: number) => {
      await fireEvent.changeText(
        focused().getByTestId(`set-reps-input-${order}`),
        "5"
      );
      await fireEvent.press(focused().getByTestId(`log-set-button-${order}`));
      await settle();
    };
    await logFive(1);
    await logFive(2);
    const [started] = sessionsOf("w1");
    expect(
      backend.sets
        .filter(({ logged_at }) => logged_at !== null)
        .map(({ reps_completed }) => reps_completed)
    ).toEqual([5, 5]);

    await fireEvent.press(
      screen.getByTestId("finish-workout-suggestion-finish")
    );
    await settle();

    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(started?.finished_at).not.toBeNull();
    expect(backend.plans[0]?.workouts.map(({ id }) => id)).toEqual([
      "w2",
      "w1",
    ]);
  });

  it("says how long to wait when logging a set or finishing is rate limited", async () => {
    await startApp();
    await startWorkout();
    await fireEvent.press(await focused().findByText("Squat"));
    await settle();

    fakePublicApi.failNext(LOG_SET, { retryAfterSeconds: 7, status: 429 });
    await fireEvent.press(focused().getByTestId("log-set-button-1"));
    await settle();
    expect(
      focused().getByText("Too many requests. Try again in 7 s.")
    ).toBeTruthy();

    await fireEvent.press(focused().getByTestId("log-set-button-1"));
    await settle();
    await fireEvent.press(focused().getByTestId("log-set-button-2"));
    await settle();
    fakePublicApi.failNext(FINISH, { retryAfterSeconds: 9, status: 429 });
    await fireEvent.press(
      screen.getByTestId("finish-workout-suggestion-finish")
    );
    await settle();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't finish workout",
      "Too many requests: please try again in 9 s."
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(sessionsOf("w1")[0]?.finished_at).toBeNull();
  });

  it("shows an error and stays on Home when starting fails", async () => {
    await startApp();

    fakePublicApi.failNext(START, "network");
    await startWorkout();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Check your connection and try again."
    );
    expect(backend.sessions).toEqual([]);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["home"]);
  });

  it("says how long to wait when starting is rate limited", async () => {
    await startApp();

    fakePublicApi.failNext(START, { retryAfterSeconds: 12, status: 429 });
    await startWorkout();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Too many requests: please try again in 12 s."
    );
    expect(backend.sessions).toEqual([]);
  });
});

describe("the Plan Update after finishing from Home", () => {
  const PLAN = {
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      {
        exercises: [{ sets: 2, slug: "squat" }],
        id: "w1",
        name: "Leg Day",
      },
      {
        exercises: [{ sets: 1, slug: "bench-press" }],
        id: "w2",
        name: "Push Day",
      },
    ],
  };

  const PREVIEW = "GET /v1/workout-sessions/{id}/plan-update";
  const APPLY = "POST /v1/workout-sessions/{id}/plan-update";
  const SESSION = "played-1";

  const UPDATE = { name: "Update plan" } as const;
  const RETRY = { name: "Retry" } as const;
  const KEEP = { name: "Keep plan as is" } as const;
  const APPLY_ERROR =
    "Couldn't update your plan. Check your connection and try again.";

  const ADDED_SET_LINE = "Add 1 set to Squat · 5×100 kg";
  const ADDED_EXERCISE_LINE = "Add Walking Lunge · 12×20 kg";
  // Unknown to the Exercise Library: the slug's name.
  const UNRESOLVED_LINE = "Add Farmer carry · 1×40 kg";

  const eventProperties = {
    plan_id: "plan-1",
    workout_id: "w1",
    workout_session_id: SESSION,
  };

  let nextSet = 0;

  /** A logged set; `planned` when copied from the Plan (it has targets). */
  const loggedSet = (
    exerciseId: string,
    order: number,
    reps: number,
    weight: number,
    planned: boolean
  ) => {
    nextSet += 1;
    backend.sets.push({
      id: `${exerciseId}-s${nextSet}`,
      logged_at: "2026-10-08T10:30:00.000Z",
      order,
      reps_completed: reps,
      reps_recommended: planned ? 10 : null,
      rest_recommended: planned ? 90 : null,
      weight_completed: weight,
      weight_recommended: planned ? 0 : null,
      workout_session_exercise_id: exerciseId,
    });
  };

  /**
   * An open Workout Session of Leg Day with both planned Squat sets logged
   * and, with `changed`, a third Squat set, a Walking Lunge and a Farmer
   * carry added (as the session screen adds them), each logged.
   */
  const seedPlayedSession = ({ changed }: { changed: boolean }) => {
    backend.sessions.push({
      finished_at: null,
      id: SESSION,
      plan_id: "plan-1",
      started_at: "2026-10-08T10:00:00.000Z",
      workout_id: "w1",
      workoutName: "Leg Day",
    });
    const exercise = (id: string, slug: string, order: number) =>
      backend.exercises.push({
        exercise_slug: slug,
        id,
        order,
        workout_session_id: SESSION,
      });
    exercise("played-squat", "squat", 1);
    loggedSet("played-squat", 1, 5, 100, true);
    loggedSet("played-squat", 2, 5, 100, true);
    if (changed) {
      loggedSet("played-squat", 3, 5, 100, false);
      exercise("played-lunge", "lunge", 2);
      loggedSet("played-lunge", 1, 12, 20, false);
      exercise("played-carry", "farmer-carry", 3);
      loggedSet("played-carry", 1, 1, 40, false);
    }
  };

  const startApp = async ({ changed = true } = {}) => {
    nextSet = 0;
    serveLibrary([
      ...LIBRARY.filter(({ slug }) => slug !== "lunge"),
      libraryExercise("lunge", { name: "Walking Lunge" }),
    ]);
    backend.seedPlan(structuredClone(PLAN));
    seedPlayedSession({ changed });
    await renderApp();
    await act(() => mockNavigator.set([toRoute("/")]));
    await settle();
  };

  const finishFromHome = async () => {
    await fireEvent.press(await focused().findByText("Finish Workout"));
    await settle();
  };

  const legDay = () =>
    backend.plans[0]?.workouts.find(({ id }) => id === "w1")?.exercises;

  const track = () => jest.mocked(segmentClient.track);

  const isSheetShown = () => screen.queryByText("Update your plan?") !== null;

  afterEach(async () => {
    await act(() => closePlanUpdatePrompt(SESSION));
  });

  it("goes straight to the Summary when the Workout Session changed nothing", async () => {
    await startApp({ changed: false });

    await finishFromHome();

    expect(fakePublicApi.count(PREVIEW)).toBe(1);
    expect(isSheetShown()).toBe(false);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(track()).not.toHaveBeenCalled();
  });

  it("asks with every change, Exercises by their Library names, after the finish", async () => {
    await startApp();

    await finishFromHome();

    expect(backend.session(SESSION)?.finished_at).not.toBeNull();
    expect(
      screen.getByText("Save today's changes to Leg Day in Strength.")
    ).toBeTruthy();
    for (const line of [ADDED_SET_LINE, ADDED_EXERCISE_LINE, UNRESOLVED_LINE]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    // Asked, not answered: still on Home under the sheet.
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["home"]);
    expect(track()).toHaveBeenCalledWith("Plan Update Suggested", {
      add_exercise: 2,
      add_sets: 1,
      remove_exercise: 0,
      replace_exercise: 0,
      ...eventProperties,
    });
  });

  it("shows the weights in the User's unit", async () => {
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    await startApp();

    await finishFromHome();

    expect(screen.getByText("Add 1 set to Squat · 5×100 lbs")).toBeTruthy();
  });

  it("applies the changes and opens the Summary on Update plan", async () => {
    await startApp();
    await finishFromHome();

    await fireEvent.press(screen.getByRole("button", UPDATE));
    await settle();

    expect(fakePublicApi.count(APPLY)).toBe(1);
    expect(legDay()).toEqual([
      {
        sets: [
          { reps_recommended: 10, rest_recommended: 90, weight_recommended: 0 },
          { reps_recommended: 10, rest_recommended: 90, weight_recommended: 0 },
          {
            reps_recommended: 5,
            rest_recommended: 90,
            weight_recommended: 100,
          },
        ],
        slug: "squat",
      },
      {
        sets: [
          {
            reps_recommended: 12,
            rest_recommended: 90,
            weight_recommended: 20,
          },
        ],
        slug: "lunge",
      },
      {
        sets: [
          { reps_recommended: 1, rest_recommended: 90, weight_recommended: 40 },
        ],
        slug: "farmer-carry",
      },
    ]);
    expect(isSheetShown()).toBe(false);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(track()).toHaveBeenCalledWith(
      "Plan Update Accepted",
      eventProperties
    );
    expect(backend.count("workout_session_plan_changes", "rpc")).toBe(0);
  });

  it("leaves the Plan as it was on Keep plan as is", async () => {
    await startApp();
    await finishFromHome();
    const before = structuredClone(legDay());

    await fireEvent.press(screen.getByRole("button", KEEP));
    await settle();

    expect(fakePublicApi.count(APPLY)).toBe(0);
    expect(legDay()).toEqual(before);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(track()).toHaveBeenCalledWith(
      "Plan Update Declined",
      eventProperties
    );
    expect(track()).not.toHaveBeenCalledWith(
      "Plan Update Accepted",
      expect.anything()
    );
  });

  it("keeps the sheet with Retry when the apply fails, and applies once on Retry", async () => {
    await startApp();
    await finishFromHome();
    const before = structuredClone(legDay());

    fakePublicApi.failNext(APPLY, { status: 500 });
    await fireEvent.press(screen.getByRole("button", UPDATE));
    await settle();

    expect(screen.getByText(APPLY_ERROR)).toBeTruthy();
    expect(legDay()).toEqual(before);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual(["home"]);
    expect(track()).not.toHaveBeenCalledWith(
      "Plan Update Accepted",
      expect.anything()
    );

    await fireEvent.press(screen.getByRole("button", RETRY));
    await settle();

    expect(fakePublicApi.count(APPLY)).toBe(2);
    expect(legDay()?.map(({ slug }) => slug)).toEqual([
      "squat",
      "lunge",
      "farmer-carry",
    ]);
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(track()).toHaveBeenCalledWith(
      "Plan Update Accepted",
      eventProperties
    );
  });

  it("applies once when the first apply's answer was lost", async () => {
    await startApp();
    await finishFromHome();

    fakePublicApi.failNext(APPLY, "lost");
    await fireEvent.press(screen.getByRole("button", UPDATE));
    await settle();
    await fireEvent.press(screen.getByRole("button", RETRY));
    await settle();

    expect(legDay()?.map(({ slug }) => slug)).toEqual([
      "squat",
      "lunge",
      "farmer-carry",
    ]);
    expect(legDay()?.[0]?.sets).toHaveLength(3);
    expect(mockNavigator.routes.at(-1)?.name).toBe("summary");
  });

  it("reports a failed preview and opens the Summary without asking", async () => {
    await startApp();

    fakePublicApi.failNext(PREVIEW, "network");
    await finishFromHome();

    expect(isSheetShown()).toBe(false);
    expect(captureException).toHaveBeenCalled();
    expect(mockNavigator.routes.map(({ name }) => name)).toEqual([
      "home",
      "summary",
    ]);
    expect(track()).not.toHaveBeenCalled();
    expect(backend.count("workout_session_plan_changes", "rpc")).toBe(0);
  });
});
