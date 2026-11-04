/**
 * The Workout editor and the builder's Library picker, on the mounted-screen
 * seam: the real Plan editor, Workout editor, picker, Muscles sheet, draft,
 * hooks and Public API client, with the client's `fetch` swapped for the fake
 * Public API and the Library swapped for the in-memory fake, so what the Plan
 * editor's one Save writes is read back off the fake's rows. Each pushed
 * route is mounted over the one below it (`test-utils/router-stub.tsx`), so
 * every assertion is scoped with `within`.
 */
import {
  MAX_EXERCISES_PER_WORKOUT,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUTS_PER_PLAN,
} from "@fitme/core";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import MusclesSheet from "~/app/muscles";
import PlanExercisePickerScreen from "~/app/plans/[planId]/edit/exercise-picker";
import PlanEditorScreen from "~/app/plans/[planId]/edit/index";
import WorkoutEditorScreen from "~/app/plans/[planId]/edit/workouts/[workoutKey]";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { EXERCISE_SEARCH_PAGE_SIZE } from "~/hooks/queries/library";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  libraryExerciseNamed,
  type SeedPlan,
  slugOf,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import {
  PushedRoutes,
  pushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = {
  current: { planId: "plan-1" },
};

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    Link: ({ children }: { children: ReactNode }) => children,
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    // The guard blocks the swipe away, which Jest can't make; Cancel asks
    // through `Alert` either way.
    usePreventRemove: () => () => undefined,
    useRouter: () => ({ ...stub.stubRouter, canGoBack: () => true }),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView:
    jest.requireActual<typeof import("react-native")>("react-native")
      .ScrollView,
}));
// The real Clerk SDK opens a MessagePort at import, which keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/select", () =>
  jest.requireActual("~/test-utils/select-stub")
);
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

const EDITOR_ROUTES = {
  "/muscles": MusclesSheet,
  "/plans/[planId]/edit": PlanEditorScreen,
  "/plans/[planId]/edit/exercise-picker": PlanExercisePickerScreen,
  "/plans/[planId]/edit/workouts/[workoutKey]": WorkoutEditorScreen,
};

const PLAN: SeedPlan = {
  frequency: 3,
  id: "plan-1",
  is_active: true,
  name: "Full body",
  workouts: [
    {
      cover: "cover-1",
      exercises: [
        {
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 60,
            },
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 60,
            },
          ],
          slug: "barbell-back-squat",
        },
        { sets: 1, slug: "bench-press" },
      ],
      id: "workout-1",
      name: "Day A",
    },
    {
      exercises: [{ sets: 1, slug: "deadlift" }],
      id: "workout-2",
      name: "Day B",
    },
    {
      exercises: [{ sets: 1, slug: "pull-up" }],
      id: "workout-3",
      name: "Day C",
    },
  ],
};

const LIBRARY = [
  libraryExerciseNamed("Barbell back squat"),
  libraryExerciseNamed("Bench press"),
  libraryExerciseNamed("Deadlift"),
  libraryExerciseNamed("Pull up"),
  libraryExercise("overhead-press", {
    muscle_groups: ["shoulders"],
    name: "Overhead press",
  }),
];

let client: QueryClient;
let library: FakeLibrary;

/** The Plan editor, with every route it pushes mounted over it. */
const openEditor = async (language = "en-US") => {
  client = createTestQueryClient();
  setDeviceLanguages([language]);
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <PlanEditorScreen />
        <PushedRoutes screens={EDITOR_ROUTES} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

/** The Workout screen, with the Plan editor mounted once it pushes it. */
const openWorkoutScreen = async () => {
  client = createTestQueryClient();
  mockParams.current = { planId: "plan-1", workoutId: "workout-1" };
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <WorkoutScreen />
        <PushedRoutes screens={EDITOR_ROUTES} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

/** Presses a control by its spoken label: a header item, or a menu's item. */
const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await settle(client);
};

const pressButton = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
  await settle(client);
};

