/**
 * A note on a logged set, from its row (FIT-838, Figma's C and D frames,
 * FIT-820): on the Workout Session Exercise screen and the Workout Session
 * screen's Exercise cards, which share the row. A logged row's ••• menu (Edit
 * Set, Add or Edit Note) takes the pencil's place; the note shows under the
 * row, in full on the Exercise screen and in two lines on the cards. Saved
 * through the fake Public API's `PUT /v1/workout-session-sets/{id}/note`,
 * whose rows each save is checked against, in English and Ukrainian. Mounts
 * the real screens on the real expo-router.
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
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { setNotesEnabled } from "~/lib/feature-flags";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { firedHaptics } from "~/test-utils/haptics-stub";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
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

jest.mock("~/components/exercises/exercise-video", () => () => null);

// The body diagram reads theme colors uniwind has no stylesheet for in Jest.
jest.mock("~/components/views/workout-session-summary-body", () => ({
  WorkoutSessionSummaryBodyBack: () => null,
  WorkoutSessionSummaryBodyFront: () => null,
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

// The countdown animates through Reanimated: only whether it shows matters.
jest.mock("~/components/workout-sessions/rest-timer", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return () => <MockText>Resting</MockText>;
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);

const SAVE = "PUT /v1/workout-session-sets/{id}/note";
const READ = "GET /v1/workout-sessions/{id}";

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;

const FELT_EASY = "Felt easy, add 2.5 kg next time";

// Each test mounts whole screens and steps through many requests.
jest.setTimeout(60_000);

let queryClient: QueryClient;
let pathname: string;

const TabsStub = () => <Slot />;

const HomeStub = () => <Text>Home</Text>;

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

/** Opens the app on Home, then pushes each of `pushed` over it. */
const open = async (...pushed: Href[]) => {
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
      "workout-sessions/[workoutSessionId]/summary":
        WorkoutSessionSummaryScreen,
    },
    "/"
  );
  await settle(queryClient);

  for (const next of pushed) {
    // oxlint-disable-next-line no-await-in-loop -- Each is pushed over the last.
    await go(() => router.push(next));
  }
};

/** Picks an item of set `number`'s ••• menu. */
const pickFromMenu = async (number: number, item: string) => {
  await fireEvent.press(screen.getByTestId(`set-menu-${number}`));
  await fireEvent.press(screen.getByRole("menuitem", { name: item }));
};

const typeNote = async (number: number, text: string) => {
  await fireEvent.changeText(
    screen.getByTestId(`set-note-${number}-field`),
    text
  );
};

const save = async (number: number) => {
  await fireEvent.press(screen.getByTestId(`set-note-${number}-save`));
  await settle(queryClient);
};

const noteOf = (setId: string) =>
  backend.sets.find(({ id }) => id === setId)?.note;

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls.map(([title]) => title);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  backend.reset();
  storage.clearAll();
  setNotesEnabled(true);
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", {
      name: "Squat",
      translations: { uk: { name: "Присідання" } },
    }),
  ]);
  backend.seedPlan({
    id: "plan-1",
    name: "Full body",
    workouts: [
      {
        exercises: [{ sets: 3, slug: "squat" }],
        id: "workout-1",
        name: "Day A",
      },
    ],
  });
  // Set 1 logged, set 2 logged with a note, set 3 not logged yet. None has a
  // weight: they're bodyweight sets.
  backend.seed({
    exercises: [
      {
        name: "Squat",
        notes: [null, FELT_EASY],
        sets: [8, 10, null],
        slug: "squat",
      },
    ],
    id: "s1",
    workoutId: "workout-1",
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the notes flag", () => {
  it("off, keeps the pencil and shows no note", async () => {
    setNotesEnabled(false);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByTestId("edit-set-button-1")).toBeTruthy();
    expect(screen.queryByTestId("set-menu-1")).toBeNull();
    expect(screen.queryByText(FELT_EASY)).toBeNull();
  });
});

