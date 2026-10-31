/**
 * The Workout tab's carousel on the mounted-screen seam: the real tab screen
 * with Supabase swapped for the in-memory backend, the Public API for its
 * fake and the Library for its fake (all from `test-utils/`).
 */

import type { MuscleGroup } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

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
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const START = "POST /v1/workout-sessions";

// Any Finish button, and an elapsed time like 12:34.
const FINISH = /^Finish/;
const ELAPSED_TIME = /\d+:\d\d/;

// The "+N" badge, whatever N is.
const MORE_BADGE = /^\+/;

// A Workout Session screen of `workout-legs`.
const LEGS_SESSION_PATH =
  /^\/plans\/plan-1\/workouts\/workout-legs\/sessions\/.+/;

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const exercise = (slug: string, muscleGroups: MuscleGroup[]) =>
  libraryExercise(slug, { muscle_groups: muscleGroups });

/** The cards' Workout names, in the carousel's order. */
const cardNames = () =>
  within(screen.getByTestId("workout-carousel"))
    .getAllByRole("heading")
    .map((heading) => heading.props.children);

/** Opens Workout Session `s1` of the Plan's Workout `workoutId`. */
const openSessionOf = (workoutId: string, workoutName: string) => {
  backend.seed({ exercises: [], id: "s1" });
  const session = backend.sessions.find(({ id }) => id === "s1");
  if (session) {
    session.workout_id = workoutId;
    session.workoutName = workoutName;
  }
};

const cardOf = (workoutId: string) =>
  screen.getByTestId(`workout-card-${workoutId}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary([
    exercise("bench-press", ["chest", "triceps"]),
    exercise("push-up", ["chest", "triceps", "shoulders"]),
    exercise("dips", ["triceps", "chest"]),
    exercise("fly", ["chest"]),
    exercise("squat", ["quadriceps", "glutes", "hamstrings", "lower-back"]),
    exercise("lunge", ["quadriceps", "glutes", "calves", "abs"]),
  ]);
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      {
        exercises: [
          { sets: 3, slug: "squat" },
          { sets: 3, slug: "lunge" },
        ],
        id: "workout-legs",
        name: "Legs",
        order: 3,
      },
      {
        exercises: [
          { sets: 3, slug: "bench-press" },
          { sets: 3, slug: "push-up" },
          { sets: 3, slug: "dips" },
          { sets: 3, slug: "fly" },
        ],
        id: "workout-push",
        name: "Push",
        order: 1,
      },
      {
        exercises: [{ sets: 3, slug: "not-in-the-library" }],
        id: "workout-pull",
        name: "Pull",
        order: 2,
      },
    ],
  });
});

describe("The Workout tab's carousel", () => {
  it("shows the Next Workout first, then the rest in rotation order", async () => {
    await mount();

    expect(screen.getByTestId("workout-carousel")).toBeTruthy();
    expect(cardNames()).toEqual(["Push", "Pull", "Legs"]);
    expect(screen.queryByText("Next Workout")).toBeNull();
    expect(screen.queryByText("Upcoming")).toBeNull();
  });

  it("shows each card's Exercise count and the Plan's duration", async () => {
    await mount();

    const push = within(cardOf("workout-push"));
    expect(push.getByText("4 exercises")).toBeTruthy();
    expect(push.getByText("60 min")).toBeTruthy();
    expect(push.getByLabelText("60 minutes")).toBeTruthy();
    expect(within(cardOf("workout-pull")).getByText("1 exercise")).toBeTruthy();
  });

  it("badges the most trained muscle groups first, three of them, then +N", async () => {
    await mount();

    // Chest and triceps in four and three Exercises, then shoulders.
    const push = within(cardOf("workout-push"));
    expect(push.getByText("Chest")).toBeTruthy();
    expect(push.getByText("Triceps")).toBeTruthy();
    expect(push.getByText("Shoulders")).toBeTruthy();
    expect(push.queryByText(MORE_BADGE)).toBeNull();

    // Quadriceps and glutes in both, then hamstrings (met first) and three more.
    const legs = within(cardOf("workout-legs"));
    expect(legs.getByText("Quadriceps")).toBeTruthy();
    expect(legs.getByText("Glutes")).toBeTruthy();
    expect(legs.getByText("Hamstrings")).toBeTruthy();
    expect(legs.queryByText("Calves")).toBeNull();
    expect(legs.getByText("+3")).toBeTruthy();
    expect(legs.getByLabelText("and 3 more muscle groups")).toBeTruthy();
  });

  it("shows no badges for Exercises the Library hasn't resolved", async () => {
    await mount();

    const pull = within(cardOf("workout-pull"));
    expect(pull.queryByText(MORE_BADGE)).toBeNull();
    expect(pull.queryByText("Chest")).toBeNull();
  });

  it("reads each card's name and both buttons", async () => {
    await mount();

    for (const name of ["Push", "Pull", "Legs"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: `Preview ${name}` })
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: `Start ${name}` })
      ).toBeTruthy();
    }
  });

  it("opens the Workout screen on Preview", async () => {
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: "Preview Pull" }));

    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-pull"
    );
  });

  it("starts any card's Workout and opens its session", async () => {
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: "Start Legs" }));
    await settle(queryClient);

    expect(fakePublicApi.count(START)).toBe(1);
    expect(fakePublicApi.requests.at(-1)?.body).toEqual({
      workout_id: "workout-legs",
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(LEGS_SESSION_PATH)
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("alerts on a failed Start and opens nothing", async () => {
    await mount();
    fakePublicApi.failNext(START, { status: 500 });

    await fireEvent.press(screen.getByRole("button", { name: "Start Push" }));
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Check your connection and try again."
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("puts the open session's Workout first, reading Continue", async () => {
    openSessionOf("workout-legs", "Legs");
    await mount();

    expect(cardNames()).toEqual(["Legs", "Push", "Pull"]);
    expect(
      within(cardOf("workout-legs")).queryByRole("button", {
        name: "Start Legs",
      })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Start Push" })).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Continue Legs" })
    );

    expect(within(cardOf("workout-legs")).getByText("Continue")).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-legs/sessions/s1"
    );
    expect(fakePublicApi.count(START)).toBe(0);
  });

  it("asks the API on another card's Start and alerts its 409", async () => {
    openSessionOf("workout-legs", "Legs");
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: "Start Push" }));
    await settle(queryClient);

    expect(fakePublicApi.count(START)).toBe(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Finish Legs first"
    );
    expect(backend.sessions.map(({ id }) => id)).toEqual(["s1"]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("alerts the same when Start finds a session opened elsewhere", async () => {
    await mount();
    // Opened elsewhere (MCP, another device) after the tab was read.
    openSessionOf("workout-legs", "Legs");

    await fireEvent.press(screen.getByRole("button", { name: "Start Push" }));
    await settle(queryClient);

    expect(fakePublicApi.count(START)).toBe(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Finish Legs first"
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("alerts the wait when Start is rate limited", async () => {
    await mount();
    fakePublicApi.failNext(START, { retryAfterSeconds: 12, status: 429 });

    await fireEvent.press(screen.getByRole("button", { name: "Start Push" }));
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Too many requests: please try again in 12 s."
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has no Finish button or timer", async () => {
    openSessionOf("workout-legs", "Legs");
    await mount();

    expect(screen.queryByRole("button", { name: FINISH })).toBeNull();
    expect(screen.queryByText(ELAPSED_TIME)).toBeNull();
  });
});
