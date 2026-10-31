/**
 * Editing an open Workout Session's Exercises from its screen goes through
 * the Public API: adding an Exercise posts to
 * `/v1/workout-sessions/{id}/exercises` (FIT-310), removing and replacing one
 * deletes and puts `/v1/workout-session-exercises/{id}` (FIT-312), never
 * writing through Supabase, and a failed edit says what went wrong in an
 * alert. Adding and replacing go through the Exercise picker, its own route
 * over the Workout Session (FIT-432).
 *
 * Mounts the real screen on the fake Public API and the in-memory Supabase
 * backend over the same rows, and the fake Library, with the picker route
 * mounted over it once pushed (`test-utils/router-stub.tsx`); the
 * SwiftUI-backed primitives are swapped for plain stand-ins.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import MusclesSheet from "~/app/muscles";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import { getMuscleChoice } from "~/hooks/muscle-choice";
import { i18n } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { type Failure, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle as settleQueries,
  until,
} from "~/test-utils/query-client";
import {
  PushedRoutes,
  pushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";
import { SEARCH_BAR_TEST_ID } from "~/test-utils/stack-screen-stub";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    // A link shows as a view naming where it goes.
    Link: ({ children, href }: { children: ReactNode; href: string }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    Stack: { Screen: stub.StackScreenStub },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
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
// A symbol shows as a view naming it: the picker rows' "+" or swap.
jest.mock("~/components/symbol-image", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SymbolImage: ({ name }: { name: string }) => (
      <View testID={`symbol:${name}`} />
    ),
  };
});
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

const ADD_EXERCISE = "POST /v1/workout-sessions/{id}/exercises";
const REMOVE_EXERCISE = "DELETE /v1/workout-session-exercises/{id}";
const REPLACE_EXERCISE = "PUT /v1/workout-session-exercises/{id}";
const PICKER = "/workout-sessions/[workoutSessionId]/exercise-picker";

let queryClient: QueryClient;

const renderSession = async () => {
  mockParams.current = { workoutSessionId: "s1" };
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <HistorySessionScreen />
        <PushedRoutes
          screens={{ "/muscles": MusclesSheet, [PICKER]: ExercisePickerScreen }}
        />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle();
  // Replacing starts on the Exercise's muscle group, which the Library gives:
  // wait until it has answered for the seeded Squat.
  await screen.findByTestId("thumbnail:https://media.test/render/squat.jpg");
};

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

/** Whether the Exercise picker is open over the Workout Session. */
const pickerOpen = () =>
  pushedRoutes().some(({ pathname }) => pathname === PICKER);

const ADD_ICON = "symbol:plus";
const REPLACE_ICON = "symbol:arrow.left.arrow.right";

/** Opens the picker and taps Lunge's row, which adds it. */
const addLunge = async () => {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Add Exercise" })
  );
  const lunge = await screen.findByRole("button", { name: "Add Lunge" });
  // Picking an Exercise awaits its save and then closes the picker; keep
  // that whole update inside `act`.
  await act(async () => {
    await fireEvent.press(lunge);
  });
  await settle();
};

/** Deletes the first Exercise through its card's menu. */
const deleteFirst = async () => {
  const [deleteItem] = await screen.findAllByLabelText("Delete");
  await act(async () => {
    await fireEvent.press(deleteItem as NonNullable<typeof deleteItem>);
  });
  await settle();
};

/** Opens the picker replacing the first Exercise. */
const openReplacePicker = async () => {
  const [replaceItem] = await screen.findAllByLabelText("Replace");
  await fireEvent.press(replaceItem as NonNullable<typeof replaceItem>);
  await settle();
};

/** Replaces the first Exercise by tapping Lunge's row in the picker. */
const replaceFirstWithLunge = async () => {
  await openReplacePicker();
  const lunge = await screen.findByRole("button", {
    name: "Replace with Lunge",
  });
  await act(async () => {
    await fireEvent.press(lunge);
  });
  await settle();
};

/** A failed edit and the alert message it shows. */
const failures: [string, Failure, string][] = [
  [
    "the Library is down",
    { code: "library_unavailable", status: 503 },
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
];

// Each test mounts a whole screen and steps through many requests, so a test
// takes seconds of CPU; Jest's 5 s default fails them on a busy 2-core runner.
jest.setTimeout(30_000);

const track = segmentClient.track as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  // Replacing Squat starts on quadriceps, which Push-up doesn't train.
  serveLibrary([
    libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
    libraryExercise("lunge", { muscle_groups: ["quadriceps", "glutes"] }),
    libraryExercise("push-up", { muscle_groups: ["chest"] }),
  ]);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.seed({
    exercises: [{ name: "Squat", sets: [10, 8] }],
    id: "s1",
  });
});

