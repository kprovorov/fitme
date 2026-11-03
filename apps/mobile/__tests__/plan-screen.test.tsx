/**
 * The Plans list and a Plan's screen, read through the Public API, and
 * activating and deleting a Plan from it, on the mounted-screen seam: the
 * real screens, Plan lists, hooks and Public API client, with the client's
 * `fetch` swapped for the fake Public API and Supabase for the in-memory
 * backend under it (both from `test-utils/`), so a Plan read from Supabase
 * shows in `backend.count("plans", "select")`. The header is rendered as its
 * title and plain buttons and `Alert.alert` is answered by pressing one of
 * its buttons, as the User would.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert, type AlertButton, Pressable, Text, View } from "react-native";
import PlanScreen from "~/app/plans/[planId]/index";
import PlansScreen from "~/app/plans/index";
import PlansListView from "~/components/views/plan-list-view";
import { usePlanQuery, usePlanSummariesQuery } from "~/hooks/queries/plans";
import { segmentClient } from "~/lib/segment";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockPlanId = { current: "plan-1" };

interface MockHeaderItem {
  label: string;
  menu?: { items: MockHeaderItem[] };
  onPress?: () => void;
}

// The header's items as buttons, the menus' items flattened. Top-level (and
// `mock`-prefixed, so the factory may use it) because the React Compiler
// rewrites components declared inside a `jest.mock` factory.
interface MockHeaderOptions {
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

const MockHeader = ({ options }: { options: MockHeaderOptions }) => {
  const items = (options.unstable_headerRightItems?.() ?? []).flatMap(
    (item) => item.menu?.items ?? [item]
  );
  return (
    <>
      {options.title ? (
        <Text accessibilityRole="header">{options.title}</Text>
      ) : null}
      {items.map((item) => (
        <Pressable key={item.label} onPress={item.onPress}>
          <Text>{item.label}</Text>
        </Pressable>
      ))}
    </>
  );
};

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeader {...props} />
    ),
  },
  useLocalSearchParams: () => ({ planId: mockPlanId.current }),
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    dismissTo: mockDismissTo,
    push: jest.fn(),
  }),
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Workout cards) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: false }),
}));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const ACTIVATE = "POST /v1/plans/{id}/activate";
const DELETE = "DELETE /v1/plans/{id}";
const GET_PLAN = "GET /v1/plans/{id}";
const LIST_PLANS = "GET /v1/plans";

const SEEDED_PLAN_NAME = /^(Hypertrophy|Strength)$/;
const LIST_LOAD_ERROR = /Couldn't load your plans/;
const PLAN_LOAD_ERROR = /Couldn't load this plan/;
const WORKOUT_CARD = /Day, /;

// The stand-in `jest.mock("~/lib/segment")` installs.
const track = segmentClient.track as unknown as jest.Mock;

let queryClient = createTestQueryClient();

// The active Plan's name, from the Plans list's read.
const ActivePlanName = () => {
  const { data: plans } = usePlanSummariesQuery();
  const activePlan = plans?.find((plan) => plan.is_active);
  return activePlan ? <Text>{activePlan.name}</Text> : null;
};

// Whether another Plan's screen, open behind this one, shows it active.
const PlanActivity = ({ id }: { id: string }) => {
  const { data: plan } = usePlanQuery({ variables: { id } });
  if (!plan) {
    return null;
  }
  return <Text>{`${id} ${plan.is_active ? "active" : "inactive"}`}</Text>;
};

/** The Plan screen, with `list` beside it (`beside()`). */
const mount = async (list: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <PlanScreen />
      <View testID="list">{list}</View>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const beside = () => within(screen.getByTestId("list"));

/** What the Public API was asked to change, reads left out. */
const writes = () =>
  fakePublicApi.requests
    .filter(({ route }) => !route.startsWith("GET "))
    .map(({ path }) => path);

/** Plans read from Supabase: none, every Plan read goes through the API. */
const supabasePlanReads = () => backend.count("plans", "select");

const pullToRefresh = async (testID: string) => {
  const { refreshControl } = screen.getByTestId(testID).props;
  await act(() => refreshControl.props.onRefresh());
  await settle(queryClient);
};

const alerts = () =>
  (Alert.alert as jest.Mock).mock.calls as [string, string, AlertButton[]?][];

/** Picks `item` in the header menu and presses `button` in its alert. */
const choose = async (item: string, button: string) => {
  await fireEvent.press(screen.getByText(item));
  const buttons = alerts().at(-1)?.[2] ?? [];
  const pressed = buttons.find((candidate) => candidate.text === button);
  if (!pressed?.onPress) {
    throw new Error(`No "${button}" button in the last alert`);
  }
  pressed.onPress();
  await settle(queryClient);
};

/** The supabase write the old path made; it may not happen any more. */
const supabaseWrites = () => backend.count("plans", "update");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  mockPlanId.current = "plan-1";
  backend.seedPlan({ id: "plan-1", name: "Strength", workouts: [] });
  backend.seedPlan({
    id: "plan-2",
    is_active: true,
    name: "Hypertrophy",
    workouts: [],
  });
});

