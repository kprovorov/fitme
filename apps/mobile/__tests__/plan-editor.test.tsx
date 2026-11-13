/**
 * The Plan editor, on the mounted-screen seam: the real Plan screen, editor,
 * draft, hooks and Public API client, with the client's `fetch` swapped for
 * the fake Public API (`test-utils/`), so what a save writes is read back off
 * its rows. The header is rendered as its title and its items as
 * buttons (a disabled one can't be pressed) and its menus' items, and
 * `Alert.alert` is answered by pressing one of its buttons, as the User would.
 */
import { MAX_FREQUENCY, MAX_PLAN_TEXT_LENGTH } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import type { AlertButton } from "react-native";

import PlanEditorScreen from "~/app/plans/[planId]/edit/index";
import PlanScreen from "~/app/plans/[planId]/index";
import { segmentClient } from "~/lib/segment";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  fakePublicApi,
  libraryExerciseNamed,
} from "~/test-utils/fake-public-api";
import type { SeedPlan } from "~/test-utils/fake-public-api";
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

const mockParams = { current: { planId: "plan-1" } };

const isEditorFocused = { current: true };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Link: ({ children }: { children: ReactNode }) => children,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    // The Plan editor is the Screen the test drives, so it is the focused
    // one unless a test says otherwise.
    useNavigation: () => ({ isFocused: () => isEditorFocused.current }),
    // The guard blocks the swipe away, which Jest can't make; the simulator
    // check covers it. Cancel asks through `Alert` either way.
    usePreventRemove: () => () => {},
    useRouter: () => ({ ...stub.stubRouter, canGoBack: () => true }),
  };
});

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

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);

jest.mock("~/components/ui/select", () =>
  jest.requireActual("~/test-utils/select-stub")
);

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

const SAVE = "PUT /v1/plans/{id}";

const PLAN: SeedPlan = {
  description: "Three full-body days",
  frequency: 3,
  id: "plan-1",
  is_active: true,
  name: "Full body",
  workouts: [
    {
      cover: "cover-1",
      exercises: [{ sets: 3, slug: "barbell-back-squat" }],
      id: "workout-1",
      name: "Day A",
    },
    {
      exercises: [{ sets: 2, slug: "bench-press" }],
      id: "workout-2",
      name: "Day B",
    },
    {
      exercises: [{ sets: 1, slug: "deadlift" }],
      id: "workout-3",
      name: "Day C",
    },
  ],
};

let client: QueryClient;

/** The editor on its own, as the Plan screen's menu opens it. */
const openEditor = async () => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <PlanEditorScreen />
    </QueryClientProvider>
  );
  await settle(client);
};

/** The Plan screen, with the editor mounted once its menu pushes it. */
const renderPlanScreen = async () => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <PlanScreen />
      <PushedRoutes screens={{ "/plans/[planId]/edit": PlanEditorScreen }} />
    </QueryClientProvider>
  );
  await settle(client);
};

/** The editor on its own, as a Plan's Edit Plan opens it. */
const renderEditor = async () => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <PlanEditorScreen />
    </QueryClientProvider>
  );
  await settle(client);
};

/** Presses a control by its spoken label: a header item, or a menu's item. */
const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
};

/** Presses a `Button` by the label it shows. */
const pressButton = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
};

/** Types `text` into the editor's field with that testID. */
const type = async (testID: string, text: string) => {
  await fireEvent.changeText(screen.getByTestId(testID), text);
};

const save = async () => {
  await press("Save");
  await settle(client);
};

/** Clears one of the optional details, through its Not set option. */
const clear = async (testID: string) => {
  await fireEvent.press(
    within(screen.getByTestId(testID)).getByLabelText("Not set")
  );
};

/** Removes a Workout through its row's menu, as the User would. */
const removeWorkout = async (name: string) => {
  await press(`Actions for ${name}`);
  await press(`Remove ${name}`);
};

const savedPlan = () => backend.plans[0];

/** A saved Workout Exercise's set ids, which a save writes as rows. */
const setIds = (workout: number, exercise: number) => {
  const { sets } = savedPlan().workouts[workout].exercises[exercise];

  return (typeof sets === "number" ? [] : sets).map((set) => set.id);
};

const workoutIds = () => savedPlan().workouts.map((workout) => workout.id);

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls as [string, string, AlertButton[]?][];

