/**
 * A write refused because its Workout Session has ended elsewhere (FIT-818):
 * finished (409 `session_finished`) or gone (404). The session is read again
 * at once rather than at the next poll, and its screens move on as they do
 * for a poll (FIT-813, FIT-816): the Summary, or closed as after a discard,
 * with no alert left over. A read that fails, and any other refusal, keep
 * the write's usual error. Mounts the real screens on the real expo-router
 * over the fake Public API; the SwiftUI-backed primitives are swapped for
 * plain stand-ins and the native header for its items as buttons.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Slot, usePathname } from "expo-router";
import type { Href } from "expo-router";
import { useEffect } from "react";
import { Alert, Text } from "react-native";

import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanWorkoutSessionRoute from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import WorkoutSessionRoute from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import type { Failure } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { renderRouter } from "~/test-utils/render-router";
import { signInAs } from "~/test-utils/signed-in-user";

// The real router; only a screen's native header is drawn as plain buttons.
jest.mock("expo-router", () => {
  const actual =
    jest.requireActual<typeof import("expo-router")>("expo-router");

  const { StackScreenStub } = jest.requireActual<
    typeof import("~/test-utils/router-stub")
  >("~/test-utils/router-stub");

  return { ...actual, Stack: { Screen: StackScreenStub } };
});

// There is no app manifest under Jest to read the scheme from.
jest.mock("expo-linking", () => ({
  ...jest.requireActual<typeof import("expo-linking")>("expo-linking"),
  createURL: (path: string) => `fitme://${path}`,
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock("~/components/exercises/exercise-image", () => () => null);

// The body diagram reads theme colors uniwind has no stylesheet for in Jest.
jest.mock("~/components/views/workout-session-summary-body", () => ({
  WorkoutSessionSummaryBodyBack: () => null,
  WorkoutSessionSummaryBodyFront: () => null,
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/workout-sessions/rest-timer", () => () => null);

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

// Each card's menu, as one item per action.
jest.mock("~/components/ui/dropdown-menu", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    DropdownMenu: ({
      items,
    }: {
      items: { label: string; onPress?: () => void }[];
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

const READ = "GET /v1/workout-sessions/{id}";
const LOG_SET = "PATCH /v1/workout-session-sets/{id}";
const ADD_SET = "POST /v1/workout-session-exercises/{id}/sets";
const REMOVE_SET = "DELETE /v1/workout-session-sets/{id}";
const ADD_EXERCISE = "POST /v1/workout-sessions/{id}/exercises";
const REPLACE_EXERCISE = "PUT /v1/workout-session-exercises/{id}";
const REMOVE_EXERCISE = "DELETE /v1/workout-session-exercises/{id}";

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;
const SUMMARY = "/workout-sessions/s1/summary";
const PICKER = "/workout-sessions/s1/exercise-picker" as const;

const SESSION_KEY = ["workout-session", { sessionId: "s1" }];

const DONE = "Workout Complete!";
const SAVE_ERROR = "Couldn't save this set. Try again.";

// Each test mounts whole screens and steps through many requests.
jest.setTimeout(60_000);

let queryClient: QueryClient;
let pathname: string;

const HomeStub = () => <Text>Home</Text>;

const TabsStub = () => <Slot />;

const Layout = () => {
  const shown = usePathname();

  useEffect(() => {
    pathname = shown;
  }, [shown]);

  const { Stack } =
    jest.requireActual<typeof import("expo-router")>("expo-router");

  return (
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <Stack screenOptions={{ headerShown: false }} />
        <PlanUpdateSheetHost />
      </InAppLanguage>
    </QueryClientProvider>
  );
};

const go = async (navigate: () => void) => {
  await act(async () => {
    navigate();
    await Promise.resolve();
  });
  await settle(queryClient);
};

/** Opens the app on `path`, then pushes the others over it. */
const open = async (path: string, ...pushed: Href[]) => {
  queryClient = createTestQueryClient();
  await renderRouter(
    {
      "(tabs)/_layout": TabsStub,
      "(tabs)/index": HomeStub,
      _layout: Layout,
      "plans/[planId]/workouts/[workoutId]/index": WorkoutScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index":
        WorkoutSessionExerciseScreen,
      "plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index":
        PlanWorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]": WorkoutSessionRoute,
      "workout-sessions/[workoutSessionId]/exercise-picker":
        ExercisePickerScreen,
      "workout-sessions/[workoutSessionId]/summary":
        WorkoutSessionSummaryScreen,
    },
    path
  );
  await settle(queryClient);

  for (const next of pushed) {
    // oxlint-disable-next-line no-await-in-loop -- Each is pushed over the last.
    await go(() => router.push(next));
  }
};