describe("The Plans list", () => {
  const mountList = async () => {
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <PlansScreen />
      </QueryClientProvider>
    );
    await settle(queryClient);
  };

  it("shows the User's live Plans, newest first, with their options", async () => {
    backend.seedPlan({
      deleted_at: "2026-10-20T09:00:00.000Z",
      id: "plan-old",
      name: "Archived",
      workouts: [],
    });
    backend.seedPlan({
      id: "plan-theirs",
      name: "Someone Else's",
      user_id: "user_other",
      workouts: [],
    });
    await mountList();

    expect(
      screen.getAllByText(SEEDED_PLAN_NAME).map(({ props }) => props.children)
    ).toEqual(["Hypertrophy", "Strength"]);
    expect(screen.getByText("About Strength")).toBeTruthy();
    expect(screen.getAllByText("Strength & Performance")).toHaveLength(2);
    expect(screen.getAllByText("Intermediate")).toHaveLength(2);
    expect(screen.getAllByText("3× per week")).toHaveLength(2);
    expect(screen.getAllByText("Gym")).toHaveLength(2);
    expect(screen.queryByText("Archived")).toBeNull();
    expect(screen.queryByText("Someone Else's")).toBeNull();
    expect(screen.getByText("Create New Workout Plan")).toBeTruthy();
    expect(fakePublicApi.count(LIST_PLANS)).toBe(1);
    expect(supabasePlanReads()).toBe(0);
  });

  it("keeps the Plans shown when a refresh fails", async () => {
    await mountList();
    fakePublicApi.failNext(LIST_PLANS, { status: 500 });

    await pullToRefresh("plans-screen");

    expect(fakePublicApi.count(LIST_PLANS)).toBe(2);
    expect(screen.getByText("Strength")).toBeTruthy();
    expect(screen.queryByText(LIST_LOAD_ERROR)).toBeNull();
  });

  it("shows the load error with nothing read yet, and tries again", async () => {
    fakePublicApi.failNext(LIST_PLANS, "network");
    await mountList();

    expect(
      screen.getByText(
        "Couldn't load your plans. Check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Strength")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Strength")).toBeTruthy();
    expect(supabasePlanReads()).toBe(0);
  });

  it("tells the User how long to wait when rate limited", async () => {
    fakePublicApi.failNext(LIST_PLANS, { retryAfterSeconds: 12, status: 429 });
    await mountList();

    expect(
      screen.getByText("Too many requests: please try again in 12 s.")
    ).toBeTruthy();
  });
});