/** Presses `button` in the alert last shown. */
const pressAlertButton = async (button: string) => {
  const buttons = alerts().at(-1)?.[2] ?? [];
  const pressed = buttons.find((candidate) => candidate.text === button);

  if (!pressed?.onPress) {
    throw new Error(`No "${button}" button in the last alert`);
  }

  pressed.onPress();
  await settle(client);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  backend.reset();
  backend.seedPlan(structuredClone(PLAN));
  serveLibrary([
    libraryExerciseNamed("Barbell back squat"),
    libraryExerciseNamed("Bench press"),
    libraryExerciseNamed("Deadlift"),
  ]);
  resetStubRouter();
  mockParams.current = { planId: "plan-1" };
});

describe("opening the editor", () => {
  it("opens on the Plan from the Plan screen's menu", async () => {
    await renderPlanScreen();

    await press("Edit Plan");
    await settle(client);

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { planId: "plan-1" },
        pathname: "/plans/[planId]/edit",
      }),
    ]);
    const editor = within(screen.getByTestId("plan-editor"));
    expect(editor.getByTestId("plan-name").props.value).toBe("Full body");
    expect(editor.getByTestId("plan-frequency").props.value).toBe("3");
    expect(editor.getByTestId("plan-description").props.value).toBe(
      "Three full-body days"
    );
    expect(editor.getByText("Day A")).toBeTruthy();
    expect(editor.getByText("Day C")).toBeTruthy();
  });

  it("labels each field by the label it shows, for VoiceOver", async () => {
    await renderEditor();

    expect(screen.getByTestId("plan-name").props.accessibilityLabel).toBe(
      "Name"
    );
    expect(
      screen.getByTestId("plan-description").props.accessibilityLabel
    ).toBe("Description");
    expect(screen.getByTestId("plan-frequency").props.accessibilityLabel).toBe(
      "Workouts a week"
    );
    expect(screen.getByTestId("plan-duration").props.accessibilityLabel).toBe(
      "Workout duration, minutes"
    );
  });

  it("shows its load error with Try Again when the Plan can't be read", async () => {
    fakePublicApi.failNext("GET /v1/plans/{id}", { status: 500 });
    await openEditor();

    expect(
      screen.getByText(
        "Couldn't load this plan. Check your connection and try again."
      )
    ).toBeTruthy();

    await pressButton("Try Again");
    await settle(client);

    expect(screen.getByTestId("plan-editor")).toBeTruthy();
  });

  it("says a Plan that is gone no longer exists", async () => {
    mockParams.current = { planId: "plan-gone" };
    await openEditor();

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByTestId("plan-editor")).toBeNull();
  });
});