// The i18n instance outlives a test; the device goes back to English on its own.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the Exercise picker", () => {
  it("opens over the Workout Session as Add Exercise, unfiltered", async () => {
    await renderSession();

    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { workoutSessionId: "s1" },
        pathname: PICKER,
      }),
    ]);
    expect(
      await screen.findByRole("header", { name: "Add Exercise" })
    ).toBeTruthy();
    expect(await screen.findByText("Push Up")).toBeTruthy();
    // Each whole row adds its Exercise, ending in a "+", with no button.
    for (const name of ["Lunge", "Push Up", "Squat"]) {
      expect(screen.getByRole("button", { name: `Add ${name}` })).toBeTruthy();
    }
    expect(screen.getAllByTestId(ADD_ICON)).toHaveLength(3);
    expect(screen.queryByTestId(REPLACE_ICON)).toBeNull();
    expect(screen.queryByText("Add")).toBeNull();
  });

  it("opens as Replace Exercise on the replaced one's first muscle group", async () => {
    await renderSession();

    const [replaceItem] = await screen.findAllByLabelText("Replace");
    await fireEvent.press(replaceItem as NonNullable<typeof replaceItem>);
    await settle();

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: {
          muscleGroup: "quadriceps",
          replaceExerciseId: "s1-e1",
          workoutSessionId: "s1",
        },
        pathname: PICKER,
      }),
    ]);
    expect(
      screen.getByRole("header", { name: "Replace Exercise" })
    ).toBeTruthy();
    // Squat and Lunge train quadriceps; Push-up doesn't. Each whole row
    // replaces with its Exercise, ending in a swap icon, with no button.
    expect(
      screen.getByRole("button", { name: "Replace with Lunge" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Replace with Squat" })
    ).toBeTruthy();
    expect(screen.getAllByTestId(REPLACE_ICON)).toHaveLength(2);
    expect(screen.queryByTestId(ADD_ICON)).toBeNull();
    expect(screen.queryByText("Replace")).toBeNull();
    expect(screen.queryByText("Push Up")).toBeNull();

    // The Muscles sheet over the picker starts from that choice.
    await fireEvent.press(screen.getByRole("button", { name: "Muscles" }));
    await settle();
    expect(
      screen.getByRole("checkbox", { name: "Quadriceps" }).props
        .accessibilityState
    ).toEqual({ checked: true });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Chest" }));
    await fireEvent.press(screen.getByLabelText("Done"));
    await settle();

    expect(screen.getByText("Push Up")).toBeTruthy();
    expect(screen.getAllByTestId(REPLACE_ICON)).toHaveLength(3);
    // The picker's choice is its own: the Library tab's is untouched.
    expect(getMuscleChoice("library")).toEqual([]);
  });

  it("starts unfiltered again when adding after a replace", async () => {
    await renderSession();
    const [replaceItem] = await screen.findAllByLabelText("Replace");
    await fireEvent.press(replaceItem as NonNullable<typeof replaceItem>);
    await settle();

    await fireEvent.press(screen.getByLabelText("Close"));
    expect(pickerOpen()).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();

    expect(screen.getByRole("header", { name: "Add Exercise" })).toBeTruthy();
    expect(screen.getByText("Push Up")).toBeTruthy();
    expect(screen.getAllByTestId(ADD_ICON)).toHaveLength(3);
    expect(screen.queryByTestId(REPLACE_ICON)).toBeNull();
  });

  it("reads its titles, rows and Close in Ukrainian", async () => {
    serveLibrary([
      libraryExercise("squat", {
        muscle_groups: ["quadriceps"],
        translations: { uk: { name: "Присідання" } },
      }),
      libraryExercise("lunge", {
        muscle_groups: ["quadriceps", "glutes"],
        translations: { uk: { name: "Випади" } },
      }),
    ]);
    setDeviceLanguages(["uk-UA"]);
    await renderSession();

    await fireEvent.press(
      screen.getByRole("button", { name: "Додати вправу" })
    );
    await settle();
    expect(screen.getByRole("header", { name: "Додати вправу" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Додати вправу «Випади»" })
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Закрити"));
    expect(pickerOpen()).toBe(false);

    const [replaceItem] = await screen.findAllByLabelText("Замінити");
    await fireEvent.press(replaceItem as NonNullable<typeof replaceItem>);
    await settle();
    expect(
      screen.getByRole("header", { name: "Замінити вправу" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Замінити на «Випади»" })
    ).toBeTruthy();
  });
});

/** The picker's rows: each one's "Add" (or "Replace") button. */
/** How many picker rows end in the add ("plus") or replace ("swap") icon. */
const pickerRows = (mode: "add" | "replace") =>
  screen.queryAllByTestId(mode === "add" ? ADD_ICON : REPLACE_ICON).length;

/**
 * The User types in the picker's header search bar; waits past the debounce
 * until the list shows `rows` results.
 */
const searchPicker = async (
  text: string,
  rows: number,
  mode: "add" | "replace" = "add"
) => {
  await fireEvent.changeText(screen.getByTestId(SEARCH_BAR_TEST_ID), text);
  await until(() => pickerRows(mode) === rows);
  await settle();
};

describe("searching in the Exercise picker", () => {
  it("lists what matches the header search", async () => {
    await renderSession();
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();
    expect(pickerRows("add")).toBe(3);

    await searchPicker("push", 1);

    expect(screen.getByText("Push Up")).toBeTruthy();
    expect(screen.queryByText("Lunge")).toBeNull();
  });

  it("searches within the replaced one's muscle group", async () => {
    await renderSession();
    const [replaceItem] = await screen.findAllByLabelText("Replace");
    await fireEvent.press(replaceItem as NonNullable<typeof replaceItem>);
    await settle();
    expect(pickerRows("replace")).toBe(2);

    await searchPicker("lun", 1, "replace");

    expect(screen.getByText("Lunge")).toBeTruthy();
  });

  it("adds the Exercise picked from a search", async () => {
    await renderSession();
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();
    await searchPicker("push", 1);

    // A result is tapped with the search keyboard still up.
    await act(async () => {
      await fireEvent.press(
        screen.getByRole("button", { name: "Add Push Up" })
      );
    });
    await settle();

    expect(fakePublicApi.requests.at(-1)).toMatchObject({
      body: { exercise_slug: "push-up" },
      route: ADD_EXERCISE,
    });
    expect(pickerOpen()).toBe(false);
    expect(await screen.findByText("Push Up")).toBeTruthy();
  });

  it("clears the search from the empty state", async () => {
    await renderSession();
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();
    await searchPicker("zzz", 0);
    expect(await screen.findByText("No Exercises Found")).toBeTruthy();

    await fireEvent.press(screen.getByText("Show All Exercises"));
    await until(() => pickerRows("add") === 3);

    expect(screen.getByTestId(SEARCH_BAR_TEST_ID).props.value).toBe("");
  });

  it("starts with an empty search on every open", async () => {
    await renderSession();
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();
    await searchPicker("push", 1);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(pickerOpen()).toBe(false);

    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    await settle();

    expect(screen.getByTestId(SEARCH_BAR_TEST_ID).props.value).toBe("");
    expect(pickerRows("add")).toBe(3);
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
    expect(pickerOpen()).toBe(false);
    expect(screen.queryByRole("button", { name: "Add Lunge" })).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("Exercise Added", {
      exercise_slug: "lunge",
      session_id: "s1",
    });
  });

  it.each(failures)(
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
      expect(pickerOpen()).toBe(true);
      expect(screen.getByRole("button", { name: "Add Lunge" })).toBeTruthy();
      expect(track).not.toHaveBeenCalledWith(
        "Exercise Added",
        expect.anything()
      );
    }
  );

  it("adds it once when its row is tapped twice", async () => {
    await renderSession();
    await fireEvent.press(screen.getByRole("button", { name: "Add Exercise" }));
    const lunge = await screen.findByRole("button", { name: "Add Lunge" });
    const resume = fakePublicApi.pause(ADD_EXERCISE);

    await fireEvent.press(lunge);
    await fireEvent.press(lunge);
    await act(() => resume());
    await settle();

    expect(fakePublicApi.count(ADD_EXERCISE)).toBe(1);
    expect(backend.exercises).toHaveLength(2);
    expect(pickerOpen()).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("shows an Exercise saved before the answer was lost", async () => {
    await renderSession();
    fakePublicApi.failNext(ADD_EXERCISE, "lost");

    await addLunge();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't add exercise",
      "Please check your connection and try again."
    );
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(pickerOpen()).toBe(false);
    expect(await screen.findByText("Lunge")).toBeTruthy();
    expect(backend.count("workout_session_exercises", "insert")).toBe(0);
  });
});

describe("removing an Exercise from a Workout Session", () => {
  beforeEach(() => {
    backend.reset();
    backend.seed({
      exercises: [
        { name: "Squat", sets: [10, 8] },
        { name: "Lunge", sets: [12] },
      ],
      id: "s1",
    });
  });

  it("removes it through the Public API, leaving the others' order", async () => {
    await renderSession();

    await deleteFirst();

    expect(fakePublicApi.requests.at(-1)).toMatchObject({
      path: "/v1/workout-session-exercises/s1-e1",
      route: REMOVE_EXERCISE,
    });
    expect(backend.count("workout_session_exercises", "delete")).toBe(0);
    expect(backend.exercises).toEqual([
      expect.objectContaining({ exercise_slug: "lunge", order: 2 }),
    ]);
    expect(backend.sets.map(({ id }) => id)).toEqual(["s1-e2-s1"]);
    expect(screen.queryByText("Squat")).toBeNull();
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("Exercise Deleted", {
      exercise_id: "s1-e1",
      session_id: "s1",
    });
  });

  it.each(failures)(
    "says so in an alert when %s, removing nothing",
    async (_, failure, message) => {
      await renderSession();
      fakePublicApi.failNext(REMOVE_EXERCISE, failure);

      await deleteFirst();

      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't delete exercise",
        message
      );
      expect(backend.exercises).toHaveLength(2);
      expect(screen.getByText("Squat")).toBeTruthy();
      expect(track).not.toHaveBeenCalledWith(
        "Exercise Deleted",
        expect.anything()
      );
    }
  );

  it("shows an Exercise removed before the answer was lost as gone", async () => {
    await renderSession();
    fakePublicApi.failNext(REMOVE_EXERCISE, "lost");

    await deleteFirst();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't delete exercise",
      "Please check your connection and try again."
    );
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("replacing an Exercise in a Workout Session", () => {
  it("replaces it through the Public API, zeroing its sets' targets", async () => {
    await renderSession();

    await replaceFirstWithLunge();

    expect(fakePublicApi.requests.at(-1)).toMatchObject({
      body: { exercise_slug: "lunge" },
      path: "/v1/workout-session-exercises/s1-e1",
      route: REPLACE_EXERCISE,
    });
    expect(backend.count("workout_session_exercises", "update")).toBe(0);
    expect(backend.count("workout_session_exercise_sets", "update")).toBe(0);
    expect(backend.exercises).toEqual([
      expect.objectContaining({
        exercise_slug: "lunge",
        id: "s1-e1",
        order: 1,
      }),
    ]);
    expect(
      backend.sets.map(({ reps_completed, reps_recommended }) => ({
        reps_completed,
        reps_recommended,
      }))
    ).toEqual([
      { reps_completed: 10, reps_recommended: 0 },
      { reps_completed: 8, reps_recommended: 0 },
    ]);
    expect(await screen.findByText("Lunge")).toBeTruthy();
    expect(pickerOpen()).toBe(false);
    expect(screen.queryByText("Squat")).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("Exercise Replaced", {
      exercise_slug: "lunge",
      session_id: "s1",
    });
  });

  it("replaces it once when its row is tapped twice", async () => {
    await renderSession();
    await openReplacePicker();
    const lunge = await screen.findByRole("button", {
      name: "Replace with Lunge",
    });
    const resume = fakePublicApi.pause(REPLACE_EXERCISE);

    await fireEvent.press(lunge);
    await fireEvent.press(lunge);
    await act(() => resume());
    await settle();

    expect(fakePublicApi.count(REPLACE_EXERCISE)).toBe(1);
    expect(backend.exercises).toEqual([
      expect.objectContaining({ exercise_slug: "lunge", id: "s1-e1" }),
    ]);
    expect(pickerOpen()).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it.each(failures)(
    "says so in an alert when %s, replacing nothing",
    async (_, failure, message) => {
      await renderSession();
      fakePublicApi.failNext(REPLACE_EXERCISE, failure);

      await replaceFirstWithLunge();

      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't replace exercise",
        message
      );
      expect(fakePublicApi.count(REPLACE_EXERCISE)).toBe(1);
      expect(backend.exercises).toEqual([
        expect.objectContaining({ exercise_slug: "squat" }),
      ]);
      expect(
        backend.sets.map(({ reps_recommended }) => reps_recommended)
      ).toEqual([10, 10]);
      // The picker stays open, so the User can try again.
      expect(pickerOpen()).toBe(true);
      expect(
        screen.getByRole("button", { name: "Replace with Lunge" })
      ).toBeTruthy();
      expect(track).not.toHaveBeenCalledWith(
        "Exercise Replaced",
        expect.anything()
      );
    }
  );
});
