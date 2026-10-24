/**
 * End-to-end regression coverage for the finish workout suggestion (FIT-55).
 *
 * Mounts the real workout session screens, exercise screen, set rows, finish
 * suggestion controller and finish flow, for both workout session routes
 * (opened from a plan and from `/workout-sessions/:id`). Only the edges are
 * swapped out: Supabase for an in-memory backend, expo-router for a small
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
import { storage } from "~/lib/mmkv";
import { serveLibrary } from "~/test-utils/fake-exercise-library";
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

type RouteName = "exercise" | "history-session" | "plan-session" | "summary";

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
];

let routeKey = 0;

const toRoute = (path: string): Route => {
  for (const [name, pattern] of PATHS) {
    const params = path.match(pattern)?.groups;
    if (params !== undefined) {
      routeKey += 1;
      return { key: `route-${routeKey}`, name, params: { ...params } };
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

const SCREENS: Record<RouteName, () => ReactNode> = {
  exercise: PlanSessionExerciseScreen,
  "history-session": HistorySessionScreen,
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
      const requests = backend.requests.length;
      await fireEvent.press(focused().getByTestId(`log-set-button-${order}`));
      await settle();
      expect(backend.requests.length).toBeGreaterThan(requests);
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

      backend.failNext("workout_session_exercise_sets", "update");
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

      backend.failNext("workout_session_exercise_sets", "update");
      await trackSet(1, "8");

      expect(focused().getByText(SET_SAVE_ERROR)).toBeTruthy();
      expect(
        focused().queryByText("update workout_session_exercise_sets failed")
      ).toBeNull();
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

      backend.failNext("workout_session_exercise_sets", "update");
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
        expect(backend.count("finish_workout_session", "rpc")).toBe(0);
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

      expect(backend.count("workout_session_exercise_sets", "update")).toBe(3);
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
      expect(backend.count("finish_workout_session", "rpc")).toBe(1);
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
      const resume = backend.pause("workout_session_exercise_sets", "update");
      await fireEvent.press(focused().getByTestId("log-set-button-1"));
      await until(
        () => backend.count("workout_session_exercise_sets", "update") === 1
      );
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

      expect(backend.count("finish_workout_session", "rpc")).toBe(1);
    });

    it("keeps the session active and lets the user retry when finishing fails", async () => {
      await startApp({
        exercises: [{ name: "Squat", sets: [null] }],
        id: "s1",
      });
      await openExercise("Squat");
      await trackSet(1);

      backend.failNext("finish_workout_session", "rpc");
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
      const resume = backend.pause("workout_session_exercise_sets", "update");
      const logSet = focused().getByTestId("log-set-button-2");
      await fireEvent.press(logSet);
      await fireEvent.press(logSet);
      await until(
        () => backend.count("workout_session_exercise_sets", "update") === 2
      );
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
      await trackSet(2);

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
