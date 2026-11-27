/**
 * The User's Exercise note on the Workout Session Exercise screen (FIT-836,
 * Figma's A1–A8 frames, FIT-820): the same note as on the Library's
 * Exercise detail screen, read and saved through the fake Public API's note
 * routes, whose rows each save is checked against, in English and Ukrainian.
 * Mounts the real screens on the real expo-router, so leaving with unsaved
 * text and the session moving on by itself run through the real leave
 * guard. The editor's own states (the limit, a failed save, a 429's wait, an
 * answer after another User signed in) are the Exercise detail screen's,
 * covered by `exercise-note-detail.test.tsx`.
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

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import PlanWorkoutSessionRoute from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/index";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { setNotesEnabled } from "~/lib/feature-flags";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { renderRouter } from "~/test-utils/render-router";

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

jest.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null,
}));

const NOTES = "GET /v1/exercise-notes";
const SAVE = "PUT /v1/exercise-notes/{slug}";

const WORKOUT = "/plans/plan-1/workouts/workout-1";
const SESSION = `${WORKOUT}/sessions/s1` as const;
const EXERCISE = `${SESSION}/exercises/s1-e1` as const;
const SUMMARY = "/workout-sessions/s1/summary";

const SESSION_KEY = ["workout-session", { sessionId: "s1" }];

const SETUP = "Seat on hole 4.\nFeet high.";

// Each test mounts whole screens and steps through many requests.
jest.setTimeout(60_000);

let queryClient: QueryClient;
let pathname: string;

const TabsStub = () => <Slot />;

const HomeStub = () => <Text>Home</Text>;

const GuideStub = () => <Text>Guide</Text>;

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
      "exercises/[exerciseSlug]/guide": GuideStub,
      "exercises/[exerciseSlug]/index": ExerciseScreen,
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

/** Reads the Workout Session again, as a poll or a return would. */
const readSessionAgain = async () => {
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  });
  await settle(queryClient);
};

const typeNote = async (text: string) => {
  await fireEvent.changeText(screen.getByTestId("exercise-note-field"), text);
};

const save = async () => {
  await fireEvent.press(screen.getByTestId("exercise-note-save"));
  await settle(queryClient);
};

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
    fakeExercise("leg-press", { name: "Leg Press" }),
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
    exercises: [{ name: "Squat", sets: [8, null], slug: "squat" }],
    id: "s1",
    workoutId: "workout-1",
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the notes flag", () => {
  it("off, shows no note and asks for none", async () => {
    setNotesEnabled(false);
    backend.seedExerciseNote("squat", SETUP);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByTestId("log-set-button-2")).toBeTruthy();
    expect(screen.queryByTestId("exercise-note")).toBeNull();
    expect(fakePublicApi.count(NOTES)).toBe(0);
  });
});

describe("the Exercise note on the Workout Session Exercise screen", () => {
  it("offers only Add Note without a note, and writes one", async () => {
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByTestId("exercise-note-add")).toBeTruthy();
    expect(screen.queryByText("Note")).toBeNull();

    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(SETUP);
    await save();

    expect(backend.exerciseNote("squat")).toBe(SETUP);
    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByText(SETUP)).toBeTruthy();
  });

  it("shows the note saved, edits it and clears it with blank text", async () => {
    backend.seedExerciseNote("squat", SETUP);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByText(SETUP)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("Seat on hole 5.");
    await save();
    expect(backend.exerciseNote("squat")).toBe("Seat on hole 5.");

    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("   ");
    await save();
    expect(backend.exerciseNote("squat")).toBeUndefined();
    expect(screen.getByTestId("exercise-note-add")).toBeTruthy();
  });

  it("shows a note saved here on the Library's Exercise screen without another read", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(SETUP);
    await save();
    // Opening it refreshes the list in the background: the note shows
    // without it, so a refresh that fails changes nothing.
    fakePublicApi.failNext(NOTES, "network");

    await go(() => router.push("/exercises/squat"));

    expect(pathname).toBe("/exercises/squat");
    expect(screen.getByText(SETUP)).toBeTruthy();
  });

  it("shows a note saved on the Library's Exercise screen when coming back, without another read", async () => {
    await open(WORKOUT, SESSION, EXERCISE, "/exercises/squat");
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(SETUP);
    await save();
    const reads = fakePublicApi.count(NOTES);

    await go(() => router.back());

    expect(pathname).toBe(EXERCISE);
    expect(screen.getByText(SETUP)).toBeTruthy();
    expect(fakePublicApi.count(NOTES)).toBe(reads);
  });

  it("shows the new Exercise's note once it's replaced", async () => {
    backend.seedExerciseNote("squat", SETUP);
    backend.seedExerciseNote("leg-press", "Feet low.");
    await open(WORKOUT, SESSION, EXERCISE);
    expect(screen.getByText(SETUP)).toBeTruthy();

    Object.assign(backend.exercises[0], { exercise_slug: "leg-press" });
    await readSessionAgain();

    expect(screen.getByText("Feet low.")).toBeTruthy();
    expect(screen.queryByText(SETUP)).toBeNull();
  });

  it("shows and clears the note of an Exercise the Library can't resolve by its stored slug", async () => {
    Object.assign(backend.exercises[0], { exercise_slug: "old-hack-squat" });
    backend.seedExerciseNote("old-hack-squat", SETUP);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByText(SETUP)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("");
    await save();

    expect(backend.exerciseNote("old-hack-squat")).toBeUndefined();
  });

  it("keeps logging sets while the notes can't be read", async () => {
    fakePublicApi.failNext(NOTES, { status: 500 });
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByTestId("exercise-note-load-error")).toBeTruthy();
    expect(screen.queryByTestId("exercise-note-add")).toBeNull();

    await fireEvent.press(screen.getByTestId("log-set-button-2"));
    await settle(queryClient);

    expect(backend.sets[1].reps_completed).not.toBeNull();
  });

  it("asks before the User leaves with unsaved text", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(SETUP);

    await go(() => router.back());

    expect(pathname).toBe(EXERCISE);
    expect(alerts()).toEqual(["Discard your note?"]);
  });

  it("moves on without asking when the session finishes elsewhere, losing the text", async () => {
    await open(WORKOUT, SESSION, EXERCISE);
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(SETUP);

    Object.assign(backend.sessions[0], {
      finished_at: "2026-10-08T11:00:00.000Z",
    });
    await readSessionAgain();

    expect(pathname).toBe(SUMMARY);
    expect(alerts()).toEqual([]);
    expect(fakePublicApi.count(SAVE)).toBe(0);
    expect(backend.exerciseNote("squat")).toBeUndefined();
  });

  it("isn't on the Workout screen or the Workout Session's Exercise cards", async () => {
    backend.seedExerciseNote("squat", SETUP);
    await open(WORKOUT);
    expect(screen.queryByTestId("exercise-note")).toBeNull();

    await go(() => router.push(SESSION));
    expect(pathname).toBe(SESSION);
    expect(screen.queryByTestId("exercise-note")).toBeNull();
    expect(screen.queryByText(SETUP)).toBeNull();
  });
});

describe("in Ukrainian", () => {
  it("shows the label, the note and Add Note in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    backend.seedExerciseNote("squat", SETUP);
    await open(WORKOUT, SESSION, EXERCISE);

    expect(screen.getByText(SETUP)).toBeTruthy();
    expect(
      screen.getByLabelText(`Нотатка до вправи Присідання: ${SETUP}`)
    ).toBeTruthy();
  });
});
