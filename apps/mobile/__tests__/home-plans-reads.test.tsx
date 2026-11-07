import type { Cover } from "@fitme/library-sdk";
/**
 * The Workout tab's Plans, read through the Public API: the real tab screen
 * with the client's `fetch` swapped for the fake Public API and the Library
 * for its fake (both from `test-utils/`).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import HomeScreen from "~/app/(tabs)/(home)/index";
import { PLANS_QUERY_KEY } from "~/hooks/queries/plans";
import { invalidateWeighedQueries } from "~/hooks/queries/settings";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import type { SeedPlan } from "~/test-utils/fake-public-api";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    push: mockPush,
    replace: jest.fn(),
  }),
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: () => Promise.resolve() },
}));

// The real Clerk SDK (reached through the Workout cards) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const ACTIVE_PLAN = "GET /v1/plans/active";
const LIST_PLANS = "GET /v1/plans";

const RATE_LIMITED_12 = "Too many requests: please try again in 12 s.";

const LEGS_COVER: Cover = {
  id: "3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b",
  image_url:
    "https://media.test/storage/v1/render/image/public/exercise-media/covers/legs.jpg",
  muscle_groups: ["quadriceps"],
};

const STRENGTH: SeedPlan = {
  id: "plan-1",
  is_active: true,
  name: "Strength",
  workouts: [
    {
      cover: LEGS_COVER.id,
      exercises: [
        { sets: 3, slug: "squat" },
        { sets: 3, slug: "lunge" },
      ],
      id: "workout-legs",
      name: "Legs",
      order: 2,
    },
    {
      exercises: [
        { sets: 3, slug: "bench-press" },
        { sets: 3, slug: "push-up" },
        { sets: 3, slug: "fly" },
      ],
      id: "workout-push",
      name: "Push",
      order: 1,
    },
  ],
};

let queryClient = createTestQueryClient();

/**
 * A QueryClient with the app's defaults (`components/providers.tsx`: three
 * retries a second or more apart), unlike `createTestQueryClient`'s none;
 * only garbage collection is off, so no timer outlives the test.
 */
const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });

/** Lets `ms` of real time pass, inside `act`. */
const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });

const renderScreen = async (client = createTestQueryClient()) => {
  queryClient = client;
  await render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>
  );
};

const mount = async () => {
  await renderScreen();
  await settle(queryClient);
};

/** Pulls the tab down to refresh, and waits for every read it starts. */
const pullToRefresh = async () => {
  const { refreshControl } = screen.getByTestId("home-screen").props;
  await act(() => refreshControl.props.onRefresh());
  await settle(queryClient);
};

const cardOf = (workoutId: string) =>
  within(screen.getByTestId(`workout-card-${workoutId}`));

/** The cards' Workout names, in the carousel's order. */
const cardNames = () =>
  within(screen.getByTestId("workout-carousel"))
    .getAllByRole("heading")
    .map((heading) => heading.props.children);

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary(
    [
      libraryExercise("bench-press", { muscle_groups: ["chest", "triceps"] }),
      libraryExercise("push-up", {
        muscle_groups: ["chest", "triceps", "shoulders"],
      }),
      libraryExercise("fly", { muscle_groups: ["chest"] }),
      libraryExercise("squat", { muscle_groups: ["quadriceps", "glutes"] }),
      libraryExercise("lunge", { muscle_groups: ["quadriceps", "calves"] }),
    ],
    { covers: [LEGS_COVER] }
  );
});

