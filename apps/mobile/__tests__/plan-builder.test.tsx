/**
 * Building a Plan by hand, on the mounted-screen seam: the real Create Plan
 * choice, create sheet, Plan editor, Workout editor and Library picker, with
 * the Public API client's `fetch` swapped for the fake Public API and the
 * Library for the in-memory fake, so what Save creates is read back off the
 * fake's rows. Pro comes from the real `useIsProQuery` over a stood-in
 * RevenueCat, so a free User's Pro badge and paywall are the app's own.
 *
 * Each pushed route is mounted over the one below it
 * (`test-utils/router-stub.tsx`), so assertions on the editor are scoped
 * with `within`.
 */
import { MAX_FREQUENCY, MIN_FREQUENCY } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";

import MusclesSheet from "~/app/muscles";
import PlanExercisePickerScreen from "~/app/plans/[planId]/edit/exercise-picker";
import PlanEditorScreen from "~/app/plans/[planId]/edit/index";
import WorkoutEditorScreen from "~/app/plans/[planId]/edit/workouts/[workoutKey]";
import PlanScreen from "~/app/plans/[planId]/index";
import CreatePlanScreen from "~/app/plans/create";
import { segmentClient } from "~/lib/segment";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
  libraryExerciseNamed,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import {
  dismissedToRoute,
  PushedRoutes,
  pushedRoutes,
  resetStubRouter,
  stubRouter,
} from "~/test-utils/router-stub";

const mockParams: { current: Record<string, string> } = { current: {} };

/** Whether the editor is holding the Screen against a swipe or the back gesture. */
const preventsRemove = { current: false };

/** Whether the signed-in User has Fitme Pro, as RevenueCat answers it. */
const mockIsPro = { current: false };

const mockPresentPaywall = jest.fn();

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Link: ({ children }: { children: ReactNode }) => children,
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ isFocused: () => true }),
    // The guard blocks the swipe away, which Jest can't make, so the test
    // reads the flag it is given; Cancel asks through `Alert` either way.
    usePreventRemove: (shouldPrevent: boolean) => {
      preventsRemove.current = shouldPrevent;

      return () => {
        preventsRemove.current = false;
      };
    },
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

jest.mock("react-native-purchases", () => {
  const { proEntitlement } =
    jest.requireActual<typeof import("@fitme/core")>("@fitme/core");

  return {
    __esModule: true,
    default: {
      getCustomerInfo: () =>
        Promise.resolve({
          entitlements: {
            active: mockIsPro.current ? { [proEntitlement]: {} } : {},
          },
        }),
      invalidateCustomerInfoCache: () => Promise.resolve(),
    },
  };
});

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: () => mockPresentPaywall() },
}));

// The real Clerk SDK opens a MessagePort at import, which keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
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

const CREATE = "POST /v1/plans" as const;

const BUILDER_ROUTES = {
  "/muscles": MusclesSheet,
  "/plans/[planId]/edit": PlanEditorScreen,
  "/plans/[planId]/edit/exercise-picker": PlanExercisePickerScreen,
  "/plans/[planId]/edit/workouts/[workoutKey]": WorkoutEditorScreen,
};

let client: QueryClient;

