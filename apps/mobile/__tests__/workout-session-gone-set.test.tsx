/**
 * Logging or editing a set that's gone (removed by an MCP client, Arnold or
 * another device) reads the Workout Session again, so its row goes away
 * (FIT-802), on the Workout Session screen and the Workout Session Exercise
 * screen. Any other failure only shows the row's error.
 *
 * Mounts the real screens on the fake Public API.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
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

const LOG_SET_ROUTE = "PATCH /v1/workout-session-sets/{id}";
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

/** Removes a set as another device would: the phone doesn't know. */
const removeElsewhere = (id: string) => {
  backend.sets = backend.sets.filter((set) => set.id !== id);
};

const press = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
};

const log = async (name: string) => {
  await press(name);
  await settle(queryClient);
};

const SAVE_ERROR = "Couldn't save this set. Try again.";

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", { muscle_groups: ["quadriceps"], name: "Squat" }),
  ]);
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null, null] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

describe.each([
  { mountScreen: mountSession, name: "the Workout Session screen" },
  { mountScreen: mountExercise, name: "the Workout Session Exercise screen" },
])("a set removed elsewhere, on $name", ({ mountScreen }) => {
  it("goes away once logging it answers 404, with its error until then", async () => {
    await mountScreen();
    removeElsewhere("s1-e1-s2");
    const reads = fakePublicApi.count(SESSION_ROUTE);
    const resume = fakePublicApi.pause(SESSION_ROUTE);
    await press("Log set 2");
    await until(() => fakePublicApi.count(SESSION_ROUTE) > reads);

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();

    resume();
    await settle(queryClient);

    expect(screen.queryByText(SAVE_ERROR)).toBeNull();
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
    expect(screen.getByRole("button", { name: "Log set 2" })).toBeTruthy();
    expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads + 1);
  });

  it("goes away once editing it answers 404", async () => {
    await mountScreen();
    removeElsewhere("s1-e1-s1");
    await press("Edit set 1");
    await log("Log set 1");

    expect(screen.queryByText(SAVE_ERROR)).toBeNull();
    expect(screen.queryByLabelText("Set 1, logged")).toBeNull();
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
  });

  it("keeps its row and error when the read fails, until one lands", async () => {
    await mountScreen();
    removeElsewhere("s1-e1-s2");
    fakePublicApi.failNext(SESSION_ROUTE, "network");
    await log("Log set 2");

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();

    await log("Log set 2");

    expect(screen.queryByText(SAVE_ERROR)).toBeNull();
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
  });

  it("goes away when it was added here and no read ever had it", async () => {
    backend.sets = backend.sets.filter(({ id }) => id === "s1-e1-s1");
    await mountScreen();
    await press("Add Set");
    fakePublicApi.failNext(SESSION_ROUTE, "network");
    await log("Log set 2");
    backend.sets = backend.sets.filter(({ id }) => id === "s1-e1-s1");
    await press("Edit set 2");
    fakePublicApi.failNext(SESSION_ROUTE, "network");
    await log("Log set 2");

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();

    await log("Log set 2");

    expect(screen.queryByText(SAVE_ERROR)).toBeNull();
    expect(screen.queryByRole("button", { name: "Log set 2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit set 2" })).toBeNull();
  });

  it("reads the Workout Session again when an added set's Exercise is gone", async () => {
    backend.sets = [];
    await mountScreen();
    await press("Add Set");
    const reads = fakePublicApi.count(SESSION_ROUTE);
    backend.exercises = [];
    await log("Log set 1");

    expect(fakePublicApi.count(ADD_SET_ROUTE)).toBe(1);
    expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads + 1);
    expect(screen.queryByRole("button", { name: "Log set 1" })).toBeNull();
  });

  it.each([
    {
      failure: {
        code: "rate_limited",
        retryAfterSeconds: 30,
        status: 429,
      } as const,
      message: "Too many requests. Try again in 30 s.",
    },
    { failure: "network" as const, message: SAVE_ERROR },
  ])(
    "reads nothing again on any other failure ($message)",
    async ({ failure, message }) => {
      await mountScreen();
      const reads = fakePublicApi.count(SESSION_ROUTE);
      fakePublicApi.failNext(LOG_SET_ROUTE, failure);
      await log("Log set 2");

      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
      expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads);
    }
  );

  it("reads the Workout Session again once it answers finished (FIT-818)", async () => {
    await mountScreen();
    const reads = fakePublicApi.count(SESSION_ROUTE);
    fakePublicApi.failNext(LOG_SET_ROUTE, {
      code: "session_finished",
      status: 409,
    });
    await log("Log set 2");

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads + 1);
  });

  it("goes away in Ukrainian too", async () => {
    setDeviceLanguages(["uk-UA"]);
    await mountScreen();
    removeElsewhere("s1-e1-s2");
    expect(screen.getByLabelText("Підхід 3, повторення")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("log-set-button-2"));
    await settle(queryClient);

    expect(screen.queryByLabelText("Підхід 3, повторення")).toBeNull();
  });
});
