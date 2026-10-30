/**
 * Activating and deleting a Plan from the Plan screen, on the mounted-screen
 * seam: the real screen, Plan lists, hooks and Public API client, with
 * Supabase swapped for the in-memory backend and the client's `fetch` for the
 * fake Public API over the same rows (both from `test-utils/`). The header
 * menu is rendered as plain buttons and `Alert.alert` is answered by pressing
 * one of its buttons, as the User would.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert, type AlertButton, Pressable, Text } from "react-native";
import PlanScreen from "~/app/plans/[planId]/index";
import PlansListView from "~/components/views/plan-list-view";
import { usePlansQuery } from "~/hooks/queries/plans";
import { segmentClient } from "~/lib/segment";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

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
const MockHeader = ({
  options,
}: {
  options: { unstable_headerRightItems?: () => MockHeaderItem[] };
}) => {
  const items = (options.unstable_headerRightItems?.() ?? []).flatMap(
    (item) => item.menu?.items ?? [item]
  );
  return (
    <>
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
    Screen: (props: {
      options: { unstable_headerRightItems?: () => MockHeaderItem[] };
    }) => <MockHeader {...props} />,
  },
  useLocalSearchParams: () => ({ planId: mockPlanId.current }),
  useRouter: () => ({ dismissTo: mockDismissTo }),
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
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const ACTIVATE = "POST /v1/plans/{id}/activate";
const DELETE = "DELETE /v1/plans/{id}";

// The stand-in `jest.mock("~/lib/segment")` installs.
const track = segmentClient.track as unknown as jest.Mock;

let queryClient = createTestQueryClient();

// The active Plan's name, as the Workout tab's Plan header reads it.
const ActivePlanName = () => {
  const { data: plans } = usePlansQuery();
  const activePlan = plans?.find((plan) => plan.is_active);
  return activePlan ? <Text>{activePlan.name}</Text> : null;
};

const mount = async (list: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <PlanScreen />
      {list}
    </QueryClientProvider>
  );
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

describe("Activating a Plan", () => {
  it("makes it the active Plan through the API, every other one inactive", async () => {
    await mount(<ActivePlanName />);
    expect(screen.getByText("Hypertrophy")).toBeTruthy();

    await choose("Activate Plan", "Activate");

    expect(fakePublicApi.requests.map(({ path }) => path)).toEqual([
      "/v1/plans/plan-1/activate",
    ]);
    expect(screen.getByText("Strength")).toBeTruthy();
    expect(screen.queryByText("Hypertrophy")).toBeNull();
    expect(backend.plans.map((plan) => plan.is_active)).toEqual([true, false]);
    expect(supabaseWrites()).toBe(0);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledWith("Plan Activated", {
      plan_id: "plan-1",
    });
  });

  it("shows the error for a missing Plan and changes nothing", async () => {
    mockPlanId.current = "plan-1";
    fakePublicApi.failNext(ACTIVATE, { code: "not_found", status: 404 });
    await mount(<ActivePlanName />);

    await choose("Activate Plan", "Activate");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Activate Plan",
      "This plan no longer exists.",
    ]);
    expect(screen.getByText("Hypertrophy")).toBeTruthy();
    expect(supabaseWrites()).toBe(0);
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
    expect(screen.getByText("Strength")).toBeTruthy();

    await choose("Archive", "Archive");

    expect(fakePublicApi.requests.map(({ path }) => path)).toEqual([
      "/v1/plans/plan-1",
    ]);
    expect(screen.queryByText("Strength")).toBeNull();
    expect(screen.getByText("Hypertrophy")).toBeTruthy();
    expect(supabaseWrites()).toBe(0);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledWith("Plan Deleted", {
      plan_id: "plan-1",
    });
  });

  it("succeeds again for a Plan already deleted", async () => {
    await mount(<PlansListView />);
    await choose("Archive", "Archive");
    mockDismissTo.mockClear();

    await choose("Archive", "Archive");

    expect(fakePublicApi.count(DELETE)).toBe(2);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("shows the error when the connection fails and never falls back", async () => {
    fakePublicApi.failNext(DELETE, "network");
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Couldn't Archive Plan",
      "Please check your connection and try again.",
    ]);
    expect(screen.getByText("Strength")).toBeTruthy();
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

  it("shows the error for a server failure", async () => {
    fakePublicApi.failNext(DELETE, { status: 500 });
    await mount(<PlansListView />);

    await choose("Archive", "Archive");

    expect(alerts().at(-1)?.[0]).toBe("Couldn't Archive Plan");
    expect(screen.getByText("Strength")).toBeTruthy();
    expect(track).not.toHaveBeenCalled();
  });

  it("won't archive the active Plan", async () => {
    mockPlanId.current = "plan-2";
    await mount(<PlansListView />);

    await fireEvent.press(screen.getByText("Archive"));

    expect(alerts().at(-1)?.[0]).toBe("Archive Plan");
    expect(alerts().at(-1)?.[2]).toBeUndefined();
    expect(fakePublicApi.requests).toEqual([]);
  });
});