describe("a set's note on the Workout Session Exercise screen", () => {
  it("offers a note on a logged set's ••• menu, and none on one not logged", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.queryByTestId("edit-set-button-1")).toBeNull();
    expect(screen.getByLabelText("More actions for set 1")).toBeTruthy();
    expect(screen.queryByTestId("set-menu-3")).toBeNull();
    expect(screen.getByTestId("log-set-button-3")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("set-menu-1"));
    expect(screen.getByRole("menuitem", { name: "Edit Set" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add Note" })).toBeTruthy();

    await fireEvent.press(screen.getByTestId("set-menu-2"));
    expect(screen.getByRole("menuitem", { name: "Edit Note" })).toBeTruthy();
  });

  it("adds a note to a bodyweight set without logging anything", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    const [{ logged_at: loggedAt }] = backend.sets;

    await pickFromMenu(1, "Add Note");
    expect(screen.getByLabelText("Note for set 1")).toBeTruthy();
    expect(screen.getByPlaceholderText("How did this set go?")).toBeTruthy();
    await typeNote(1, "  Knees caved on rep 6\n");
    await save(1);

    expect(noteOf("s1-e1-s1")).toBe("Knees caved on rep 6");
    expect(screen.getByText("Knees caved on rep 6")).toBeTruthy();
    expect(screen.queryByTestId("set-note-1-field")).toBeNull();
    // A note is no activity: the set, the rest timer and the stats stay.
    expect(backend.sets[0]).toMatchObject({
      logged_at: loggedAt,
      reps_completed: 8,
      weight_completed: null,
    });
    expect(screen.queryByText("Resting")).toBeNull();
    expect(firedHaptics).toEqual([]);
    expect(sentAnalytics.events()).toEqual([
      { name: "Note Saved", properties: { target: "set" } },
    ]);
  });

  it("shows a saved note under its row, reads it with the row, and edits it from its text", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByText(FELT_EASY)).toBeTruthy();
    expect(
      screen.getByLabelText(`Set 2, logged. 10 reps. Note: ${FELT_EASY}`)
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(`Note on set 2: ${FELT_EASY}`));
    expect(screen.getByTestId("set-note-2-field").props.value).toBe(FELT_EASY);
    await typeNote(2, "Felt heavy");
    await save(2);

    expect(noteOf("s1-e1-s2")).toBe("Felt heavy");
    expect(screen.getByText("Felt heavy")).toBeTruthy();
  });

  it("clears a note saved blank", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    await pickFromMenu(2, "Edit Note");
    await typeNote(2, "   ");
    await save(2);

    expect(noteOf("s1-e1-s2")).toBeNull();
    expect(screen.queryByText(FELT_EASY)).toBeNull();
    expect(sentAnalytics.events()).toEqual([
      { name: "Note Cleared", properties: { target: "set" } },
    ]);
  });

  it("keeps Save off until the text changes, and Cancel closes the editor", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    await pickFromMenu(2, "Edit Note");
    expect(screen.getByTestId("set-note-2-save")).toBeDisabled();

    await fireEvent.press(screen.getByTestId("set-note-2-cancel"));
    expect(screen.queryByTestId("set-note-2-field")).toBeNull();
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(SAVE)).toBe(0);
  });

  it("cuts a note at 500 characters and says so", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    await pickFromMenu(1, "Add Note");
    await typeNote(1, "a".repeat(510));

    expect(screen.getByTestId("set-note-1-field").props.value).toHaveLength(
      500
    );
    expect(screen.getByText("500/500 · Character limit reached")).toBeTruthy();
  });

  it("keeps a note through Edit Set and a reps change", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    await pickFromMenu(2, "Edit Set");
    await fireEvent.changeText(screen.getByTestId("set-reps-input-2"), "12");
    await fireEvent.press(screen.getByTestId("log-set-button-2"));
    await settle(queryClient);

    expect(backend.sets[1]).toMatchObject({
      note: FELT_EASY,
      reps_completed: 12,
    });
    expect(screen.getByText(FELT_EASY)).toBeTruthy();
  });

  it("keeps the text with its error when the save fails, and saves on a retry", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    fakePublicApi.failNext(SAVE, { status: 500 });

    await save(1);

    expect(screen.getByTestId("set-note-1-field").props.value).toBe(
      "Grip faded"
    );
    expect(
      screen.getByText("Couldn't save your note. Try again.")
    ).toBeTruthy();
    expect(sentAnalytics.events()).toEqual([]);

    await save(1);
    expect(noteOf("s1-e1-s1")).toBe("Grip faded");
  });

  it("shows a 429's wait with Save off", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    fakePublicApi.failNext(SAVE, { retryAfterSeconds: 30, status: 429 });

    await save(1);

    expect(screen.getByText("Too many saves. Try again in 30 s.")).toBeTruthy();
    expect(screen.getByTestId("set-note-1-save")).toBeDisabled();
    expect(noteOf("s1-e1-s1")).toBeNull();
  });

  it("says a set that's gone is gone, and reads the session again", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    // Removed elsewhere meanwhile.
    backend.sets = backend.sets.filter(({ id }) => id !== "s1-e1-s1");
    const reads = fakePublicApi.count(READ);

    await save(1);

    expect(alerts()).toEqual(["This set isn't in your workout any more."]);
    expect(fakePublicApi.count(READ)).toBeGreaterThan(reads);
    // The row went with the read: the set not logged is now the second.
    expect(screen.getByTestId("log-set-button-2")).toBeTruthy();
    expect(pathname).toBe(EXERCISE);
  });

  it("says a set no longer logged takes no note, and reads the session again", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    const reads = fakePublicApi.count(READ);
    fakePublicApi.failNext(SAVE, { code: "set_not_logged", status: 409 });

    await save(1);

    expect(alerts()).toEqual(["Log this set before adding a note."]);
    expect(fakePublicApi.count(READ)).toBeGreaterThan(reads);
    expect(screen.queryByTestId("set-note-1-field")).toBeNull();
  });

  it("doesn't swipe while its note is written", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    expect(screen.getByTestId("set-row-1-open")).toBeTruthy();

    await pickFromMenu(1, "Add Note");

    expect(screen.queryByTestId("set-row-1-open")).toBeNull();
    expect(
      screen.getByTestId("set-number-1").props.accessibilityActions
    ).toBeUndefined();
  });

  it("shows nothing and sends nothing for an answer after another User signed in", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    const resume = fakePublicApi.pause(SAVE);
    await fireEvent.press(screen.getByTestId("set-note-1-save"));

    signInAs("user_someone_else");
    resume();
    await settle(queryClient);

    expect(screen.queryByText("Grip faded")).toBeNull();
    expect(sentAnalytics.events()).toEqual([]);
  });

  it("asks before the User leaves with unsaved text", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");

    await go(() => router.back());

    expect(pathname).toBe(EXERCISE);
    expect(alerts()).toEqual(["Discard your note?"]);
  });

  it("moves on without asking when the session finishes elsewhere", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");

    Object.assign(backend.sessions[0], {
      finished_at: "2026-10-08T11:00:00.000Z",
    });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
    });
    await settle(queryClient);

    expect(pathname).toBe("/workout-sessions/s1/summary");
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(SAVE)).toBe(0);
    // The Workout Summary shows no note.
    expect(screen.queryByText(FELT_EASY)).toBeNull();
  });

  it("shows a finished session's note, with no menu to edit it", async () => {
    Object.assign(backend.sessions[0], {
      finished_at: "2026-10-08T11:00:00.000Z",
    });
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByText(FELT_EASY)).toBeTruthy();
    expect(screen.queryByTestId("set-menu-2")).toBeNull();
  });
});

