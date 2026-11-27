/**
 * The Equipment filter in the Workout Session's Exercise picker (FIT-607):
 * the picker gets the same Equipment pill, sheet and chips as the Library tab
 * (FIT-604, FIT-605), and its choice is its own — a fresh, empty one every
 * opening, Replace included, never the Library tab's.
 *
 * Mounts the real picker Screen with the route params the Workout Session
 * Screen pushes (`workout-session-exercises.test.tsx` covers that push) on
 * the fake Public API's Exercise routes, with both choice sheets mounted over it once pushed
 * (`test-utils/router-stub.tsx`); the SwiftUI-backed primitives are swapped
 * for plain stand-ins. Closing the picker is unmounting it, as popping its
 * route does.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import EquipmentSheet from "~/app/equipment";
import MusclesSheet from "~/app/muscles";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import {
  getEquipmentChoice,
  setEquipmentChoice,
} from "~/hooks/equipment-choice";
import { getMuscleChoice } from "~/hooks/muscle-choice";
import { storage } from "~/lib/mmkv";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import {
  PushedRoutes,
  pushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = { current: {} };

// The real Clerk SDK (reached through the picker's writes) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useRouter: () => stub.stubRouter,
  };
});

// Moving on when the session ends elsewhere needs the real navigator, which
// `__tests__/ended-workout-session-exercise.test.tsx` mounts.
jest.mock("~/hooks/ended-workout-session", () => ({
  useEndedWorkoutSession: () => undefined,
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

let client: QueryClient;

const LIST_ROUTE = "GET /v1/exercises";

/** The query of every page of the Library asked for, in order (lookups aside). */
const listQueries = () =>
  fakePublicApi.requests
    .filter(
      (request) =>
        request.route === LIST_ROUTE && request.query.slugs === undefined
    )
    .map((request) => request.query);

const SESSION_ID = "s1";

/**
 * Opens the picker: adding an Exercise, or, given `replaceExerciseId` and the
 * replaced Exercise's `muscleGroup`, replacing one. Answers its `unmount`,
 * which is the User closing it.
 */
const openPicker = async (
  params: { muscleGroup?: string; replaceExerciseId?: string } = {}
) => {
  mockParams.current = { ...params, workoutSessionId: SESSION_ID };
  client = createTestQueryClient();

  const { unmount } = await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ExercisePickerScreen />
        <PushedRoutes
          screens={{ "/equipment": EquipmentSheet, "/muscles": MusclesSheet }}
        />
      </InAppLanguage>
    </QueryClientProvider>
  );

  await settle(client);

  return unmount;
};

const openSheet = async (pill: string) => {
  await fireEvent.press(screen.getByRole("button", { name: pill }));
  await settle(client);
};

const sheetOpen = (pathname: string) =>
  pushedRoutes().some((route) => route.pathname === pathname);

const tick = async (name: string) => {
  await fireEvent.press(screen.getByRole("checkbox", { name }));
};

const confirm = async () => {
  await fireEvent.press(screen.getByLabelText("Done"));
  await settle(client);
};

const isChecked = (name: string) =>
  screen.getByRole("checkbox", { name }).props.accessibilityState?.checked;

/** The Exercises on screen, in the order the fake Public API answers them. */
const shownExercises = () =>
  ["Barbell Squat", "Dumbbell Lunge", "Push Up"].filter(
    (name) => screen.queryByText(name) !== null
  );

/** Each chip's "Remove <value>" label, in the row's order. */
const chips = () =>
  screen
    .getAllByRole("button")
    .map((chip) => chip.props.accessibilityLabel as string | undefined)
    .filter((label) => label?.startsWith("Remove ") === true);

beforeEach(() => {
  storage.clearAll();
  resetStubRouter();
  serveExercises([
    fakeExercise("barbell-squat", {
      name: "Barbell Squat",
      equipment: ["barbell"],
      muscle_groups: ["quadriceps"],
    }),
    fakeExercise("dumbbell-lunge", {
      name: "Dumbbell Lunge",
      equipment: ["dumbbell"],
      muscle_groups: ["quadriceps"],
    }),
    fakeExercise("push-up", {
      name: "Push Up",
      equipment: ["bodyweight"],
      muscle_groups: ["chest"],
    }),
  ]);
});

