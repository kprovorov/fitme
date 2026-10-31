/**
 * The History tab with no finished Workout Session, on the mounted-screen
 * seam: the real route and its reads (History through the fake Public API,
 * the open Workout Session and the Plans over the in-memory Supabase backend,
 * both over the same rows) and Start through the fake Public API, so the
 * card's action follows what those reads answered.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Alert, type RefreshControlProps } from "react-native";
import HistoryScreen from "~/app/(tabs)/history/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend, type SeedPlan } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
  useRouter: () => ({ navigate: jest.fn(), push: mockPush }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// every item (or the empty component) in a plain view instead.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: <T,>({
    data,
    keyExtractor,
    ListEmptyComponent,
    refreshControl,
    renderItem,
  }: {
    data: T[];
    keyExtractor: (item: T) => string;
    ListEmptyComponent: ReactNode;
    refreshControl: ReactElement<RefreshControlProps>;
    renderItem: (info: { item: T }) => ReactNode;
  }) => {
    const { Fragment } = jest.requireActual<typeof import("react")>("react");
    const { ScrollView } =
      jest.requireActual<typeof import("react-native")>("react-native");
    // The list's pull to refresh, kept on its view for the test to pull.
    return (
      <ScrollView refreshControl={refreshControl} testID="history-list">
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item) => (
              <Fragment key={keyExtractor(item)}>
                {renderItem({ item })}
              </Fragment>
            ))}
      </ScrollView>
    );
  },
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Profile read) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: jest.fn() },
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const START = "POST /v1/workout-sessions";
const HISTORY = "GET /v1/workout-sessions";

const PLAN: SeedPlan = {
  id: "plan-1",
  is_active: true,
  name: "Hypertrophy Builder",
  workouts: [
    {
      exercises: [
        { sets: 3, slug: "barbell-bench-press" },
        { sets: 3, slug: "barbell-row" },
      ],
      id: "workout-1",
      name: "Upper A",
    },
    {
      exercises: [{ sets: 3, slug: "barbell-back-squat" }],
      id: "workout-2",
      name: "Lower A",
    },
  ],
};

/** An open Workout Session of `workoutId` (`null`: its Workout is gone). */
const seedOpenSession = (workoutId: string | null, name = "Upper A") => {
  backend.sessions.push({
    finished_at: null,
    id: "open-session",
    plan_id: workoutId ? "plan-1" : null,
    started_at: "2026-10-29T09:00:00.000Z",
    workout_id: workoutId,
    workoutName: name,
  });
};

let queryClient = createTestQueryClient();

const mount = async (wrap: (node: ReactNode) => ReactNode = (n) => n) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      {wrap(<HistoryScreen />)}
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** A Start button, whichever Workout it names. */
const START_LABEL = /^Start /;

/** Every button the empty card could offer, whatever its name. */
const ACTION =
  /^(Start |Resume |Create a Plan$|Почати |Продовжити |Створити план$)/;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
});