describe("A Plan's screen", () => {
  beforeEach(() => {
    backend.seedPlan({
      id: "plan-3",
      name: "Push Pull",
      workouts: [
        {
          exercises: [
            { sets: 3, slug: "dips" },
            { sets: 3, slug: "push-ups" },
          ],
          id: "workout-b",
          name: "Pull Day",
          order: 2,
        },
        {
          exercises: [{ sets: 3, slug: "dips" }],
          id: "workout-a",
          name: "Push Day",
          order: 1,
        },
      ],
    });
    mockPlanId.current = "plan-3";
  });

  it("shows its name and its Workouts in rotation order", async () => {
    await mount(null);

    expect(screen.getByRole("header").props.children).toBe("Push Pull");
    expect(
      screen
        .getAllByRole("button", { name: WORKOUT_CARD })
        .map(({ props }) => props.accessibilityLabel)
    ).toEqual(["Push Day, 1 Exercise", "Pull Day, 2 Exercises"]);
    expect(screen.getByText("Activate Plan")).toBeTruthy();
    expect(fakePublicApi.requests.map(({ path }) => path)).toContain(
      "/v1/plans/plan-3"
    );
    expect(supabasePlanReads()).toBe(0);
  });

  it("says a deleted Plan no longer exists, with no actions", async () => {
    backend.plans[2].deleted_at = "2026-10-20T09:00:00.000Z";
    await mount(null);

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByText("Push Day")).toBeNull();
    expect(screen.queryByText("Activate Plan")).toBeNull();
    expect(screen.queryByText("Archive")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Go Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says another User's Plan no longer exists", async () => {
    backend.plans[2].user_id = "user_other";
    await mount(null);

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByText("Push Day")).toBeNull();
  });

  it("shows the Plan gone once a refresh finds it deleted", async () => {
    await mount(null);
    backend.plans[2].deleted_at = "2026-10-20T09:00:00.000Z";

    await pullToRefresh("plan-screen");

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByText("Push Day")).toBeNull();
  });

  it("keeps the Plan shown when a refresh fails", async () => {
    await mount(null);
    fakePublicApi.failNext(GET_PLAN, { status: 500 });

    await pullToRefresh("plan-screen");

    expect(fakePublicApi.count(GET_PLAN)).toBe(2);
    expect(screen.getByText("Push Day")).toBeTruthy();
    expect(screen.queryByText(PLAN_LOAD_ERROR)).toBeNull();
  });

  it("shows the load error with nothing read yet, and tries again", async () => {
    fakePublicApi.failNext(GET_PLAN, "network");
    await mount(null);

    expect(
      screen.getByText(
        "Couldn't load this plan. Check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Activate Plan")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Push Day")).toBeTruthy();
  });

  it("tells the User how long to wait when its read is rate limited", async () => {
    fakePublicApi.failNext(GET_PLAN, { retryAfterSeconds: 12, status: 429 });
    await mount(null);

    expect(
      screen.getByText("Too many requests: please try again in 12 s.")
    ).toBeTruthy();
  });
});

