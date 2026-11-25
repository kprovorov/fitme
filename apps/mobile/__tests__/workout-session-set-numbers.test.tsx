/**
 * A Workout Session's set rows are numbered by position, never by their
 * stored `order`, which keeps a gap where a set was removed (ADR 0023): the
 * number shown, what VoiceOver reads and the rest timer's next set, on the
 * Workout Session screen and the Workout Session Exercise screen.
 *
 * Mounts the real screens and rest timer on the fake Public API.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Stack: { Screen: stub.StackScreenStub },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({ ...stub.stubRouter, canGoBack: () => true }),
  };
});

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const transition = { duration: () => {} };

  return {
    __esModule: true,
    default: { View },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    FadeOutDown: transition,
    useReducedMotion: () => false,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SymbolImage: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
      accessibilityLabel ? (
        <Text accessibilityLabel={accessibilityLabel} />
      ) : null,
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

jest.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null,
}));

const ADD_SET_ROUTE = "POST /v1/workout-session-exercises/{id}/sets";
const SESSION_ROUTE = "GET /v1/workout-sessions/{id}";

// Each test mounts a whole screen and steps through many requests.
jest.setTimeout(30_000);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>{children}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const mountSession = () => mount(<WorkoutSessionScreen sessionId="s1" />);

const mountExercise = () => {
  mockParams.current = {
    exerciseId: "s1-e1",
    planId: "plan-1",
    sessionId: "s1",
    workoutId: "workout-1",
  };

  return mount(<WorkoutSessionExerciseScreen />);
};

/** One Exercise whose second set was removed: stored orders 1, 3 and 4. */
const seedGap = (
  [first, third, fourth]: [number | null, number | null, number | null],
  { finished = false }: { finished?: boolean } = {}
) => {
  backend.seed({
    exercises: [{ name: "Squat", sets: [first, null, third, fourth] }],
    finished,
    id: "s1",
    workoutId: "workout-1",
  });
  backend.sets = backend.sets.filter(({ id }) => id !== "s1-e1-s2");

  for (const set of backend.sets) {
    set.rest_recommended = 90;
  }
};

/** The numbers of the rows not logged yet (a logged one shows a ✓). */
const numbers = () =>
  screen
    .queryAllByText(/^#\d+$/u)
    .map((row) => [row.props.children].flat().join(""));

const press = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
};

const log = async (name: string) => {
  await press(name);
  await settle(queryClient);
};

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", { muscle_groups: ["quadriceps"], name: "Squat" }),
  ]);
});

describe.each([
  { mountScreen: mountSession, name: "the Workout Session screen" },
  { mountScreen: mountExercise, name: "the Workout Session Exercise screen" },
])("set rows on $name", ({ mountScreen }) => {
  it("are numbered by position over a gap, an added set included", async () => {
    seedGap([null, null, null]);
    await mountScreen();
    await press("Add Set");

    expect(numbers()).toEqual(["#1", "#2", "#3", "#4"]);

    for (const number of [1, 2, 3, 4]) {
      expect(screen.getByLabelText(`Set ${number} reps`)).toBeTruthy();
      expect(screen.getByLabelText(`Set ${number} weight`)).toBeTruthy();
      expect(screen.getByTestId(`set-reps-input-${number}`)).toBeTruthy();
      expect(screen.getByTestId(`set-weight-input-${number}`)).toBeTruthy();
    }

    expect(screen.queryByLabelText("Set 5 reps")).toBeNull();

    // Only the first unlogged one can be logged: stored order 3 is set 2.
    await log("Log set 1");
    expect(screen.getByTestId("edit-set-button-1")).toBeTruthy();
    expect(screen.getByTestId("log-set-button-2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log set 2" })).toBeTruthy();
  });

  it("speak a logged set's position, and log an added one in its place", async () => {
    seedGap([8, 8, 8]);
    await mountScreen();
    await press("Add Set");
    await log("Log set 4");

    for (const number of [1, 2, 3, 4]) {
      expect(screen.getByLabelText(`Set ${number}, logged`)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: `Edit set ${number}` })
      ).toBeTruthy();
    }

    expect(backend.sets.map(({ order }) => order)).toEqual([1, 3, 4, 5]);
  });

  it("keep their numbers while a logged added set is read back", async () => {
    seedGap([8, 8, 8]);
    await mountScreen();
    await press("Add Set");
    await press("Add Set");
    const reads = fakePublicApi.count(SESSION_ROUTE);
    const resume = fakePublicApi.pause(SESSION_ROUTE);
    await press("Log set 4");
    await until(
      () =>
        fakePublicApi.count(ADD_SET_ROUTE) === 1 &&
        fakePublicApi.count(SESSION_ROUTE) > reads
    );

    expect(screen.getByLabelText("Set 4, logged")).toBeTruthy();
    expect(numbers()).toEqual(["#5"]);

    // The next one is added after both: its number and its place.
    await press("Add Set");
    expect(numbers()).toEqual(["#5", "#6"]);

    resume();
    await settle(queryClient);

    expect(screen.getAllByLabelText("Set 4, logged")).toHaveLength(1);
    expect(numbers()).toEqual(["#5", "#6"]);
  });

  it("are numbered the same in a finished Workout Session", async () => {
    seedGap([8, null, 8], { finished: true });
    await mountScreen();

    expect(screen.getByLabelText("Set 1, logged")).toBeTruthy();
    expect(screen.getByLabelText("Set 3, logged")).toBeTruthy();
    expect(numbers()).toEqual(["#2"]);
  });

  it("speak their position in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    seedGap([8, null, null]);
    await mountScreen();

    expect(screen.getByLabelText("Підхід 1 записано")).toBeTruthy();
    expect(screen.getByLabelText("Підхід 3, повторення")).toBeTruthy();
  });
});

describe("the rest timer", () => {
  it("names the next unlogged set by its shown number", async () => {
    seedGap([null, null, null]);
    await mountExercise();
    await log("Log set 1");

    expect(screen.getByText("Rest · then set 2")).toBeTruthy();

    await log("Log set 2");

    expect(screen.getByText("Rest · then set 3")).toBeTruthy();
  });

  it("names an added set", async () => {
    seedGap([8, 8, null]);
    await mountExercise();
    await press("Add Set");
    await log("Log set 3");

    expect(screen.getByText("Rest · then set 4")).toBeTruthy();
  });

  it("follows the sets shown, and says Rest with none left", async () => {
    seedGap([null, null, null]);
    await mountExercise();
    await log("Log set 1");
    await log("Log set 2");
    expect(screen.getByText("Rest · then set 3")).toBeTruthy();

    const reread = async () => {
      await act(() => queryClient.invalidateQueries());
      await settle(queryClient);
    };

    // Removed elsewhere: the first set, then the one to do next.
    backend.sets = backend.sets.filter(({ order }) => order !== 1);
    await reread();
    expect(screen.getByText("Rest · then set 2")).toBeTruthy();

    backend.sets = backend.sets.filter(({ order }) => order !== 4);
    await reread();
    expect(screen.getByText("Rest")).toBeTruthy();
  });
});