describe("saving", () => {
  it("sends the whole Plan back, keeping every id it loaded", async () => {
    await openEditor();
    await save();

    expect(workoutIds()).toEqual(["workout-1", "workout-2", "workout-3"]);
    expect(savedPlan().workouts[0].exercises[0].id).toBe("workout-1-e1");
    expect(setIds(0, 0)).toEqual([
      "workout-1-e1-s1",
      "workout-1-e1-s2",
      "workout-1-e1-s3",
    ]);
    // Only a new Workout takes a Cover, so a kept one keeps its own.
    expect(savedPlan().workouts[0].cover).toBe("cover-1");
    expect(savedPlan().name).toBe("Full body");
  });

  it("saves a new name, frequency and description", async () => {
    await openEditor();

    await type("plan-name", "Push pull legs");
    await type("plan-frequency", "4");
    await type("plan-description", "Six weeks");
    await save();

    expect(savedPlan().name).toBe("Push pull legs");
    expect(savedPlan().frequency).toBe(4);
    expect(savedPlan().description).toBe("Six weeks");
  });

  it("saves the details it was given", async () => {
    await openEditor();

    await press("Lose Weight");
    await press("Beginner");
    await press("Home");
    await type("plan-duration", "45");
    await save();

    expect(savedPlan().goal).toBe("fat-loss");
    expect(savedPlan().experience_level).toBe("beginner");
    expect(savedPlan().place).toBe("home");
    expect(savedPlan().workout_duration).toBe(45);
  });

  it("saves a detail the User cleared as unset (ADR 0017)", async () => {
    await openEditor();

    // Each choice offers Not set, so a detail set before can be cleared.
    await clear("plan-goal");
    await clear("plan-experience");
    await clear("plan-place");
    await type("plan-duration", "");
    // Save stays on: none of the four is required any more.
    expect(screen.getByLabelText("Save")).not.toBeDisabled();
    await save();

    expect(savedPlan().goal).toBeNull();
    expect(savedPlan().experience_level).toBeNull();
    expect(savedPlan().place).toBeNull();
    expect(savedPlan().workout_duration).toBeNull();
  });

  it("refuses a duration that isn't a whole number, rather than clearing it", async () => {
    await openEditor();

    await type("plan-duration", "45.5");

    expect(screen.getByLabelText("Save")).toBeDisabled();
    expect(
      screen.getByText(
        "Workout duration must be a whole number of minutes, at most 600"
      )
    ).toBeTruthy();
    await save();

    // Nothing is written, so the Plan keeps the duration it had.
    expect(fakePublicApi.count(SAVE)).toBe(0);
  });

  it("saves a reordered rotation, every Workout keeping its id", async () => {
    await openEditor();

    await press("Actions for Day C");
    await press("Move Day C up");
    await save();

    expect(savedPlan().workouts.map((workout) => workout.name)).toEqual([
      "Day A",
      "Day C",
      "Day B",
    ]);
    expect(workoutIds()).toEqual(["workout-1", "workout-3", "workout-2"]);
  });

  it("saves a Plan a Workout was removed from", async () => {
    await openEditor();

    await removeWorkout("Day B");
    await save();

    expect(workoutIds()).toEqual(["workout-1", "workout-3"]);
  });

  it("closes the editor and fires `Plan Edited` once it has saved", async () => {
    await renderPlanScreen();
    await press("Edit Plan");
    await settle(client);

    await type("plan-name", "Push pull legs");
    await save();

    expect(
      jest.mocked<
        (
          event: string,
          properties?: Record<string, string | number | boolean | null>
        ) => void
      >(segmentClient.track).mock.calls
    ).toEqual([["Plan Edited", { plan_id: "plan-1" }]]);
    expect(pushedRoutes()).toEqual([]);
  });

  it("shows the Plan's new name on the Plan screen with no restart", async () => {
    await renderPlanScreen();
    await press("Edit Plan");
    await settle(client);

    await type("plan-name", "Push pull legs");
    await save();

    expect(screen.getByRole("header", { name: "Push pull legs" })).toBeTruthy();
  });
});

describe("saving while the User keeps editing", () => {
  it("keeps what they typed, and asks about only that on the way out", async () => {
    await openEditor();
    await type("plan-name", "Push pull legs");

    const resume = fakePublicApi.pause(SAVE);
    await press("Save");
    await until(() => fakePublicApi.count(SAVE) === 1);
    // Only Save is disabled while the call is in flight.
    await type("plan-description", "Typed while saving");
    resume();
    await settle(client);

    // The editor stays open on what they typed, and the save still landed.
    expect(savedPlan().name).toBe("Push pull legs");
    expect(savedPlan().description).toBe("Three full-body days");
    expect(screen.getByTestId("plan-description").props.value).toBe(
      "Typed while saving"
    );

    // Leaving asks about the edit made since, not about the saved name.
    await press("Cancel");
    expect(alerts().at(-1)?.[0]).toBe("Discard changes?");
    await pressAlertButton("Discard");
    expect(pushedRoutes()).toEqual([]);
  });
});

describe("save is disabled", () => {
  const expectNothingSaved = async () => {
    await save();
    expect(fakePublicApi.count(SAVE)).toBe(0);
  };

  it("while the name is empty", async () => {
    await openEditor();
    await type("plan-name", "   ");

    expect(screen.getByLabelText("Save")).toBeDisabled();
    expect(screen.getByText("Enter a plan name")).toBeTruthy();
    await expectNothingSaved();
  });

  it("while the frequency is out of bounds", async () => {
    await openEditor();
    await type("plan-frequency", String(MAX_FREQUENCY + 1));

    expect(screen.getByLabelText("Save")).toBeDisabled();
    expect(
      screen.getByText(
        `Workouts a week must be a whole number from 1 to ${MAX_FREQUENCY}`
      )
    ).toBeTruthy();
    await expectNothingSaved();
  });

  it("while the description is past its length", async () => {
    await openEditor();
    await type("plan-description", "a".repeat(MAX_PLAN_TEXT_LENGTH + 1));

    expect(screen.getByLabelText("Save")).toBeDisabled();
    expect(
      screen.getByText(
        `Description must be at most ${MAX_PLAN_TEXT_LENGTH} characters`
      )
    ).toBeTruthy();
    await expectNothingSaved();
  });

  it("while no Workout is left", async () => {
    await openEditor();
    await removeWorkout("Day A");
    await removeWorkout("Day B");
    await removeWorkout("Day C");

    expect(screen.getByText("A plan needs at least one workout.")).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();
    await expectNothingSaved();
  });
});