const press = async (element: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    await fireEvent.press(element);
  });
  await settle(queryClient);
};

const finishElsewhere = () => {
  Object.assign(backend.sessions[0], {
    finished_at: "2026-10-08T11:00:00.000Z",
  });
};

const deleteElsewhere = () => {
  backend.sessions = [];
};

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls.map(([title]) => title);

type Route = Parameters<typeof fakePublicApi.count>[0];

/** A write, the screens it's made from, and the route it goes to. */
interface Write {
  /** What's done first, while the session is still open. */
  before?: () => Promise<void>;
  name: string;
  route: Route;
  screens: Href[];
  write: () => Promise<void>;
}

const logSet: Write = {
  name: "logging a set",
  route: LOG_SET,
  screens: [WORKOUT, SESSION, EXERCISE],
  write: () => press(screen.getByTestId("log-set-button-2")),
};

const editSet: Write = {
  before: () => press(screen.getByTestId("edit-set-button-1")),
  name: "editing a logged set",
  route: LOG_SET,
  screens: [WORKOUT, SESSION, EXERCISE],
  write: () => press(screen.getByTestId("log-set-button-1")),
};

const addSet: Write = {
  before: async () => {
    await press(screen.getByTestId("log-set-button-2"));
    await press(screen.getByRole("button", { name: "Add Set" }));
  },
  name: "adding a set",
  route: ADD_SET,
  screens: [WORKOUT, SESSION, EXERCISE],
  write: () => press(screen.getByTestId("log-set-button-3")),
};

const removeSet: Write = {
  name: "removing a set",
  route: REMOVE_SET,
  screens: [WORKOUT, SESSION, EXERCISE],
  write: () => press(screen.getByTestId("set-row-2-full-swipe")),
};

const addExercise: Write = {
  name: "adding an Exercise",
  route: ADD_EXERCISE,
  screens: [WORKOUT, SESSION, PICKER],
  write: async () =>
    await press(await screen.findByRole("button", { name: "Add Lunge" })),
};

const replaceExercise: Write = {
  name: "replacing an Exercise",
  route: REPLACE_EXERCISE,
  screens: [WORKOUT, SESSION],
  before: () => press(screen.getByLabelText("Replace")),
  write: async () => {
    await press(
      await screen.findByRole("button", { name: "Replace with Lunge" })
    );
  },
};

const removeExercise: Write = {
  name: "removing an Exercise",
  route: REMOVE_EXERCISE,
  screens: [WORKOUT, SESSION],
  write: () => press(screen.getByLabelText("Remove")),
};

const WRITES = [
  logSet,
  editSet,
  addSet,
  removeSet,
  addExercise,
  replaceExercise,
  removeExercise,
];

/** The writes a 404 answers once the session is gone (a delete answers 204). */
const WRITES_REFUSED_WHEN_GONE = [
  logSet,
  editSet,
  addSet,
  addExercise,
  replaceExercise,
];

/** Opens the write's screens, then ends the session just before it's made. */
const writeAfter = async (write: Write, end: () => void) => {
  await open("/", ...write.screens);
  await write.before?.();
  end();
  await write.write();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  backend.reset();
  storage.clearAll();
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", { name: "Squat", muscle_groups: ["quadriceps"] }),
    fakeExercise("lunge", { name: "Lunge", muscle_groups: ["quadriceps"] }),
  ]);
  backend.seedPlan({
    id: "plan-1",
    name: "Full body",
    workouts: [
      {
        exercises: [{ sets: 2, slug: "squat" }],
        id: "workout-1",
        name: "Day A",
      },
    ],
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(WRITES)("$name refused because it's finished", (write) => {
  it("shows the Summary at once, with no alert left over", async () => {
    await writeAfter(write, finishElsewhere);

    expect(fakePublicApi.count(write.route)).toBeGreaterThan(0);
    expect(pathname).toBe(SUMMARY);
    expect(screen.getByText(DONE)).toBeTruthy();
    expect(alerts()).toEqual([]);

    await go(() => router.back());
    expect(pathname).toBe(WORKOUT);
  });
});

describe.each(WRITES_REFUSED_WHEN_GONE)(
  "$name refused because it's gone",
  (write) => {
    it("closes the session's screens, with no alert", async () => {
      await writeAfter(write, deleteElsewhere);

      expect(pathname).toBe(WORKOUT);
      expect(screen.getByText("Start Workout")).toBeTruthy();
      expect(alerts()).toEqual([]);
    });
  }
);

describe("a read noticing the finish while the write is on its way", () => {
  it.each([
    [
      "adding an Exercise",
      addExercise,
      () => screen.findByRole("button", { name: "Add Lunge" }),
    ],
    [
      "replacing an Exercise",
      replaceExercise,
      () => screen.findByRole("button", { name: "Replace with Lunge" }),
    ],
    [
      "removing an Exercise",
      removeExercise,
      () => Promise.resolve(screen.getByLabelText("Remove")),
    ],
  ] as const)("%s says nothing over the Summary", async (_, write, target) => {
    await open("/", ...write.screens);
    await write.before?.();
    const button = await target();
    finishElsewhere();
    const resume = fakePublicApi.pause(write.route);

    // The write waits for its answer while a read notices the finish.
    await act(async () => {
      await fireEvent.press(button);
    });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    });
    await until(() => pathname === SUMMARY);

    await act(async () => {
      resume();
      await Promise.resolve();
    });
    await settle(queryClient);

    expect(pathname).toBe(SUMMARY);
    expect(alerts()).toEqual([]);
  });
});