describe("Activating a Plan", () => {
  it("makes it the active Plan through the API, every other one inactive", async () => {
    await mount(<ActivePlanName />);
    expect(beside().getByText("Hypertrophy")).toBeTruthy();

    await choose("Activate Plan", "Activate");

    expect(writes()).toEqual(["/v1/plans/plan-1/activate"]);
    expect(beside().getByText("Strength")).toBeTruthy();
    expect(beside().queryByText("Hypertrophy")).toBeNull();
    expect(backend.plans.map((plan) => plan.is_active)).toEqual([true, false]);
    expect(supabasePlanReads()).toBe(0);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledWith("Plan Activated", {
      plan_id: "plan-1",
    });
  });

  it("shows the activated Plan from the answer, without reading it again", async () => {
    await mount(null);
    expect(fakePublicApi.count(GET_PLAN)).toBe(1);

    await choose("Activate Plan", "Activate");

    expect(fakePublicApi.count(GET_PLAN)).toBe(1);
    expect(
      queryClient.getQueryData(usePlanQuery.getKey({ id: "plan-1" }))
    ).toMatchObject({ id: "plan-1", is_active: true, weight_unit: "kg" });
    // The screen holds the answer: the active Plan can't be archived.
    await fireEvent.press(screen.getByText("Archive"));
    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Archive Plan",
      "You cannot archive an active plan. You should have at least one active plan at all times.",
    ]);
  });

  it("keeps the activated Plan when an older read of it lands afterwards", async () => {
    await mount(null);
    // A pull to refresh whose answer, given before the activation committed,
    // is still on its way.
    const resume = fakePublicApi.pause(GET_PLAN);
    const { refreshControl } = screen.getByTestId("plan-screen").props;
    let refreshed: Promise<unknown> = Promise.resolve();
    await act(() => {
      refreshed = refreshControl.props.onRefresh();
    });
    await until(() => fakePublicApi.count(GET_PLAN) === 2);

    await fireEvent.press(screen.getByText("Activate Plan"));
    alerts()
      .at(-1)?.[2]
      ?.find(({ text }) => text === "Activate")
      ?.onPress?.();
    await until(
      () =>
        fakePublicApi.count(ACTIVATE) === 1 && queryClient.isMutating() === 0
    );
    // The held read answers as the Plan was before activation.
    backend.plans[0].is_active = false;
    resume();
    await act(() => refreshed);
    await settle(queryClient);
    backend.plans[0].is_active = true;

    expect(
      queryClient.getQueryData(usePlanQuery.getKey({ id: "plan-1" }))
    ).toMatchObject({ id: "plan-1", is_active: true });
    await fireEvent.press(screen.getByText("Archive"));
    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Archive Plan",
      "You cannot archive an active plan. You should have at least one active plan at all times.",
    ]);
  });

  it("never shows an activation's late answer to the next User who signs in", async () => {
    await mount(null);
    const resumeActivate = fakePublicApi.pause(ACTIVATE);
    await fireEvent.press(screen.getByText("Activate Plan"));
    alerts()
      .at(-1)?.[2]
      ?.find(({ text }) => text === "Activate")
      ?.onPress?.();
    await until(() => fakePublicApi.count(ACTIVATE) === 1);
    // Clearing the cache drops the activation from it, not its callbacks.
    const [activating] = queryClient.getMutationCache().getAll();

    // Signed out before the answer (AuthSync clears the cache), and another
    // User signs in, whose read of that Plan is on its way.
    await screen.unmount();
    queryClient.clear();
    signInAs("user_next");
    const planReads = fakePublicApi.count(GET_PLAN);
    const resumeRead = fakePublicApi.pause(GET_PLAN);
    const nextUsersRead = queryClient.fetchQuery(
      usePlanQuery.getFetchOptions({ id: "plan-1" })
    );
    await until(() => fakePublicApi.count(GET_PLAN) === planReads + 1);
    const listReads = fakePublicApi.count(LIST_PLANS);

    resumeActivate();
    await until(() => activating?.state.status === "success");

    // The previous User's answer isn't shown, nor read again, for the next.
    expect(
      queryClient.getQueryData(usePlanQuery.getKey({ id: "plan-1" }))
    ).toBeUndefined();
    expect(fakePublicApi.count(LIST_PLANS)).toBe(listReads);
    // Their read isn't cancelled.
    resumeRead();
    await expect(nextUsersRead).resolves.toMatchObject({ id: "plan-1" });
    expect(fakePublicApi.count(GET_PLAN)).toBe(planReads + 1);
  });

  it("reads the Plan that stopped being active again", async () => {
    await mount(<PlanActivity id="plan-2" />);
    expect(beside().getByText("plan-2 active")).toBeTruthy();

    await choose("Activate Plan", "Activate");

    expect(beside().getByText("plan-2 inactive")).toBeTruthy();
  });

  it("shows the error for a missing Plan and changes nothing", async () => {
    fakePublicApi.failNext(ACTIVATE, { code: "not_found", status: 404 });
    await mount(<ActivePlanName />);

    await choose("Activate Plan", "Activate");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Activate Plan",
      "This plan no longer exists.",
    ]);
    expect(beside().getByText("Hypertrophy")).toBeTruthy();
    expect(supabasePlanReads()).toBe(0);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("tells the User how long to wait when rate limited", async () => {
    fakePublicApi.failNext(ACTIVATE, { retryAfterSeconds: 12, status: 429 });
    await mount(<ActivePlanName />);

    await choose("Activate Plan", "Activate");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Activate Plan",
      "Too many requests: please try again in 12 s.",
    ]);
    expect(track).not.toHaveBeenCalled();
  });
});