describe("The empty History", () => {
  it("starts the active Plan's next Workout, naming it, its Plan and its Exercises", async () => {
    backend.seedPlan(structuredClone(PLAN));
    await mount();

    expect(screen.getByText("No workouts yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Finish your first session and it shows up here with time, sets, volume and PRs."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("Next up in Hypertrophy Builder · 2 exercises")
    ).toBeTruthy();

    await fireEvent.press(button("Start Upper A"));
    await settle(queryClient);

    const started = backend.sessions.find(
      (session) => session.finished_at === null
    );
    expect(started?.workout_id).toBe("workout-1");
    expect(fakePublicApi.count(START)).toBe(1);
    expect(mockPush).toHaveBeenCalledWith(
      `/plans/plan-1/workouts/workout-1/sessions/${started?.id}`
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("starts whichever Workout is next in the rotation, with its own Exercise count", async () => {
    backend.seedPlan({
      ...structuredClone(PLAN),
      workouts: [...structuredClone(PLAN.workouts)].reverse(),
    });
    await mount();

    expect(button("Start Lower A")).toBeTruthy();
    expect(
      screen.getByText("Next up in Hypertrophy Builder · 1 exercise")
    ).toBeTruthy();
  });

  it("resumes the open Workout Session first, without starting anything", async () => {
    backend.seedPlan(structuredClone(PLAN));
    seedOpenSession("workout-2", "Lower A");
    await mount();

    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
    expect(screen.getByText("You have a workout in progress.")).toBeTruthy();
    await fireEvent.press(button("Resume Lower A"));

    expect(mockPush).toHaveBeenCalledWith(
      "/plans/plan-1/workouts/workout-2/sessions/open-session"
    );
    expect(fakePublicApi.count(START)).toBe(0);
  });

  it("resumes an open Workout Session with no active Plan, on its own screen once its Workout is gone", async () => {
    seedOpenSession(null);
    await mount();

    expect(screen.queryByRole("button", { name: "Create a Plan" })).toBeNull();
    await fireEvent.press(button("Resume Workout"));

    expect(mockPush).toHaveBeenCalledWith("/workout-sessions/open-session");
  });

  it.each([
    ["no Plan", []],
    ["only inactive Plans", [{ ...structuredClone(PLAN), is_active: false }]],
    [
      "an active Plan with no Workout",
      [{ ...structuredClone(PLAN), workouts: [] }],
    ],
  ])("offers Create a Plan with %s", async (_, plans: SeedPlan[]) => {
    for (const plan of plans) {
      backend.seedPlan(plan);
    }
    await mount();

    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
    await fireEvent.press(button("Create a Plan"));

    expect(mockPush).toHaveBeenCalledWith("/planner");
  });

  it("isn't shown once a Workout Session is finished, even one with nothing logged", async () => {
    backend.seedPlan(structuredClone(PLAN));
    backend.seed({ exercises: [], finished: true, id: "empty-completion" });
    await mount();

    expect(screen.getByText("Workout empty-completion")).toBeTruthy();
    expect(screen.queryByTestId("history-empty")).toBeNull();
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });
});

describe("Starting from the empty History", () => {
  beforeEach(() => {
    backend.seedPlan(structuredClone(PLAN));
  });

  it("alerts on a failed Start and stays on History", async () => {
    fakePublicApi.failNext(START, "network");
    await mount();

    await fireEvent.press(button("Start Upper A"));
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Check your connection and try again."
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(button("Start Upper A")).toBeTruthy();
  });

  it("gives the wait when Start is rate limited", async () => {
    fakePublicApi.failNext(START, { retryAfterSeconds: 12, status: 429 });
    await mount();

    await fireEvent.press(button("Start Upper A"));
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't start workout",
      "Too many requests: please try again in 12 s."
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("can't be pressed again while Start is in flight, and opens one Workout Session", async () => {
    const resumeStart = fakePublicApi.pause(START);
    await mount();

    await fireEvent.press(button("Start Upper A"));
    // The mutation reports itself pending on its next tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(button("Start Upper A")).toBeDisabled();
    await fireEvent.press(button("Start Upper A"));

    resumeStart();
    await settle(queryClient);

    expect(fakePublicApi.count(START)).toBe(1);
    expect(
      backend.sessions.filter((session) => session.finished_at === null)
    ).toHaveLength(1);
  });

  it("turns into Resume when another Workout was started meanwhile, without the alert", async () => {
    await mount();
    // Started elsewhere (MCP, another device) after History was read.
    seedOpenSession("workout-2", "Lower A");

    await fireEvent.press(button("Start Upper A"));
    await settle(queryClient);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      backend.sessions.filter((session) => session.finished_at === null)
    ).toHaveLength(1);
    expect(button("Resume Lower A")).toBeTruthy();
  });
});

/** Each read the empty History waits on, held or failed on its own. */
const READS = [
  {
    fail: () => fakePublicApi.failNext(HISTORY, { status: 500 }),
    name: "History",
    pause: () => fakePublicApi.pause(HISTORY),
  },
  {
    fail: () => backend.failNext("workout_sessions", "select"),
    name: "the open Workout Session",
    pause: () => backend.pause("workout_sessions", "select"),
  },
  {
    fail: () => backend.failNext("plans", "select"),
    name: "the Plans",
    pause: () => backend.pause("plans", "select"),
  },
];

describe("The empty History's reads", () => {
  beforeEach(() => {
    backend.seedPlan(structuredClone(PLAN));
  });

  it.each(READS)(
    "show a spinner and no action while $name loads",
    async ({ pause }) => {
      const resume = pause();
      queryClient = createTestQueryClient();
      await render(
        <QueryClientProvider client={queryClient}>
          <HistoryScreen />
        </QueryClientProvider>
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(screen.queryByTestId("history-empty")).toBeNull();
      expect(screen.queryByRole("button", { name: ACTION })).toBeNull();

      resume();
      await settle(queryClient);
      expect(button("Start Upper A")).toBeTruthy();
    }
  );

  it.each(READS)(
    "show the error with Try Again, and no action, when $name fails",
    async ({ fail }) => {
      fail();
      await mount();

      expect(
        screen.getByText(
          "Couldn't load your workouts. Check your connection and try again."
        )
      ).toBeTruthy();
      expect(screen.queryByTestId("history-empty")).toBeNull();
      expect(screen.queryByRole("button", { name: ACTION })).toBeNull();

      await fireEvent.press(button("Try Again"));
      await settle(queryClient);

      expect(button("Start Upper A")).toBeTruthy();
    }
  );
});

/** Pulls the History list down, as the User would to refresh it. */
const pullToRefresh = async () => {
  const { refreshControl } = screen.getByTestId("history-list").props;
  await act(() => refreshControl.props.onRefresh());
};

describe("Refreshing the empty History", () => {
  it("reads the open Workout Session and the Plans again, so the action follows them", async () => {
    await mount();
    expect(button("Create a Plan")).toBeTruthy();

    // A Plan made elsewhere (Arnold, MCP) since History was read.
    backend.seedPlan(structuredClone(PLAN));
    await pullToRefresh();
    await settle(queryClient);

    expect(button("Start Upper A")).toBeTruthy();

    // And a Workout started elsewhere since.
    seedOpenSession("workout-2", "Lower A");
    await pullToRefresh();
    await settle(queryClient);

    expect(button("Resume Lower A")).toBeTruthy();
  });
});

describe("The empty History on a Ukrainian device", () => {
  it.each([
    ["Start", () => undefined, "Почати «Upper A»"],
    ["Resume", () => seedOpenSession("workout-1"), "Продовжити «Upper A»"],
  ])("offers %s in Ukrainian", async (_, seed, label) => {
    backend.seedPlan(structuredClone(PLAN));
    seed();
    setDeviceLanguages(["uk-UA"]);
    await mount((node) => <InAppLanguage>{node}</InAppLanguage>);

    expect(screen.getByText("Ще немає тренувань")).toBeTruthy();
    expect(button(label)).toBeTruthy();
  });

  it("names the next Workout's Plan and Exercise count in Ukrainian", async () => {
    backend.seedPlan(structuredClone(PLAN));
    setDeviceLanguages(["uk-UA"]);
    await mount((node) => <InAppLanguage>{node}</InAppLanguage>);

    expect(
      screen.getByText("Далі в «Hypertrophy Builder» · 2 вправи")
    ).toBeTruthy();
  });

  it("offers Create a Plan in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await mount((node) => <InAppLanguage>{node}</InAppLanguage>);

    expect(button("Створити план")).toBeTruthy();
  });
});