describe("a set removal refused because it's finished", () => {
  it("shows the set again once the session is read only", async () => {
    await writeAfter(removeSet, finishElsewhere);
    expect(pathname).toBe(SUMMARY);

    await go(() => router.push(EXERCISE));

    expect(screen.getByTestId("set-number-2")).toBeTruthy();
  });
});

describe("when the read after a refusal fails", () => {
  it.each([
    ["removing an Exercise", removeExercise, "Couldn't remove exercise"],
    ["removing a set", removeSet, "Couldn't remove set"],
    ["adding an Exercise", addExercise, "Couldn't add exercise"],
    ["replacing an Exercise", replaceExercise, "Couldn't replace exercise"],
  ] as const)("%s shows its usual error and stays", async (_, write, title) => {
    let shown = "";

    await writeAfter(write, () => {
      shown = pathname;
      finishElsewhere();
      fakePublicApi.failNext(READ, "network");
    });

    expect(alerts()).toEqual([title]);
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[1]).toBe(
      "This workout is already finished."
    );
    expect(pathname).toBe(shown);
  });

  it("logging a set keeps its row's error and stays", async () => {
    await open("/", ...logSet.screens);
    finishElsewhere();
    fakePublicApi.failNext(READ, "network");

    await logSet.write();

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(pathname).toBe(EXERCISE);
  });
});

describe("any other refusal", () => {
  it.each([
    ["a 429", { retryAfterSeconds: 30, status: 429 }],
    ["a network failure", "network"],
  ] as [string, Failure][])(
    "keeps the alert after %s, reading nothing at once",
    async (_, failure) => {
      await open("/", ...removeExercise.screens);
      const reads = fakePublicApi.count(READ);
      fakePublicApi.failNext(REMOVE_EXERCISE, failure);

      await removeExercise.write();

      expect(alerts()).toEqual(["Couldn't remove exercise"]);
      expect(pathname).toBe(SESSION);
      // Only the read every failed edit asks for, as before.
      expect(fakePublicApi.count(READ) - reads).toBeLessThanOrEqual(1);
    }
  );
});

describe("a set removed elsewhere, its session still open", () => {
  it("keeps the row's error and the session screens", async () => {
    await open("/", ...logSet.screens);
    backend.sets = backend.sets.filter(({ order }) => order !== 2);

    await logSet.write();

    expect(pathname).toBe(EXERCISE);
    expect(screen.queryByTestId("log-set-button-2")).toBeNull();
  });
});

describe.each([null, "user_other"])("after signing in as %s", (userId) => {
  it("moves nothing and alerts nothing", async () => {
    await open("/", ...removeExercise.screens);
    finishElsewhere();
    const resume = fakePublicApi.pause(REMOVE_EXERCISE);

    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Remove"));
    });
    signInAs(userId);
    await act(async () => {
      resume();
      await Promise.resolve();
    });
    await settle(queryClient);

    expect(pathname).toBe(SESSION);
    expect(alerts()).toEqual([]);
  });
});

describe("in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows the Summary after a refused log", async () => {
    await writeAfter(logSet, finishElsewhere);

    expect(pathname).toBe(SUMMARY);
    expect(alerts()).toEqual([]);
  });
});
