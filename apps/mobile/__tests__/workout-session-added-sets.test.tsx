/**
 * A set added with Add Set and not logged yet (FIT-638) shows on both the
 * Workout Session screen and the Workout Session Exercise screen, whichever
 * one added it: the Public API has no route creating an unlogged set, so it
 * lives in memory on the phone, shared by the two, until the User logs it.
 *
 * Mounts the real screens on the fake Public API, with the fake Library
 * naming the Exercise; the SwiftUI-backed primitives are swapped for plain
 * stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/workout-sessions/rest-timer", () => () => null);

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

// Each test mounts a whole screen twice and steps through many requests.
jest.setTimeout(30_000);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

const addSet = async () => {
  await fireEvent.press(screen.getByRole("button", { name: "Add Set" }));
};

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([libraryExercise("squat", { muscle_groups: ["quadriceps"] })]);
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, 8] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

describe("a set added with Add Set and not logged yet", () => {
  it("shows on the Workout Session Exercise screen once added on the session screen", async () => {
    await mountSession();
    await addSet();
    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
    await screen.unmount();

    await mountExercise();

    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
    expect(screen.queryByLabelText("Set 4 reps")).toBeNull();
    // Nothing is written until the User logs it.
    expect(fakePublicApi.count(ADD_SET_ROUTE)).toBe(0);
  });

  it("shows on the session screen once added on the Workout Session Exercise screen", async () => {
    await mountExercise();
    await addSet();
    await addSet();
    await screen.unmount();

    await mountSession();

    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
    expect(screen.getByLabelText("Set 4 reps")).toBeTruthy();
    expect(fakePublicApi.count(ADD_SET_ROUTE)).toBe(0);
  });

  it("is the saved set on both screens once logged on either", async () => {
    await mountSession();
    await addSet();
    await screen.unmount();

    await mountExercise();
    await fireEvent.press(screen.getByRole("button", { name: "Log set 3" }));
    await settle(queryClient);
    expect(fakePublicApi.count(ADD_SET_ROUTE)).toBe(1);
    await screen.unmount();

    await mountSession();

    // The logged set, read back, and no unlogged row left in its place.
    expect(screen.getByRole("button", { name: "Edit set 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log set 3" })).toBeNull();
    expect(screen.queryByLabelText("Set 4 reps")).toBeNull();
  });
});