describe("the Equipment filter in the Exercise picker", () => {
  it("narrows the pickable Exercises by any ticked Equipment", async () => {
    await openPicker();

    expect(shownExercises()).toEqual([
      "Barbell Squat",
      "Dumbbell Lunge",
      "Push Up",
    ]);

    await openSheet("Equipment");

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({ pathname: "/equipment" }),
    ]);
    expect(screen.getByRole("header", { name: "Equipment" })).toBeTruthy();

    await tick("Dumbbell");
    await tick("Bodyweight");
    await confirm();

    expect(sheetOpen("/equipment")).toBe(false);
    expect(listQueries().at(-1)).toEqual({
      equipment: "bodyweight,dumbbell",
      limit: "20",
      offset: "0",
    });
    // Each is still picked by its whole row, which adds it.
    expect(shownExercises()).toEqual(["Dumbbell Lunge", "Push Up"]);
    expect(
      screen.getByRole("button", { name: "Add Dumbbell Lunge" })
    ).toBeTruthy();
    // The pill still just reads "Equipment", whatever is chosen.
    expect(screen.getByRole("button", { name: "Equipment" })).toBeTruthy();
    expect(chips()).toEqual(["Remove Bodyweight", "Remove Dumbbell"]);
  });

  it("starts Replace on the replaced Exercise's Muscle group and no Equipment", async () => {
    await openPicker({
      muscleGroup: "quadriceps",
      replaceExerciseId: "s1-e1",
    });

    expect(
      screen.getByRole("header", { name: "Replace Exercise" })
    ).toBeTruthy();
    // The Muscle group is pre-chosen; no Equipment is.
    expect(chips()).toEqual(["Remove Quadriceps"]);
    expect(listQueries().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    expect(shownExercises()).toEqual(["Barbell Squat", "Dumbbell Lunge"]);

    await openSheet("Equipment");

    expect(
      screen
        .getAllByRole("checkbox")
        .every((row) => row.props.accessibilityState?.checked === false)
    ).toBe(true);
  });

  it("narrows together with the Muscle group choice, its chips after them", async () => {
    await openPicker({
      muscleGroup: "quadriceps",
      replaceExerciseId: "s1-e1",
    });

    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();

    expect(listQueries().at(-1)).toEqual({
      equipment: "dumbbell",
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    // Both filters apply: the only dumbbell Exercise working the quadriceps.
    expect(shownExercises()).toEqual(["Dumbbell Lunge"]);
    // The Equipment chip comes after the Muscle group one.
    expect(chips()).toEqual(["Remove Quadriceps", "Remove Dumbbell"]);
    expect(
      screen.getByRole("button", { name: "Replace with Dumbbell Lunge" })
    ).toBeTruthy();
  });

  it("starts empty again every time it opens", async () => {
    const close = await openPicker();
    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();
    expect(shownExercises()).toEqual(["Dumbbell Lunge"]);

    // The User closes the picker and opens it again.
    await act(() => close());
    resetStubRouter();
    await openPicker();

    expect(chips()).toEqual([]);
    expect(listQueries().at(-1)).toEqual({ limit: "20", offset: "0" });
    expect(shownExercises()).toEqual([
      "Barbell Squat",
      "Dumbbell Lunge",
      "Push Up",
    ]);

    await openSheet("Equipment");
    expect(isChecked("Dumbbell")).toBe(false);
  });

  it("keeps the Library tab's Equipment choice to itself", async () => {
    // The Library tab's own choice, kept while the app runs.
    setEquipmentChoice("library", ["dumbbell"]);
    await openPicker();

    // The picker starts on none of it.
    expect(chips()).toEqual([]);
    expect(listQueries().at(-1)).toEqual({ limit: "20", offset: "0" });

    await openSheet("Equipment");
    expect(isChecked("Dumbbell")).toBe(false);
    await tick("Barbell");
    await confirm();

    expect(shownExercises()).toEqual(["Barbell Squat"]);
    // Choosing in the picker leaves the Library tab's choice alone.
    expect(getEquipmentChoice("library")).toEqual(["dumbbell"]);
    expect(getMuscleChoice("library")).toEqual([]);
  });

  it("clears the Equipment choice with Show All Exercises", async () => {
    await openPicker();
    await openSheet("Equipment");
    // No seeded Exercise needs a cable.
    await tick("Cable");
    await confirm();

    expect(shownExercises()).toEqual([]);
    expect(chips()).toEqual(["Remove Cable"]);

    await fireEvent.press(
      screen.getByRole("button", { name: "Show All Exercises" })
    );
    await settle(client);

    // Clearing it goes back to the unfiltered search, which is still cached.
    expect(chips()).toEqual([]);
    expect(shownExercises()).toEqual([
      "Barbell Squat",
      "Dumbbell Lunge",
      "Push Up",
    ]);
  });

  it("removes one Equipment from its chip, with no sheet", async () => {
    await openPicker();
    await openSheet("Equipment");
    await tick("Dumbbell");
    await tick("Bodyweight");
    await confirm();

    await fireEvent.press(
      screen.getByRole("button", { name: "Remove Dumbbell" })
    );
    await settle(client);

    expect(sheetOpen("/equipment")).toBe(false);
    expect(chips()).toEqual(["Remove Bodyweight"]);
    expect(shownExercises()).toEqual(["Push Up"]);
  });
});