/** The Create Plan choice, with every route it leads to mounted over it. */
const openChoice = async (language = "en-US") => {
  client = createTestQueryClient();
  setDeviceLanguages([language]);
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <CreatePlanScreen />
        <PushedRoutes screens={BUILDER_ROUTES} />
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

const type = async (testID: string, text: string) => {
  await fireEvent.changeText(screen.getByTestId(testID), text);
  await settle(client);
};

/** The Plan editor's subtree, mounted over the create sheet. */
const editor = () => within(screen.getByTestId("plan-editor"));

/** The create sheet's name and frequency, then the editor it opens. */
const buildByHand = async ({
  frequency = "2",
  name = "Full body",
}: { frequency?: string; name?: string } = {}) => {
  await press("Build it yourself");
  await type("new-plan-name", name);
  await type("new-plan-frequency", frequency);
  await press("Continue");
};

/** Leaves the Workout editor, as its native back button does. */
const goBack = async () => {
  await act(() => {
    stubRouter.back();
  });
  await settle(client);
};

/** What the Workout editor's and the picker's controls are called. */
interface PickerLabels {
  add: string;
  open: (name: string) => string;
  pick: (name: string) => string;
}

const ENGLISH: PickerLabels = {
  add: "Add Exercise",
  open: (name) => `Edit ${name}`,
  pick: (name) => `Add ${name}`,
};

/** Adds an Exercise to the Workout named `workout`, through the picker. */
const addExerciseTo = async (
  workout: string,
  exercise: string,
  labels: PickerLabels = ENGLISH
) => {
  await press(labels.open(workout));
  await pressButton(labels.add);
  await press(labels.pick(exercise));
  // The picker pops itself; back out of the Workout editor to the Plan's.
  await goBack();
};

const tracked = () =>
  jest.mocked<
    (
      event: string,
      properties?: Record<string, string | number | boolean | null>
    ) => void
  >(segmentClient.track).mock.calls;

const savedPlan = () => backend.plans[0];

/** The four details a Plan may leave unset, as the create's body sends them. */
interface SentPlanDetails {
  experience_level?: string | null;
  goal?: string | null;
  place?: string | null;
  workout_duration?: number | null;
}

/** The body the fake Public API was sent for the create. */
const createdBody = () =>
  fakePublicApi.requests.find((request) => request.route === CREATE)?.body as
    | SentPlanDetails
    | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([
    libraryExerciseNamed("Barbell back squat"),
    libraryExerciseNamed("Bench press"),
  ]);
  resetStubRouter();
  mockParams.current = {};
  mockIsPro.current = false;
});

describe("the Create Plan choice", () => {
  it("marks Ask Arnold as Pro and shows the paywall to a free User", async () => {
    await openChoice();

    expect(screen.getByText("Pro")).toBeTruthy();

    await press("Ask Arnold");

    expect(mockPresentPaywall).toHaveBeenCalledTimes(1);
    expect(pushedRoutes()).toEqual([]);
  });

  it("opens the planner for a Pro User, with no Pro badge", async () => {
    mockIsPro.current = true;
    await openChoice();

    expect(screen.queryByText("Pro")).toBeNull();

    await press("Ask Arnold");

    expect(mockPresentPaywall).not.toHaveBeenCalled();
    expect(pushedRoutes()).toEqual([
      expect.objectContaining({ pathname: "/planner" }),
    ]);
  });
});