describe("a set's note on the Workout Session's Exercise cards", () => {
  it("shows the note in two lines and adds one from the row", async () => {
    await open(WORKOUT, SESSION);

    expect(screen.getByText(FELT_EASY).props.numberOfLines).toBe(2);

    await pickFromMenu(1, "Add Note");
    await typeNote(1, "Grip faded");
    await save(1);

    expect(noteOf("s1-e1-s1")).toBe("Grip faded");
    expect(screen.getByText("Grip faded")).toBeTruthy();
    expect(screen.queryByText("Resting")).toBeNull();
  });
});

describe("in Ukrainian", () => {
  it("names the menu, its items and the editor in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByLabelText("Більше дій для підходу 1")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("set-menu-2"));
    expect(
      screen.getByRole("menuitem", { name: "Редагувати підхід" })
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("menuitem", { name: "Редагувати нотатку" })
    );
    expect(screen.getByLabelText("Нотатка до підходу 2")).toBeTruthy();
    await typeNote(2, "Важко");
    await save(2);

    expect(noteOf("s1-e1-s2")).toBe("Важко");
    expect(screen.getByLabelText("Нотатка до підходу 2: Важко")).toBeTruthy();
  });

  it("shows and writes a note on the Workout Session's cards", async () => {
    setDeviceLanguages(["uk-UA"]);
    await open(WORKOUT, SESSION);

    expect(
      screen.getByLabelText(`Нотатка до підходу 2: ${FELT_EASY}`)
    ).toBeTruthy();

    await pickFromMenu(1, "Додати нотатку");
    expect(screen.getByPlaceholderText("Як пройшов цей підхід?")).toBeTruthy();
    await typeNote(1, "Важко");
    await save(1);

    expect(noteOf("s1-e1-s1")).toBe("Важко");
  });
});
