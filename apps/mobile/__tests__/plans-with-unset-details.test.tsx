/**
 * A Plan whose goal, place, experience level or Workout duration is unset
 * (ADR 0017) on every Screen that shows those details: the Workout tab, the
 * Plan list, a Plan's screen and its Workout screen, in English and
 * Ukrainian. The real Screens, with Supabase swapped for the in-memory
 * backend, the Public API for its fake over the same rows and the Library
 * for its fake (all from `test-utils/`). An unset detail isn't shown at all:
 * no badge, no "Not set", no `null`, and nothing reported.
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
import { render, screen, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import PlanScreen from "~/app/plans/[planId]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import PlansScreen from "~/app/plans/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

interface MockHeaderOptions {
  title?: string;
}

// Top-level (and `mock`-prefixed, so the factory may use it) because the
// React Compiler rewrites components declared inside a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) =>
  options.title ? <Text>{options.title}</Text> : null;

const mockParams = { planId: "plan-bare", workoutId: "workout-bare" };

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeader {...props} />
    ),
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: () => Promise.resolve() },
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Workout cards) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: false }),
}));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

let queryClient = createTestQueryClient();

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>{children}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** An unset detail shown as the raw value, which no Screen may do. */
const NULL_TEXT = /null/i;

/** What the Screens logged as errors; empty unless one broke. */
let logged: unknown[][] = [];

/** Nothing on screen reads "null", and nothing was logged as an error. */
const expectNothingBroken = () => {
  expect(screen.queryAllByText(NULL_TEXT)).toEqual([]);
  expect(logged).toEqual([]);
};

beforeEach(() => {
  logged = [];
  jest.spyOn(console, "error").mockImplementation((...args) => {
    logged.push(args);
  });
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([libraryExercise("squat"), libraryExercise("bench-press")]);
  mockParams.planId = "plan-bare";
  mockParams.workoutId = "workout-bare";
  // Every detail unset: the Plan a hand-built one will be (ADR 0017). It's
  // the active Plan, so it's the Workout tab's too.
  backend.seedPlan({
    experience_level: null,
    goal: null,
    id: "plan-bare",
    is_active: true,
    name: "Barebones",
    place: null,
    workout_duration: null,
    workouts: [
      {
        exercises: [{ sets: 3, slug: "squat" }],
        id: "workout-bare",
        name: "Day one",
      },
    ],
  });
  // Some unset, some set: only a goal and a duration.
  backend.seedPlan({
    experience_level: null,
    goal: "muscle-gain",
    id: "plan-some",
    name: "Half filled",
    place: null,
    workout_duration: 45,
    workouts: [
      {
        exercises: [{ sets: 3, slug: "bench-press" }],
        id: "workout-some",
        name: "Day two",
      },
    ],
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("A Plan with unset details on the Workout tab", () => {
  it("shows its frequency and drops the goal and place badges", async () => {
    await mount(<HomeScreen />);

    expect(screen.getByText("Barebones")).toBeTruthy();
    expect(screen.getByText("3× per week")).toBeTruthy();
    expect(screen.queryByText("Strength & Performance")).toBeNull();
    expect(screen.queryByText("Gym")).toBeNull();
    expectNothingBroken();
  });

  it("drops the Workout card's duration", async () => {
    await mount(<HomeScreen />);

    const card = within(screen.getByTestId("workout-card-workout-bare"));
    expect(card.getByText("1 exercise")).toBeTruthy();
    expect(card.queryByText("60 min")).toBeNull();
    expect(screen.queryByLabelText("60 minutes")).toBeNull();
  });

  it("still shows the details the Plan does have", async () => {
    backend.plans[0].is_active = false;
    backend.plans[1].is_active = true;
    await mount(<HomeScreen />);

    expect(screen.getByText("Gain Muscle")).toBeTruthy();
    expect(screen.queryByText("Gym")).toBeNull();
    const card = within(screen.getByTestId("workout-card-workout-some"));
    expect(card.getByText("45 min")).toBeTruthy();
  });
});

describe("A Plan with unset details on the Plan list", () => {
  it("shows only the details each Plan has", async () => {
    await mount(<PlansScreen />);

    // The unset Plan keeps its frequency and nothing else.
    expect(screen.getByText("Barebones")).toBeTruthy();
    expect(screen.getAllByText("3× per week")).toHaveLength(2);
    expect(screen.queryByText("Intermediate")).toBeNull();
    expect(screen.queryByText("Gym")).toBeNull();
    expect(screen.queryByText("Strength & Performance")).toBeNull();
    // The half-filled one keeps its goal.
    expect(screen.getByText("Gain Muscle")).toBeTruthy();
    expectNothingBroken();
  });

  it("leaves out a Plan's description when it has none", async () => {
    backend.plans[0].description = null;
    await mount(<PlansScreen />);

    // The card shows no empty line under its details, as the Plan header
    // on the Workout tab doesn't either.
    expect(screen.getByText("Barebones")).toBeTruthy();
    expect(screen.queryByText("About Barebones")).toBeNull();
    expect(screen.getByText("About Half filled")).toBeTruthy();
    expectNothingBroken();
  });
});

describe("A Plan with unset details on its own screens", () => {
  it("lists its Workouts as it does for any other Plan", async () => {
    await mount(<PlanScreen />);

    expect(screen.getByText("Barebones")).toBeTruthy();
    expect(screen.getByText("Day one")).toBeTruthy();
    expect(screen.getByText("1 Exercise")).toBeTruthy();
    expectNothingBroken();
  });

  it("drops the duration from its Workout screen's stats", async () => {
    await mount(<WorkoutScreen />);

    expect(screen.getByText("Day one")).toBeTruthy();
    expect(screen.getByText("Exercises")).toBeTruthy();
    expect(screen.getByText("Sets")).toBeTruthy();
    expect(screen.queryByText("Duration")).toBeNull();
    expectNothingBroken();
  });

  it("keeps the duration when the Plan has one", async () => {
    mockParams.planId = "plan-some";
    mockParams.workoutId = "workout-some";
    await mount(<WorkoutScreen />);

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("45 min")).toBeTruthy();
  });
});

describe("A Plan with unset details in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows its frequency and no unset badge on the Workout tab", async () => {
    await mount(<HomeScreen />);

    expect(screen.getByText("3 рази на тиждень")).toBeTruthy();
    expect(screen.queryByText("Спортзал")).toBeNull();
    expect(screen.queryByText("Сила та результативність")).toBeNull();
    expectNothingBroken();
  });

  it("shows only the details each Plan has on the Plan list", async () => {
    await mount(<PlansScreen />);

    expect(screen.getAllByText("3 рази на тиждень")).toHaveLength(2);
    expect(screen.getByText("Набір м’язової маси")).toBeTruthy();
    expect(screen.queryByText("Середній рівень")).toBeNull();
    expect(screen.queryByText("Спортзал")).toBeNull();
  });

  it("drops the duration from the Workout screen's stats", async () => {
    await mount(<WorkoutScreen />);

    expect(screen.getByText("Вправи")).toBeTruthy();
    expect(screen.queryByText("Тривалість")).toBeNull();
  });
});