describe("Deleting a Plan", () => {
  it("removes it from the lists through the API", async () => {
    await mount(<PlansListView />);
    expect(beside().getByText("Strength")).toBeTruthy();

    await choose("Archive", "Archive");

    expect(writes()).toEqual(["/v1/plans/plan-1"]);
    expect(beside().queryByText("Strength")).toBeNull();
    expect(beside().getByText("Hypertrophy")).toBeTruthy();
    expect(supabasePlanReads()).toBe(0);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledWith("Plan Deleted", {
      plan_id: "plan-1",
    });
  });

  it("shows the Plan gone once deleted", async () => {
    await mount(null);

    await choose("Archive", "Archive");

    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  it("shows the error when the connection fails and never falls back", async () => {
    fakePublicApi.failNext(DELETE, "network");
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Archive Plan",
      "Please check your connection and try again.",
    ]);
    expect(beside().getByText("Strength")).toBeTruthy();
    expect(supabaseWrites()).toBe(0);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("shows the error for a missing Plan", async () => {
    fakePublicApi.failNext(DELETE, { code: "not_found", status: 404 });
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Archive Plan",
      "This plan no longer exists.",
    ]);
    expect(supabaseWrites()).toBe(0);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("tells the User how long to wait when rate limited", async () => {
    fakePublicApi.failNext(DELETE, { retryAfterSeconds: 12, status: 429 });
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Archive Plan",
      "Too many requests: please try again in 12 s.",
    ]);
    expect(beside().getByText("Strength")).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("shows the error for a server failure", async () => {
    fakePublicApi.failNext(DELETE, { status: 500 });
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.[0]).toBe("Couldn't Archive Plan");
    expect(beside().getByText("Strength")).toBeTruthy();
    expect(track).not.toHaveBeenCalled();
  });

  it("won't archive the active Plan", async () => {
    mockPlanId.current = "plan-2";
    await mount(<PlansListView />);

    await fireEvent.press(screen.getByText("Archive"));

    expect(alerts().at(-1)?.[0]).toBe("Archive Plan");
    expect(alerts().at(-1)?.[2]).toBeUndefined();
    expect(writes()).toEqual([]);
  });
});

describe("Pulling the Plan screen to refresh", () => {
  const LIST = "GET /v1/workout-sessions";
  /** The open Workout Session's read of the list. */
  const IN_PROGRESS = { limit: "1", status: "in_progress" };
  const IN_PROGRESS_HINT = "Opens the workout in progress";

  beforeEach(() => {
    mockPlanId.current = "plan-3";
    backend.seedPlan({
      id: "plan-3",
      name: "Push Pull",
      workouts: [
        {
          exercises: [{ sets: 3, slug: "dips" }],
          id: "workout-a",
          name: "Push Day",
        },
      ],
    });
  });

  /** Push Day's Workout Session, opened elsewhere (MCP, another device). */
  const openPushDayElsewhere = () => {
    backend.sessions.push({
      finished_at: null,
      id: "open-session",
      plan_id: "plan-3",
      started_at: new Date(Date.now() - 60_000).toISOString(),
      workout_id: "workout-a",
      workoutName: "Push Day",
    });
  };

  it("shows a Workout Session started elsewhere on its Workout's card", async () => {
    await mount(null);
    expect(screen.queryByText("To Workout")).toBeNull();

    openPushDayElsewhere();
    await pullToRefresh("plan-screen");

    expect(screen.getByText("To Workout")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Push Day, 1 Exercise" }).props
        .accessibilityHint
    ).toBe(IN_PROGRESS_HINT);
  });

  it("recovers from a failed first read of the open Workout Session", async () => {
    openPushDayElsewhere();
    fakePublicApi.failNext(LIST, { status: 500 }, IN_PROGRESS);
    await mount(null);
    expect(screen.queryByText("To Workout")).toBeNull();

    await pullToRefresh("plan-screen");

    expect(screen.getByText("To Workout")).toBeTruthy();
  });
});