describe("the Workout tab's Plans", () => {
  it("shows the active Plan's Workouts from the API", async () => {
    backend.seedPlan(STRENGTH);
    await mount();

    expect(screen.getByRole("heading", { name: "Strength" })).toBeTruthy();
    expect(cardNames()).toEqual(["Push", "Legs"]);
    // Each card's muscle groups from its Exercises' slugs, through the
    // Library, its Exercise count and the Plan's duration.
    expect(cardOf("workout-push").getByText("Chest")).toBeTruthy();
    expect(cardOf("workout-push").getByText("Triceps")).toBeTruthy();
    expect(cardOf("workout-push").getByText("Shoulders")).toBeTruthy();
    expect(cardOf("workout-push").getByText("3 exercises")).toBeTruthy();
    expect(cardOf("workout-legs").getByText("Quadriceps")).toBeTruthy();
    expect(cardOf("workout-legs").getByText("2 exercises")).toBeTruthy();
    expect(screen.getAllByText("60 min")).toHaveLength(2);
    // Legs' Cover behind its card; Push has none.
    expect(
      screen.queryByTestId("workout-cover-workout-legs", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    expect(
      screen.queryByTestId("workout-cover-workout-push", {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });

  it("opens a card's Workout screen in the active Plan", async () => {
    backend.seedPlan(STRENGTH);
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: "Preview Legs" }));

    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-legs"
    );
  });

  it("asks for the active Plan and the Plans at once", async () => {
    backend.seedPlan(STRENGTH);
    const resume = fakePublicApi.pause(ACTIVE_PLAN);
    await renderScreen();

    // The Plans are asked for while the active Plan's answer is held.
    await until(() => fakePublicApi.count(LIST_PLANS) === 1);
    expect(fakePublicApi.count(ACTIVE_PLAN)).toBe(1);
    expect(screen.getByTestId("home-loading")).toBeTruthy();

    resume();
    await settle(queryClient);
    expect(cardNames()).toEqual(["Push", "Legs"]);
  });

  it("asks to activate a Plan, with Manage Plans, when none is active", async () => {
    backend.seedPlan({ ...STRENGTH, is_active: false });
    await mount();

    expect(screen.getByText("No active plan")).toBeTruthy();
    expect(
      screen.getByText("Activate one of your plans, or create a new one.")
    ).toBeTruthy();
    expect(screen.queryByTestId("workout-carousel")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Manage Plans" }));
    expect(mockPush).toHaveBeenCalledWith("/plans");
  });

  it("offers to create a Plan, with no Manage Plans, when there's none", async () => {
    await mount();

    expect(screen.getByText("No active plan")).toBeTruthy();
    expect(
      screen.getByText(
        "You don't have an active workout plan. Create one to get started."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manage Plans" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Create Workout Plan" })
    );
    expect(mockPush).toHaveBeenCalledWith("/planner");
  });

  it("leaves out a deleted Plan, which is never the active one", async () => {
    backend.seedPlan({ ...STRENGTH, deleted_at: "2026-10-24T12:00:00.000Z" });
    await mount();

    expect(
      screen.getByText(
        "You don't have an active workout plan. Create one to get started."
      )
    ).toBeTruthy();
  });

  it("shows the load error when the active Plan can't be read, and recovers on Try Again", async () => {
    backend.seedPlan(STRENGTH);
    fakePublicApi.failNext(ACTIVE_PLAN, { status: 500 });
    await mount();

    expect(screen.getByText("Couldn't load your plan")).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.queryByText("No active plan")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(cardNames()).toEqual(["Push", "Legs"]);
  });

  it("shows the load error, not a guessed empty state, when the Plans can't be read without an active one", async () => {
    backend.seedPlan({ ...STRENGTH, is_active: false });
    fakePublicApi.failNext(LIST_PLANS, "network");
    await mount();

    expect(screen.getByText("Couldn't load your plan")).toBeTruthy();
    expect(screen.queryByText("No active plan")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(
      screen.getByText("Activate one of your plans, or create a new one.")
    ).toBeTruthy();
  });

  it("shows the active Plan even while the Plans can't be read", async () => {
    backend.seedPlan(STRENGTH);
    fakePublicApi.failNext(LIST_PLANS, { status: 500 });
    await mount();

    expect(cardNames()).toEqual(["Push", "Legs"]);
    expect(screen.queryByText("Couldn't load your plan")).toBeNull();
  });

  it("keeps the cards it read when a refresh fails", async () => {
    backend.seedPlan(STRENGTH);
    await mount();
    fakePublicApi.failNext(ACTIVE_PLAN, { status: 500 });
    fakePublicApi.failNext(LIST_PLANS, { status: 500 });

    await pullToRefresh();

    expect(fakePublicApi.count(ACTIVE_PLAN)).toBe(2);
    expect(cardNames()).toEqual(["Push", "Legs"]);
    expect(screen.queryByText("Couldn't load your plan")).toBeNull();
  });

  it("keeps the empty state it read when a refresh fails", async () => {
    backend.seedPlan({ ...STRENGTH, is_active: false });
    await mount();
    fakePublicApi.failNext(ACTIVE_PLAN, { status: 500 });
    fakePublicApi.failNext(LIST_PLANS, { status: 500 });

    await pullToRefresh();

    expect(
      screen.getByText("Activate one of your plans, or create a new one.")
    ).toBeTruthy();
    expect(screen.queryByText("Couldn't load your plan")).toBeNull();
  });

  it("gives the wait when the active Plan's read is rate limited", async () => {
    backend.seedPlan(STRENGTH);
    fakePublicApi.failNext(ACTIVE_PLAN, { retryAfterSeconds: 12, status: 429 });
    await mount();

    expect(screen.getByText("Couldn't load your plan")).toBeTruthy();
    expect(screen.getByText(RATE_LIMITED_12)).toBeTruthy();
    expect(
      screen.queryByText("Check your connection and try again.")
    ).toBeNull();
  });

  it("gives the wait when the Plans' read is rate limited without an active Plan", async () => {
    fakePublicApi.failNext(LIST_PLANS, { retryAfterSeconds: 12, status: 429 });
    await mount();

    expect(screen.getByText(RATE_LIMITED_12)).toBeTruthy();
  });

  it("reads both again after a Plan write, showing the Plan it made inactive", async () => {
    backend.seedPlan(STRENGTH);
    await mount();
    // Deactivated elsewhere; every Plan write invalidates the Plan reads.
    const [plan] = backend.plans;

    if (plan) {
      plan.is_active = false;
    }

    await act(() =>
      queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY })
    );
    await settle(queryClient);

    expect(fakePublicApi.count(ACTIVE_PLAN)).toBe(2);
    expect(fakePublicApi.count(LIST_PLANS)).toBe(2);
    expect(
      screen.getByText("Activate one of your plans, or create a new one.")
    ).toBeTruthy();
  });

  it("reads the active Plan again after a measurement system switch", async () => {
    backend.seedPlan(STRENGTH);
    await mount();

    await act(() => invalidateWeighedQueries(queryClient));
    await settle(queryClient);

    expect(fakePublicApi.count(ACTIVE_PLAN)).toBe(2);
  });
});