/** Opens a Workout's editor from the Plan editor's row. */
const openWorkout = async (name: string, label = "Edit") => {
  await press(`${label} ${name}`);
};

/** The Workout editor's subtree, the only place its fields are looked for. */
const editor = () => within(screen.getByTestId("workout-editor"));

/** One Exercise card of the Workout editor, by its 1-based place. */
const card = (index = 1) =>
  within(editor().getByTestId(`draft-exercise-${index}`));

const type = async (testID: string, text: string) => {
  await act(() => {
    fireEvent.changeText(editor().getByTestId(testID), text);
  });
  await settle(client);
};

/** Types into one of the first Exercise's set fields. */
const typeSet = async (testID: string, text: string, exercise = 1) => {
  await act(() => {
    fireEvent.changeText(card(exercise).getByTestId(testID), text);
  });
  await settle(client);
};

/** Presses a `Button` inside one Exercise's card. */
const pressInCard = async (name: string, exercise = 1) => {
  await fireEvent.press(card(exercise).getByRole("button", { name }));
  await settle(client);
};

const save = async (label = "Save") => {
  await press(label);
};

/** Picks an Exercise in whichever picker is open. */
const pick = async (label: string) => {
  await press(label);
};

/** Runs an action from an Exercise's menu in the Workout editor. */
const exerciseAction = async (exercise: string, action: string) => {
  await press(`Actions for ${exercise}`);
  await press(action);
};

const savedPlan = () => backend.plans[0];
const savedWorkout = (index: number) => savedPlan().workouts[index];
const savedExercises = (index: number) =>
  savedWorkout(index).exercises.map((exercise) => exercise.slug);
/** A saved Workout Exercise's sets, which a save writes as rows. */
const savedSets = (workout: number, exercise: number) => {
  const { sets } = savedWorkout(workout).exercises[exercise];
  return typeof sets === "number" ? [] : sets;
};

const alerts = () => (Alert.alert as jest.Mock).mock.calls;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedPlan(structuredClone(PLAN));
  library = serveLibrary(LIBRARY);
  resetStubRouter();
  setDeviceLanguages(["en-US"]);
  mockParams.current = { planId: "plan-1" };
});

describe("opening a Workout", () => {
  it("opens the Workout's editor from the Plan editor's row", async () => {
    await openEditor();

    await openWorkout("Day A");

    expect(pushedRoutes().at(-1)?.pathname).toBe(
      "/plans/[planId]/edit/workouts/[workoutKey]"
    );
    const workout = editor();
    expect(workout.getByTestId("workout-name").props.value).toBe("Day A");
    expect(workout.getByText("Barbell back squat")).toBeTruthy();
    expect(workout.getByText("Bench press")).toBeTruthy();
    // Its first Exercise's two sets, in the Plan's unit.
    expect(card().getByTestId("draft-set-reps-1").props.value).toBe("8");
    expect(card().getByTestId("draft-set-weight-2").props.value).toBe("60");
    expect(card().getByTestId("draft-set-rest-1").props.value).toBe("120");
  });

  it("names an Exercise the Library doesn't know after its slug", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [
        {
          exercises: [{ sets: 1, slug: "sled-push" }],
          id: "workout-1",
          name: "Day A",
        },
      ],
    });
    await openEditor();

    await openWorkout("Day A");

    expect(editor().getByText("Sled push")).toBeTruthy();
  });
});

describe("renaming a Workout", () => {
  it("saves the new name, keeping the Workout's id", async () => {
    await openEditor();
    await openWorkout("Day A");

    await type("workout-name", "Push");
    await save();

    expect(savedWorkout(0).name).toBe("Push");
    expect(savedWorkout(0).id).toBe("workout-1");
  });

  it("disables Save while the Workout has no name", async () => {
    await openEditor();
    await openWorkout("Day A");

    await type("workout-name", "   ");

    expect(editor().getByText("Enter a workout name")).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();
  });
});