describe("leaving the editor", () => {
  it("asks before discarding changes, and leaves the Plan untouched", async () => {
    await renderPlanScreen();
    await press("Edit Plan");
    await settle(client);
    await type("plan-name", "Push pull legs");

    await press("Cancel");
    expect(alerts().at(-1)?.[0]).toBe("Discard changes?");

    await pressAlertButton("Discard");

    expect(savedPlan().name).toBe("Full body");
    expect(fakePublicApi.count(SAVE)).toBe(0);
    expect(pushedRoutes()).toEqual([]);
  });

  it("closes at once when nothing changed", async () => {
    await renderPlanScreen();
    await press("Edit Plan");
    await settle(client);

    await press("Cancel");
    await settle(client);

    expect(alerts()).toEqual([]);
    expect(pushedRoutes()).toEqual([]);
  });
});

describe("a failed save", () => {
  it("keeps the draft and says what went wrong", async () => {
    await openEditor();
    await type("plan-name", "Push pull legs");
    fakePublicApi.failNext(SAVE, { status: 500 });
    await save();

    expect(
      screen.getByText(
        "Couldn't save your plan. Please check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("plan-name").props.value).toBe("Push pull legs");
    expect(savedPlan().name).toBe("Full body");
    expect(segmentClient.track).not.toHaveBeenCalled();

    await save();

    expect(savedPlan().name).toBe("Push pull legs");
  });

  it("says the Plan is gone when the API no longer has it", async () => {
    await openEditor();
    fakePublicApi.failNext(SAVE, { code: "not_found", status: 404 });
    await save();

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(segmentClient.track).not.toHaveBeenCalled();
  });

  it("reads the Screens behind it again, since the save may have landed", async () => {
    await renderPlanScreen();
    await press("Edit Plan");
    await settle(client);

    await type("plan-name", "Push pull legs");
    // The save commits and its answer is lost on the way back.
    fakePublicApi.failNext(SAVE, "lost");
    await save();

    expect(screen.getByTestId("plan-name").props.value).toBe("Push pull legs");
    expect(fakePublicApi.count("GET /v1/plans/{id}")).toBeGreaterThan(1);
    expect(screen.getByRole("header", { name: "Push pull legs" })).toBeTruthy();
  });

  it("shows how long to wait when it was rate limited", async () => {
    await openEditor();
    fakePublicApi.failNext(SAVE, { retryAfterSeconds: 42, status: 429 });
    await save();

    expect(
      screen.getByText(
        "Couldn't save your plan. Too many requests: please try again in 42 s."
      )
    ).toBeTruthy();
    expect(segmentClient.track).not.toHaveBeenCalled();
  });
});

describe("in Ukrainian", () => {
  it("shows the editor and saves in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    client = createTestQueryClient();
    await render(
      <QueryClientProvider client={client}>
        <InAppLanguage>
          <PlanEditorScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await settle(client);

    expect(
      screen.getByRole("header", { name: "Редагувати план" })
    ).toBeTruthy();
    expect(screen.getByText("Тренування")).toBeTruthy();
    expect(screen.getByText("Мета")).toBeTruthy();
    // VoiceOver reads each field by its label, in the App language.
    expect(
      screen.getByTestId("plan-description").props.accessibilityLabel
    ).toBe("Опис");
    expect(screen.getByTestId("plan-duration").props.accessibilityLabel).toBe(
      "Тривалість тренування, хвилин"
    );

    await type("plan-name", "");
    expect(screen.getByText("Вкажіть назву плану")).toBeTruthy();

    await type("plan-name", "Присідання");
    await press("Зберегти");
    await settle(client);

    expect(savedPlan().name).toBe("Присідання");
  });
});