describe("the Workout tab's Plans, with the app's retries", () => {
  // Longer than react-query's first retry delay (a second).
  const RETRY_DELAY_PASSED_MS = 1500;

  it("gives the active Plan's 429 wait at once and asks again only when told to", async () => {
    backend.seedPlan(STRENGTH);
    fakePublicApi.failNext(ACTIVE_PLAN, { retryAfterSeconds: 12, status: 429 });
    await renderScreen(createAppQueryClient());
    await settle(queryClient);

    expect(screen.getByText(RATE_LIMITED_12)).toBeTruthy();
    await wait(RETRY_DELAY_PASSED_MS);
    expect(fakePublicApi.count(ACTIVE_PLAN)).toBe(1);
    expect(screen.getByText(RATE_LIMITED_12)).toBeTruthy();
    queryClient.clear();
  });

  it("gives the Plans' 429 wait at once without an active Plan, with no retry", async () => {
    fakePublicApi.failNext(LIST_PLANS, { retryAfterSeconds: 12, status: 429 });
    await renderScreen(createAppQueryClient());
    await settle(queryClient);

    expect(screen.getByText(RATE_LIMITED_12)).toBeTruthy();
    await wait(RETRY_DELAY_PASSED_MS);
    expect(fakePublicApi.count(LIST_PLANS)).toBe(1);
    queryClient.clear();
  });
});