describe("the Exercises of a Workout", () => {
  it("adds one picked from the Library at 3 sets of 10 reps, no weight and 90 s rest", async () => {
    await openEditor();
    await openWorkout("Day A");

    await pressButton("Add Exercise");
    await pick("Add Overhead press");

    const workout = editor();
    expect(workout.getByText("Overhead press")).toBeTruthy();
    expect(pushedRoutes().at(-1)?.pathname).toBe(
      "/plans/[planId]/edit/workouts/[workoutKey]"
    );

    await save();

    expect(savedExercises(0)).toEqual([
      "barbell-back-squat",
      "bench-press",
      "overhead-press",
    ]);
    expect(savedSets(0, 2)).toEqual([
      expect.objectContaining({
        reps_recommended: 10,
        rest_recommended: 90,
        weight_recommended: 0,
      }),
      expect.objectContaining({ reps_recommended: 10 }),
      expect.objectContaining({ reps_recommended: 10 }),
    ]);
  });

  it("replaces one in place, keeping its id and its set rows", async () => {
    await openEditor();
    await openWorkout("Day A");

    await exerciseAction("Barbell back squat", "Replace Barbell back squat");
    expect(
      screen.getByRole("header", { name: "Replace Exercise" })
    ).toBeTruthy();
    await pick("Replace with Overhead press");

    await save();

    expect(savedExercises(0)).toEqual(["overhead-press", "bench-press"]);
    expect(savedWorkout(0).exercises[0].id).toBe("workout-1-e1");
    expect(savedSets(0, 0)).toEqual([
      expect.objectContaining({
        id: "workout-1-e1-s1",
        reps_recommended: 8,
        weight_recommended: 60,
      }),
      expect.objectContaining({ id: "workout-1-e1-s2" }),
    ]);
  });

  it("removes one, its sets with it", async () => {
    await openEditor();
    await openWorkout("Day A");

    await exerciseAction("Bench press", "Remove Bench press");
    await save();

    expect(savedExercises(0)).toEqual(["barbell-back-squat"]);
  });

  it("reorders them", async () => {
    await openEditor();
    await openWorkout("Day A");

    await exerciseAction("Bench press", "Move Bench press up");
    await save();

    expect(savedExercises(0)).toEqual(["bench-press", "barbell-back-squat"]);
    expect(savedWorkout(0).exercises[0].id).toBe("workout-1-e2");
  });

  it("disables Save while a Workout has no Exercise", async () => {
    await openEditor();
    await openWorkout("Day A");

    await exerciseAction("Barbell back squat", "Remove Barbell back squat");
    await exerciseAction("Bench press", "Remove Bench press");

    expect(editor().getByText("Add an exercise to this workout.")).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();
  });
});

describe("the sets of an Exercise", () => {
  it("saves edited reps, weight and rest", async () => {
    await openEditor();
    await openWorkout("Day A");

    await typeSet("draft-set-reps-1", "12");
    await typeSet("draft-set-weight-1", "62,5");
    await typeSet("draft-set-rest-1", "60");
    await save();

    expect(savedSets(0, 0)[0]).toEqual(
      expect.objectContaining({
        reps_recommended: 12,
        rest_recommended: 60,
        weight_recommended: 62.5,
      })
    );
  });

  it("adds a set that copies the one before it", async () => {
    await openEditor();
    await openWorkout("Day A");

    await typeSet("draft-set-reps-2", "5");
    await pressInCard("Add Set");

    expect(card().getByTestId("draft-set-reps-3").props.value).toBe("5");

    await save();

    expect(savedSets(0, 0)).toHaveLength(3);
    expect(savedSets(0, 0)[2]).toEqual(
      expect.objectContaining({
        reps_recommended: 5,
        rest_recommended: 120,
        weight_recommended: 60,
      })
    );
  });

  it("removes a set", async () => {
    await openEditor();
    await openWorkout("Day A");

    await fireEvent.press(card().getByLabelText("Remove set 2"));
    await settle(client);
    await save();

    expect(savedSets(0, 0)).toHaveLength(1);
    expect(savedSets(0, 0)[0].id).toBe("workout-1-e1-s1");
  });

  it("disables Save for a target out of bounds, saying what's allowed", async () => {
    await openEditor();
    await openWorkout("Day A");

    await typeSet("draft-set-reps-1", "0");

    expect(
      card().getByText("Reps must be a whole number from 1 to 1000")
    ).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();

    await typeSet("draft-set-reps-1", "10");

    expect(screen.getByLabelText("Save")).not.toBeDisabled();
  });

  it("disables Save for a weight with too many decimals", async () => {
    await openEditor();
    await openWorkout("Day A");

    await typeSet("draft-set-weight-1", "60,555");

    expect(screen.getByLabelText("Save")).toBeDisabled();
  });
});