describe("the create sheet", () => {
  it("opens the editor on one empty lettered Workout per weekly session", async () => {
    await openChoice();
    await buildByHand({ frequency: "3", name: "Push pull legs" });

    expect(editor().getByTestId("plan-name").props.value).toBe(
      "Push pull legs"
    );
    expect(editor().getByTestId("plan-frequency").props.value).toBe("3");
    expect(editor().getByText("Workout A")).toBeTruthy();
    expect(editor().getByText("Workout B")).toBeTruthy();
    expect(editor().getByText("Workout C")).toBeTruthy();
    // Every one is empty, so Save says what's missing and stays off.
    expect(editor().getAllByText("Needs at least one exercise")).toHaveLength(
      3
    );
    expect(screen.getByLabelText("Save")).toBeDisabled();
  });

  it("won't continue without a name or with a frequency out of bounds", async () => {
    await openChoice();
    await press("Build it yourself");

    expect(screen.getByLabelText("Continue")).toBeDisabled();

    await type("new-plan-name", "Full body");
    expect(screen.getByLabelText("Continue")).not.toBeDisabled();

    await type("new-plan-frequency", String(MAX_FREQUENCY + 1));
    expect(
      screen.getByText(
        `Workouts a week must be a whole number from ${MIN_FREQUENCY} to ${MAX_FREQUENCY}`
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Continue")).toBeDisabled();
    expect(pushedRoutes()).toEqual([]);
  });

  it("keeps the Workouts it opened with when the frequency changes", async () => {
    await openChoice();
    await buildByHand({ frequency: "2" });

    await fireEvent.changeText(editor().getByTestId("plan-frequency"), "5");
    await settle(client);

    expect(editor().getByText("Workout A")).toBeTruthy();
    expect(editor().getByText("Workout B")).toBeTruthy();
    expect(editor().queryByText("Workout C")).toBeNull();
  });
});

describe("saving a Plan built by hand", () => {
  /** The whole flow: name, frequency, an Exercise per Workout, then Save. */
  const buildAndSave = async (frequency = "1") => {
    await buildByHand({ frequency });
    await addExerciseTo("Workout A", "Barbell back squat");

    if (frequency !== "1") {
      await addExerciseTo("Workout B", "Bench press");
    }

    await press("Save");
  };

  it("enables Save only once every Workout has an Exercise", async () => {
    await openChoice();
    await buildByHand({ frequency: "2" });

    await addExerciseTo("Workout A", "Barbell back squat");
    expect(screen.getByLabelText("Save")).toBeDisabled();

    await addExerciseTo("Workout B", "Bench press");
    expect(screen.getByLabelText("Save")).not.toBeDisabled();
  });

  it("creates it through POST /v1/plans with only the details set, active, and lands on it", async () => {
    await openChoice();
    await buildAndSave();

    expect(fakePublicApi.count(CREATE)).toBe(1);
    const body = createdBody();
    expect(body).toMatchObject({
      activate: true,
      description: "",
      frequency: 1,
      name: "Full body",
    });

    // The four optional details were never set, so none goes out (ADR 0017).
    expect(body && "goal" in body).toBe(false);
    expect(body && "place" in body).toBe(false);
    expect(body && "experience_level" in body).toBe(false);
    expect(body && "workout_duration" in body).toBe(false);

    const created = savedPlan();
    expect(created.name).toBe("Full body");
    expect(created.is_active).toBe(true);
    expect(created.goal).toBeNull();
    expect(created.place).toBeNull();
    expect(created.experience_level).toBeNull();
    expect(created.workout_duration).toBeNull();
    expect(created.workouts.map((workout) => workout.name)).toEqual([
      "Workout A",
    ]);

    expect(dismissedToRoute()).toBe(`/plans/${created.id}`);
  });

  it("fires `Plan Saved` from the builder, then `Plan Activated`", async () => {
    await openChoice();
    await buildAndSave();

    const created = savedPlan();
    expect(tracked()).toEqual([
      ["Plan Saved", { plan_id: created.id, source: "builder" }],
      ["Plan Activated", { plan_id: created.id }],
    ]);
  });

  it("saves the details the User did set", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    await press("Lose Weight");
    await press("Beginner");
    await press("Home");
    await fireEvent.changeText(editor().getByTestId("plan-duration"), "45");
    await settle(client);
    await press("Save");

    const created = savedPlan();
    expect(created.goal).toBe("fat-loss");
    expect(created.experience_level).toBe("beginner");
    expect(created.place).toBe("home");
    expect(created.workout_duration).toBe(45);
  });

  it("shows none of the four details on the new Plan's screen", async () => {
    await openChoice();
    await buildAndSave();

    mockParams.current = { planId: savedPlan().id };
    const planClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={planClient}>
        <InAppLanguage>
          <PlanScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await settle(planClient);

    // The Plan's name is its header's, outside this subtree.
    const plan = within(screen.getByTestId("plan-screen"));
    expect(plan.getByText("Workout A")).toBeTruthy();
    expect(plan.queryByText("Lose Weight")).toBeNull();
    expect(plan.queryByText("Beginner")).toBeNull();
    expect(plan.queryByText("Gym")).toBeNull();
    expect(plan.queryByText(/null/iu)).toBeNull();
  });

  it("keeps the editor open with the draft when the create fails", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    fakePublicApi.failNext(CREATE, { status: 500 });
    await press("Save");

    expect(
      screen.getByText(
        "Couldn't save your plan. Please check your connection and try again."
      )
    ).toBeTruthy();
    expect(backend.plans).toEqual([]);
    expect(segmentClient.track).not.toHaveBeenCalled();
    expect(editor().getByTestId("plan-name").props.value).toBe("Full body");

    // The draft is intact, so a retry saves it.
    await press("Save");

    expect(savedPlan().name).toBe("Full body");
  });

  it("holds the Screen while the create is on its way", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    const resume = fakePublicApi.pause(CREATE);
    await fireEvent.press(screen.getByLabelText("Save"));
    await until(() => fakePublicApi.count(CREATE) === 1);

    // Leaving now would make the Plan, and make it active, with nothing on
    // screen to say so: Cancel is off, and so is every other way out.
    await waitFor(() => {
      expect(screen.getByLabelText("Cancel")).toBeDisabled();
    });
    expect(preventsRemove.current).toBe(true);

    resume();
    await settle(client);

    expect(savedPlan().name).toBe("Full body");
  });

  it("refuses to save when the measurement system changed while building", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    // The User switched to imperial on another device, so the targets they
    // typed are in the unit before it.
    backend.profiles[0].measurement_system = "us";
    await client.invalidateQueries({ queryKey: ["profile"] });
    await settle(client);

    expect(
      screen.getByText(
        "Your weight units changed on another device, so these targets are in the old one. Close the editor and open it again."
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();

    await press("Save");
    expect(fakePublicApi.count(CREATE)).toBe(0);
  });

  it("refuses a duration that isn't a whole number, rather than clearing it", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    await fireEvent.changeText(editor().getByTestId("plan-duration"), "45.5");
    await settle(client);

    expect(
      screen.getByText(
        "Workout duration must be a whole number of minutes, at most 600"
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Save")).toBeDisabled();

    await press("Save");
    expect(fakePublicApi.count(CREATE)).toBe(0);
  });

  it("shows how long to wait when the create was rate limited", async () => {
    await openChoice();
    await buildByHand({ frequency: "1" });
    await addExerciseTo("Workout A", "Barbell back squat");

    fakePublicApi.failNext(CREATE, { retryAfterSeconds: 42, status: 429 });
    await press("Save");

    expect(
      screen.getByText(
        "Couldn't save your plan. Too many requests: please try again in 42 s."
      )
    ).toBeTruthy();
    expect(backend.plans).toEqual([]);
  });
});

describe("in Ukrainian", () => {
  it("offers both ways, then builds the Plan in the App language", async () => {
    await openChoice("uk-UA");

    expect(screen.getByText("Як створити цей план?")).toBeTruthy();
    expect(screen.getByText("Створити самостійно")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();

    await press("Створити самостійно");
    await type("new-plan-name", "Все тіло");
    await type("new-plan-frequency", "2");
    await press("Продовжити");

    expect(editor().getByText("Тренування A")).toBeTruthy();
    expect(editor().getByText("Тренування B")).toBeTruthy();

    const ukrainian = {
      add: "Додати вправу",
      open: (name: string) => `Редагувати «${name}»`,
      pick: (name: string) => `Додати «${name}»`,
    };

    await addExerciseTo("Тренування A", "Barbell back squat", ukrainian);
    await addExerciseTo("Тренування B", "Bench press", ukrainian);
    await press("Зберегти");

    const created = savedPlan();
    expect(created.name).toBe("Все тіло");
    expect(created.workouts.map((workout) => workout.name)).toEqual([
      "Тренування A",
      "Тренування B",
    ]);
  });
});
