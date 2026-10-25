/**
 * Editing an open Workout Session's Exercises from its screen goes through
 * the Public API (FIT-310): adding an Exercise posts to
 * `/v1/workout-sessions/{id}/exercises`, never inserts through Supabase, and
 * a failed add says what went wrong in an alert.
 *
 * Mounts the real screen on the fake Public API and the in-memory Supabase
 * backend over the same rows, and the fake Exercise Library; expo-router and
 * the SwiftUI-backed primitives are swapped for plain stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import { serveLibrary } from "~/test-utils/fake-exercise-library";
import { type Failure, fakePublicApi } from "~/test-utils/fake-public-api";
import {
  backend,
  libraryExerciseNamed,
} from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle as settleQueries,
} from "~/test-utils/query-client";

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
// The Exercise picker's muscle group menu (SwiftUI) shows nothing.
jest.mock("~/components/ui/picker", () => ({ Picker: () => null }));

const ADD_EXERCISE = "POST /v1/workout-sessions/{id}/exercises";

let queryClient: QueryClient;

const renderSession = async () => {
  mockParams.current = { workoutSessionId: "s1" };
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <HistorySessionScreen />
    </QueryClientProvider>
  );
  await settle();
};

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

/** Opens the picker and adds its first Exercise (Lunge: it lists by name). */
const addLunge = async () => {
  await fireEvent.press(await screen.findByText("Add Exercise"));
  const [addFirst] = await screen.findAllByText("Add");
  // Picking an Exercise awaits its save and then closes the picker; keep
  // that whole update inside `act`.
  await act(async () => {
    await fireEvent.press(addFirst as NonNullable<typeof addFirst>);
  });
  await settle();
};

// Each test mounts a whole screen and steps through many requests, so a test
// takes seconds of CPU; Jest's 5 s default fails them on a busy 2-core runner.
jest.setTimeout(30_000);

const track = segmentClient.track as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  serveLibrary(["Squat", "Lunge"].map((name) => libraryExerciseNamed(name)));
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.seed({
    exercises: [{ name: "Squat", sets: [10, 8] }],
    id: "s1",
  });
});

describe("adding an Exercise to a Workout Session", () => {
  it("adds it through the Public API after the last Exercise", async () => {
    await renderSession();

    await addLunge();

    expect(fakePublicApi.requests.at(-1)).toMatchObject({
      body: { exercise_slug: "lunge" },
      path: "/v1/workout-sessions/s1/exercises",
      route: ADD_EXERCISE,
    });
    expect(backend.count("workout_session_exercises", "insert")).toBe(0);
    expect(backend.exercises.at(-1)).toMatchObject({
      exercise_slug: "lunge",
      order: 2,
      workout_session_id: "s1",
    });
    expect(await screen.findByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Add")).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("Exercise Added", {
      exercise_slug: "lunge",
      session_id: "s1",
    });
  });

  it.each<[string, Failure, string]>([
    [
      "the Exercise Library is down",
      { code: "exercise_library_unavailable", status: 503 },
      "The exercise library is unavailable right now. Please try again.",
    ],
    [
      "there were too many requests",
      { retryAfterSeconds: 12, status: 429 },
      "Too many requests: please try again in 12 s.",
    ],
    [
      "the Workout Session is already finished",
      { code: "session_finished", status: 409 },
      "This workout is already finished.",
    ],
    [
      "the Exercise is unknown",
      { code: "unknown_exercises", status: 400 },
      "Please check your connection and try again.",
    ],
    [
      "the server fails",
      { status: 500 },
      "Please check your connection and try again.",
    ],
    [
      "the connection fails",
      "network",
      "Please check your connection and try again.",
    ],
  ])(
    "says so in an alert when %s, adding nothing",
    async (_, failure, message) => {
      await renderSession();
      fakePublicApi.failNext(ADD_EXERCISE, failure);

      await addLunge();

      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't add exercise",
        message
      );
      expect(fakePublicApi.count(ADD_EXERCISE)).toBe(1);
      expect(backend.count("workout_session_exercises", "insert")).toBe(0);
      expect(backend.exercises).toHaveLength(1);
      // The picker stays open, so the User can try again.
      expect(screen.queryAllByText("Add")).not.toHaveLength(0);
      expect(track).not.toHaveBeenCalledWith(
        "Exercise Added",
        expect.anything()
      );
    }
  );

  it("shows an Exercise saved before the answer was lost", async () => {
    await renderSession();
    fakePublicApi.failNext(ADD_EXERCISE, "lost");

    await addLunge();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't add exercise",
      "Please check your connection and try again."
    );
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(await screen.findByText("Lunge")).toBeTruthy();
    expect(backend.count("workout_session_exercises", "insert")).toBe(0);
  });
});