describe("the limits", () => {
  const seedWorkouts = (count: number) =>
    Array.from({ length: count }, (_workout, index) => ({
      exercises: [{ sets: 1, slug: "bench-press" }],
      id: `workout-${index + 1}`,
      name: `Day ${index + 1}`,
    }));

  it("disables Add Set once the Exercise is at its maximum", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [
        {
          exercises: [{ sets: MAX_SETS_PER_EXERCISE, slug: "bench-press" }],
          id: "workout-1",
          name: "Day A",
        },
      ],
    });
    await openEditor();
    await openWorkout("Day A");

    expect(card().getByRole("button", { name: "Add Set" })).toBeDisabled();
  });

  it("disables Add Exercise once the Workout is at its maximum", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [
        {
          exercises: Array.from({ length: MAX_EXERCISES_PER_WORKOUT }, () => ({
            sets: 1,
            slug: "bench-press",
          })),
          id: "workout-1",
          name: "Day A",
        },
      ],
    });
    await openEditor();
    await openWorkout("Day A");

    expect(screen.getByRole("button", { name: "Add Exercise" })).toBeDisabled();
  });

  it("disables Add Workout once the Plan is at its maximum", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: seedWorkouts(MAX_WORKOUTS_PER_PLAN),
    });
    await openEditor();

    expect(screen.getByRole("button", { name: "Add Workout" })).toBeDisabled();
  });
});

describe("adding a Workout", () => {
  it("adds the next lettered Workout, opens it and saves it with an Exercise", async () => {
    await openEditor();

    await pressButton("Add Workout");

    expect(editor().getByTestId("workout-name").props.value).toBe("Workout D");

    await pressButton("Add Exercise");
    await pick("Add Overhead press");
    await save();

    expect(savedPlan().workouts.map((workout) => workout.name)).toEqual([
      "Day A",
      "Day B",
      "Day C",
      "Workout D",
    ]);
    expect(savedWorkout(3).id).not.toBe("");
    expect(savedExercises(3)).toEqual(["overhead-press"]);
    // Only a new Workout takes a Cover; a kept one keeps its own.
    expect(savedWorkout(0).cover).toBe("cover-1");
  });

  it("skips a letter a Workout already uses", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [
        {
          exercises: [{ sets: 1, slug: "bench-press" }],
          id: "workout-1",
          name: "Workout A",
        },
      ],
    });
    await openEditor();

    await pressButton("Add Workout");

    expect(editor().getByTestId("workout-name").props.value).toBe("Workout B");
  });
});

describe("Edit Workout on the Workout screen", () => {
  it("opens the Plan editor with that Workout's editor pushed", async () => {
    await openWorkoutScreen();

    await press("Edit Workout");

    expect(pushedRoutes().map((route) => route.pathname)).toEqual([
      "/plans/[planId]/edit",
      "/plans/[planId]/edit/workouts/[workoutKey]",
    ]);
    expect(editor().getByTestId("workout-name").props.value).toBe("Day A");
  });
});

describe("a failed save", () => {
  it("says the Library doesn't know an Exercise, keeping the draft", async () => {
    backend.reset();
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [
        {
          exercises: [{ sets: 1, slug: "sled-push" }],
          id: "workout-1",
          name: "Day A",
        },
      ],
    });
    await openEditor();
    await openWorkout("Day A");
    await type("workout-name", "Push");

    await save();

    expect(
      screen.getByText(
        "This plan has exercises we don't know, so it can't be saved. Replace them and try again."
      )
    ).toBeTruthy();
    expect(editor().getByTestId("workout-name").props.value).toBe("Push");
    expect(savedWorkout(0).name).toBe("Day A");
  });

  it("asks to try again while the Library is unavailable, keeping the draft", async () => {
    await openEditor();
    await openWorkout("Day A");
    await type("workout-name", "Push");
    library.failWith(new LibraryUnavailableError());

    await save();

    expect(
      screen.getByText("Couldn't check this plan's exercises. Try again.")
    ).toBeTruthy();
    expect(editor().getByTestId("workout-name").props.value).toBe("Push");
    expect(savedWorkout(0).name).toBe("Day A");
  });
});

describe("the picker", () => {
  /** Types in the picker's header search bar and waits past the debounce. */
  const search = async (text: string, shown: string, hidden: string) => {
    await fireEvent.changeText(screen.getByTestId("header-search-bar"), text);
    await until(
      () =>
        !!screen.queryByLabelText(shown) &&
        screen.queryByLabelText(hidden) === null
    );
    await settle(client);
  };

  it("searches the Library as the Library tab does", async () => {
    await openEditor();
    await openWorkout("Day A");
    await pressButton("Add Exercise");

    await search("overhead", "Add Overhead press", "Add Bench press");

    expect(screen.getByLabelText("Add Overhead press")).toBeTruthy();
    expect(screen.queryByLabelText("Add Bench press")).toBeNull();
  });

  it("filters by Muscle group through the Muscles sheet", async () => {
    await openEditor();
    await openWorkout("Day A");
    await pressButton("Add Exercise");

    await pressButton("Muscles");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Shoulders" }));
    await press("Done");

    expect(screen.getByLabelText("Add Overhead press")).toBeTruthy();
    expect(screen.queryByLabelText("Add Bench press")).toBeNull();
  });

  it("asks the Library for the next page as the User nears the end", async () => {
    library = serveLibrary(
      Array.from({ length: 25 }, (_exercise, index) =>
        libraryExercise(`press-${String(index + 10)}`, {
          name: `Press ${String(index + 10)}`,
        })
      )
    );
    const list = jest.spyOn(library, "list");
    await openEditor();
    await openWorkout("Day A");
    await pressButton("Add Exercise");

    const offsets = () => list.mock.calls.map(([page]) => page?.offset);
    expect(offsets()).toEqual([0]);

    await act(() => {
      screen.getByTestId("exercises-list").props.onEndReached();
    });
    await until(() => offsets().includes(EXERCISE_SEARCH_PAGE_SIZE));
    await settle(client);

    expect(offsets()).toEqual([0, EXERCISE_SEARCH_PAGE_SIZE]);
  });
});

describe("in Ukrainian", () => {
  it("edits a Workout and its sets in the App language", async () => {
    await openEditor("uk-UA");

    await openWorkout("«Day A»", "Редагувати");

    const workout = editor();
    expect(workout.getByText("Вправи")).toBeTruthy();

    await typeSet("draft-set-reps-1", "0");

    expect(
      card().getByText("Повторень має бути цілим числом від 1 до 1000")
    ).toBeTruthy();
    expect(screen.getByLabelText("Зберегти")).toBeDisabled();

    await typeSet("draft-set-reps-1", "12");
    await pressButton("Додати вправу");
    await pick("Додати «Overhead press»");
    await save("Зберегти");

    expect(savedSets(0, 0)[0].reps_recommended).toBe(12);
    expect(savedExercises(0)).toEqual([
      "barbell-back-squat",
      "bench-press",
      slugOf("Overhead press"),
    ]);
  });
});

describe("the alerts", () => {
  it("asks before discarding a Workout's unsaved changes", async () => {
    await openEditor();
    await openWorkout("Day A");
    await type("workout-name", "Push");

    await press("Cancel");

    expect(alerts().at(-1)?.[0]).toBe("Discard changes?");
  });
});
