/**
 * A Plan's screen with the Plans redesign flag on (Figma "Plan Detail
 * Redesign"), on the mounted-screen seam: the real screen, hooks and Public
 * API client, with the client's `fetch` swapped for the fake Public API
 * (`test-utils/`), in English and Ukrainian. The header is rendered as its
 * title and plain buttons; a `Link` as its child under a View naming where it
 * goes. The "…" menu's items are rendered as `menuitem`s under it, and
 * `Alert.alert` is answered by pressing one of the buttons it was given.
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
import { NotificationFeedbackType } from "expo-haptics";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { Alert, Pressable, Text } from "react-native";
import type { AlertButton } from "react-native";

import PlanScreen from "~/app/plans/[planId]/index";
import { EXERCISE_IMAGE_PLACEHOLDER } from "~/components/exercises/exercise-image";
import {
  PLAN_DETAIL,
  PLAN_DETAIL_LOADING,
} from "~/components/plans/plan-detail-view";
import { PLAN_WORKOUT_MORE } from "~/components/plans/plan-workout-row";
import { setPlansRedesignEnabled } from "~/lib/feature-flags";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import type { SeedPlan } from "~/test-utils/fake-public-api";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";
import { firedHaptics } from "~/test-utils/haptics-stub";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
const mockPlanId = { current: "plan-1" };

interface MockMenuItem {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}

interface MockHeaderItem {
  label: string;
  menu?: { items: MockMenuItem[] };
  onPress?: () => void;
}

interface MockHeaderOptions {
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

// Top-level (and `mock`-prefixed, so the factory may use it) because the
// React Compiler rewrites components declared inside a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) => (
  <>
    {options.title ? (
      <Text accessibilityRole="header">{options.title}</Text>
    ) : null}
    {(options.unstable_headerRightItems?.() ?? []).map((item) => (
      <Fragment key={item.label}>
        <Pressable onPress={item.onPress}>
          <Text>{item.label}</Text>
        </Pressable>
        {/* A menu's items, always shown: a destructive one says so in its
            hint. */}
        {item.menu?.items.map((menuItem) => (
          <Pressable
            accessibilityHint={menuItem.destructive ? "destructive" : undefined}
            accessibilityLabel={menuItem.label}
            accessibilityRole="menuitem"
            accessibilityState={{ disabled: !!menuItem.disabled }}
            disabled={!!menuItem.disabled}
            key={menuItem.label}
            onPress={menuItem.onPress}
          >
            <Text>{menuItem.label}</Text>
          </Pressable>
        ))}
      </Fragment>
    ))}
  </>
);

const MockLink = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return <View testID={`link:${href}`}>{children}</View>;
};

jest.mock("expo-router", () => ({
  Link: (props: { children: ReactNode; href: string }) => (
    <MockLink {...props} />
  ),
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeader {...props} />
    ),
  },
  useLocalSearchParams: () => ({ planId: mockPlanId.current }),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismissTo: mockDismissTo,
    push: mockPush,
  }),
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const GET_PLAN = "GET /v1/plans/{id}";
const HOUR_MS = 3_600_000;
const ELAPSED = /^01:0[23]:\d\d$/u;

/** A Workout of `count` Exercises, two sets each. */
const workoutOf = (id: string, name: string, count: number) => ({
  exercises: Array.from({ length: count }, (_, index) => ({
    sets: 2,
    slug: `exercise-${index + 1}`,
  })),
  id,
  name,
});

const seedActivePlan = (overrides: Partial<SeedPlan> = {}) => {
  backend.seedPlan({
    description: "A 4-day upper/lower split focused on progressive overload.",
    experience_level: "intermediate",
    frequency: 4,
    goal: "muscle-gain",
    id: "plan-1",
    is_active: true,
    name: "Hypertrophy Builder",
    place: "gym",
    workout_duration: 60,
    workouts: [
      workoutOf("workout-1", "Upper A", 8),
      workoutOf("workout-2", "Lower A", 5),
      workoutOf("workout-3", "Rest Day", 0),
    ],
    ...overrides,
  });
};

/** The User's open Workout Session, of `workoutId`, started `ago` ms ago. */
const seedOpenSession = (workoutId: string, ago = 0) => {
  backend.sessions.push({
    finished_at: null,
    id: "session-1",
    plan_id: "plan-1",
    started_at: new Date(Date.now() - ago).toISOString(),
    workout_id: workoutId,
    workoutName: "Upper A",
  });
};

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <PlanScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const row = (name: RegExp | string) => screen.getByRole("button", { name });

/** The Workout row's own Pressable and everything above it in its View. */
const rowArea = (name: RegExp | string) => {
  const pressable = row(name);
  const area = pressable.parent?.parent;

  if (!area) {
    throw new Error(`No row for ${String(name)}`);
  }

  return within(area);
};

const pullToRefresh = async () => {
  const { refreshControl } = screen.getByTestId("plan-screen").props;
  await act(() => refreshControl.props.onRefresh());
  await settle(queryClient);
};

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  jest.clearAllMocks();
  backend.reset();
  setPlansRedesignEnabled(true);
  mockPlanId.current = "plan-1";
});

describe("the redesigned Plan screen, in English", () => {
  it("shows the hero: Active badge, name, every detail and the description", async () => {
    seedActivePlan();
    await mount();

    const detail = within(screen.getByTestId(PLAN_DETAIL));
    expect(detail.getByText("Active")).toBeTruthy();
    expect(detail.getByText("Hypertrophy Builder")).toBeTruthy();

    for (const meta of [
      "Gain Muscle",
      "Intermediate",
      "4× per week",
      "60 min",
      "Gym",
    ]) {
      expect(detail.getByText(meta)).toBeTruthy();
    }

    expect(
      detail.getByText(
        "A 4-day upper/lower split focused on progressive overload."
      )
    ).toBeTruthy();
    expect(detail.getByText("Workouts")).toBeTruthy();
    // No title in the header: the Large Title is the Plan's name.
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.getByText("More options")).toBeTruthy();
  });

  it("leaves out the Active badge on an inactive Plan, and every unset detail", async () => {
    seedActivePlan({
      description: null,
      experience_level: null,
      goal: null,
      is_active: false,
      place: null,
      workout_duration: null,
    });
    await mount();

    const detail = within(screen.getByTestId(PLAN_DETAIL));
    expect(detail.queryByText("Active")).toBeNull();
    expect(detail.getByText("4× per week")).toBeTruthy();

    for (const meta of ["Gain Muscle", "Intermediate", "60 min", "Gym"]) {
      expect(detail.queryByText(meta)).toBeNull();
    }
  });

  it("lists the Workouts in rotation order, each with its count and chevron row", async () => {
    seedActivePlan();
    await mount();

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel)
        .filter(Boolean)
    ).toEqual([
      "Upper A, 8 exercises",
      "Lower A, 5 exercises",
      "Rest Day, 0 exercises",
    ]);
  });

  it("shows four thumbnails and +N past five Exercises, all of up to five", async () => {
    seedActivePlan();
    await mount();

    const upper = rowArea("Upper A, 8 exercises");
    expect(
      upper.getAllByTestId(EXERCISE_IMAGE_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toHaveLength(4);
    expect(
      within(upper.getByTestId(PLAN_WORKOUT_MORE)).getByText("+4")
    ).toBeTruthy();

    const lower = rowArea("Lower A, 5 exercises");
    expect(
      lower.getAllByTestId(EXERCISE_IMAGE_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toHaveLength(5);
    expect(lower.queryByTestId(PLAN_WORKOUT_MORE)).toBeNull();
  });

  it("shows a Workout without Exercises as a plain row reading 0 exercises", async () => {
    seedActivePlan();
    await mount();

    const rest = rowArea("Rest Day, 0 exercises");
    expect(rest.getByText("0 exercises")).toBeTruthy();
    expect(
      rest.queryAllByTestId(EXERCISE_IMAGE_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);
  });

  it("opens a Workout's screen from its row, active Plan or not", async () => {
    seedActivePlan({ is_active: false });
    await mount();

    await fireEvent.press(row("Lower A, 5 exercises"));

    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/workout-2");
  });

  it("keeps the open session's timer bar on its own Workout's row", async () => {
    seedActivePlan();
    seedOpenSession("workout-1", HOUR_MS + 2 * 60_000);
    await mount();

    expect(
      screen.getByTestId(
        "link:/plans/plan-1/workouts/workout-1/sessions/session-1"
      )
    ).toBeTruthy();
    expect(screen.getAllByText("To Workout")).toHaveLength(1);
    expect(
      rowArea("Upper A, 8 exercises").getByText("To Workout")
    ).toBeTruthy();
    await expect(
      screen.findByText(ELAPSED, {}, { timeout: 3000 })
    ).resolves.toBeTruthy();

    // The row itself still opens the Workout screen.
    await fireEvent.press(row("Upper A, 8 exercises"));
    expect(mockPush).toHaveBeenCalledWith("/plans/plan-1/workouts/workout-1");
  });

  it("shows a skeleton while the Plan loads", async () => {
    seedActivePlan();
    const release = fakePublicApi.pause(GET_PLAN);
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <PlanScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("progressbar", { name: "Loading plan" })
    ).toBeTruthy();
    expect(screen.getByTestId(PLAN_DETAIL_LOADING)).toBeTruthy();
    expect(screen.queryByText("More options")).toBeNull();

    release();
    await settle(queryClient);

    expect(screen.queryByTestId(PLAN_DETAIL_LOADING)).toBeNull();
    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
  });

  it("shows Couldn't Load Plan with Try Again, and tries again", async () => {
    seedActivePlan();
    fakePublicApi.failNext(GET_PLAN, "network");
    await mount();

    expect(screen.getByText("Couldn't Load Plan")).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.queryByText("More options")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(queryClient);

    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
  });

  it("says how long to wait when rate limited", async () => {
    seedActivePlan();
    fakePublicApi.failNext(GET_PLAN, { retryAfterSeconds: 12, status: 429 });
    await mount();

    expect(screen.getByText("Couldn't Load Plan")).toBeTruthy();
    expect(
      screen.getByText("Too many requests: please try again in 12 s.")
    ).toBeTruthy();
  });

  it("shows Plan Not Found for a Plan that's gone, with Back to Plans", async () => {
    seedActivePlan({ deleted_at: "2026-11-20T09:00:00.000Z" });
    await mount();

    expect(screen.getByText("Plan Not Found")).toBeTruthy();
    expect(screen.getByText("This plan no longer exists.")).toBeTruthy();
    expect(screen.queryByText("More options")).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", { name: "Back to Plans" })
    );

    expect(mockDismissTo).toHaveBeenCalledWith("/plans");
  });

  it("shows No Workouts Yet under the hero, with Add Workout opening the editor", async () => {
    seedActivePlan({ workouts: [] });
    await mount();

    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
    expect(screen.getByText("No Workouts Yet")).toBeTruthy();
    expect(
      screen.getByText("Add workouts to this plan to start training.")
    ).toBeTruthy();
    expect(screen.queryByText("Workouts")).toBeNull();
    expect(screen.getByText("More options")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Add Workout" }));

    expect(mockPush).toHaveBeenCalledWith({
      params: { planId: "plan-1" },
      pathname: "/plans/[planId]/edit",
    });
  });

  it("keeps the Plan shown when a refresh fails", async () => {
    seedActivePlan();
    await mount();
    fakePublicApi.failNext(GET_PLAN, { status: 500 });

    await pullToRefresh();

    expect(fakePublicApi.count(GET_PLAN)).toBe(2);
    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
    expect(screen.queryByText("Couldn't Load Plan")).toBeNull();
  });

  it("shows a refreshed Plan after a pull", async () => {
    seedActivePlan();
    await mount();
    backend.reset();
    seedActivePlan({ name: "Renamed Elsewhere" });

    await pullToRefresh();

    expect(screen.getByText("Renamed Elsewhere")).toBeTruthy();
  });
});

describe("the redesigned Plan screen, in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows the hero and the Workout rows in Ukrainian", async () => {
    seedActivePlan();
    await mount();

    expect(screen.getByText("Активний")).toBeTruthy();
    expect(screen.getByText("Тренування")).toBeTruthy();
    expect(row("Upper A, 8 вправ")).toBeTruthy();
    expect(row("Lower A, 5 вправ")).toBeTruthy();
    expect(row("Rest Day, 0 вправ")).toBeTruthy();
    expect(screen.getByText("0 вправ")).toBeTruthy();
    expect(screen.getByText("60 хв")).toBeTruthy();
    expect(screen.getByText("Інші дії")).toBeTruthy();
  });

  it("shows each state in Ukrainian", async () => {
    seedActivePlan({ workouts: [] });
    await mount();

    expect(screen.getByText("Тренувань ще немає")).toBeTruthy();
    expect(
      screen.getByText(
        "Додайте тренування до цього плану, щоб почати тренуватися."
      )
    ).toBeTruthy();
  });

  it("shows Plan Not Found and the load error in Ukrainian", async () => {
    mockPlanId.current = "plan-missing";
    await mount();

    expect(screen.getByText("План не знайдено")).toBeTruthy();
    expect(screen.getByRole("button", { name: "До планів" })).toBeTruthy();

    mockPlanId.current = "plan-1";
    seedActivePlan();
    fakePublicApi.failNext(GET_PLAN, "network");
    await mount();

    expect(screen.getByText("Не вдалося завантажити план")).toBeTruthy();
    expect(
      screen.getByText("Перевірте з’єднання і спробуйте ще раз.")
    ).toBeTruthy();
  });

  it("reads the skeleton as loading the plan", async () => {
    seedActivePlan();
    const release = fakePublicApi.pause(GET_PLAN);
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <PlanScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("progressbar", { name: "Завантаження плану" })
    ).toBeTruthy();

    release();
    await settle(queryClient);
  });
});

const ACTIVATE_PLAN = "POST /v1/plans/{id}/activate";
const DELETE_PLAN = "DELETE /v1/plans/{id}";

const SUCCESS_HAPTIC = {
  kind: "notification",
  type: NotificationFeedbackType.Success,
} as const;

/** Each language's text the actions show, from the catalogs. */
const ACTION_TEXT = {
  "en-US": {
    activate: "Activate Plan",
    activateConfirm: "Activate",
    activateFailed: "Couldn't Activate Plan",
    activateMessage: "This will deactivate your current plan",
    active: "Active",
    activeMessage:
      "Create or activate another plan first, then delete this one.",
    activeTitle: "Can't Delete Active Plan",
    cancel: "Cancel",
    deleteAction: "Delete Plan",
    deleteConfirm: "Delete",
    deleteFailed: "Couldn't Delete Plan",
    deleteMessage: "This can't be undone. Your past workouts stay in History.",
    deleteTitle: "Delete Plan?",
    edit: "Edit Plan",
    network: "Please check your connection and try again.",
    ok: "OK",
    rateLimited: "Too many requests: please try again in 30 s.",
  },
  "uk-UA": {
    activate: "Активувати план",
    activateConfirm: "Активувати",
    activateFailed: "Не вдалося активувати план",
    activateMessage: "Ваш поточний план буде деактивовано",
    active: "Активний",
    activeMessage:
      "Спершу створіть або активуйте інший план, а потім видаліть цей.",
    activeTitle: "Активний план не можна видалити",
    cancel: "Скасувати",
    deleteAction: "Видалити план",
    deleteConfirm: "Видалити",
    deleteFailed: "Не вдалося видалити план",
    deleteMessage:
      "Цю дію не можна скасувати. Ваші минулі тренування залишаться в Історії.",
    deleteTitle: "Видалити план?",
    edit: "Редагувати план",
    network: "Перевірте з’єднання й спробуйте ще раз.",
    ok: "OK",
    rateLimited: "Забагато запитів: спробуйте ще раз через 30 с.",
  },
} as const;

type ActionLanguage = keyof typeof ACTION_TEXT;

const alerts = () =>
  jest.mocked(Alert.alert).mock.calls as [string, string, AlertButton[]?][];

/** Presses `button` in the last alert shown, then lets the app settle. */
const answerAlert = async (button: string) => {
  const pressed = (alerts().at(-1)?.[2] ?? []).find(
    (candidate) => candidate.text === button
  );

  if (!pressed?.onPress) {
    throw new Error(`No "${button}" button in the last alert`);
  }

  await act(() => {
    pressed.onPress?.();
  });
  await settle(queryClient);
};

/** The "…" menu's items, by label, with whether each is destructive. */
const menuItems = () =>
  screen.getAllByRole("menuitem").map((item) => ({
    destructive: item.props.accessibilityHint === "destructive",
    label: item.props.accessibilityLabel,
  }));

const chooseFromMenu = async (label: string) => {
  await fireEvent.press(screen.getByRole("menuitem", { name: label }));
  await settle(queryClient);
};

const activateButton = () => screen.queryByTestId("activate-plan-button");

const shownActivateButton = () => screen.getByTestId("activate-plan-button");

const pressActivate = async () => {
  await fireEvent.press(shownActivateButton());
  await settle(queryClient);
};

const requestsTo = (route: string) =>
  fakePublicApi.requests.filter((request) => request.route === route);

const activePlanIds = () =>
  backend.plans.filter((plan) => plan.is_active).map((plan) => plan.id);

const livePlanIds = () =>
  backend.plans.filter((plan) => !plan.deleted_at).map((plan) => plan.id);

/** Another Plan of the User's, the active one unless told otherwise. */
const seedOtherPlan = (isActive = true) => {
  backend.seedPlan({
    frequency: 3,
    id: "plan-2",
    is_active: isActive,
    name: "Old Strength",
    workouts: [workoutOf("workout-9", "Full Body", 3)],
  });
};

describe.each(Object.keys(ACTION_TEXT) as ActionLanguage[])(
  "the redesigned Plan screen's actions, in %s",
  (language) => {
    const text = ACTION_TEXT[language];

    beforeEach(() => {
      setDeviceLanguages([language]);
    });

    it("offers Edit Plan and Delete Plan in the menu of the active Plan, with no Activate button", async () => {
      seedActivePlan();
      await mount();

      expect(menuItems()).toEqual([
        { destructive: false, label: text.edit },
        { destructive: true, label: text.deleteAction },
      ]);
      expect(activateButton()).toBeNull();
    });

    it("offers the same menu on an inactive Plan, with Activate Plan pinned", async () => {
      seedActivePlan({ is_active: false });
      await mount();

      expect(menuItems()).toEqual([
        { destructive: false, label: text.edit },
        { destructive: true, label: text.deleteAction },
      ]);
      expect(activateButton()).toBeTruthy();
      expect(
        within(shownActivateButton()).getByText(text.activate)
      ).toBeTruthy();
    });

    it("shows no Activate Plan on an inactive Plan with no Workouts", async () => {
      seedActivePlan({ is_active: false, workouts: [] });
      await mount();

      expect(activateButton()).toBeNull();
      expect(menuItems()).toHaveLength(2);
    });

    it("opens the Plan editor from Edit Plan", async () => {
      seedActivePlan();
      await mount();

      await chooseFromMenu(text.edit);

      expect(mockPush).toHaveBeenCalledWith({
        params: { planId: "plan-1" },
        pathname: "/plans/[planId]/edit",
      });
    });

    it("activates at once with no active Plan, then shows the Active badge and drops the button", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan(false);
      await mount();

      await pressActivate();

      expect(alerts()).toEqual([]);
      expect(requestsTo(ACTIVATE_PLAN).map(({ path }) => path)).toEqual([
        "/v1/plans/plan-1/activate",
      ]);
      expect(activePlanIds()).toEqual(["plan-1"]);
      expect(firedHaptics).toEqual([SUCCESS_HAPTIC]);
      expect(
        within(screen.getByTestId(PLAN_DETAIL)).getByText(text.active)
      ).toBeTruthy();
      expect(activateButton()).toBeNull();
      // The User stays on the Plan.
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("asks first while another Plan is active, and activates once confirmed", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan();
      await mount();

      await pressActivate();

      const [title, message, buttons] = alerts().at(-1) ?? [];
      expect(title).toBe(text.activate);
      expect(message).toBe(text.activateMessage);
      expect(
        buttons?.map(({ style, text: label }) => ({ label, style }))
      ).toEqual([
        { label: text.cancel, style: "cancel" },
        { label: text.activateConfirm, style: undefined },
      ]);
      expect(requestsTo(ACTIVATE_PLAN)).toHaveLength(0);

      await answerAlert(text.activateConfirm);

      expect(activePlanIds()).toEqual(["plan-1"]);
      expect(firedHaptics).toEqual([SUCCESS_HAPTIC]);
      expect(
        within(screen.getByTestId(PLAN_DETAIL)).getByText(text.active)
      ).toBeTruthy();
      expect(activateButton()).toBeNull();
    });

    it("asks first when the Plans can't be read to tell whether another is active", async () => {
      seedActivePlan({ is_active: false });
      fakePublicApi.failNext("GET /v1/plans", { status: 500 });
      await mount();

      await pressActivate();

      expect(alerts().at(-1)?.slice(0, 2)).toEqual([
        text.activate,
        text.activateMessage,
      ]);
      expect(requestsTo(ACTIVATE_PLAN)).toHaveLength(0);
    });

    it("disables Activate Plan while the Plan is being deleted", async () => {
      seedActivePlan({ is_active: false });
      await mount();

      const resume = fakePublicApi.pause(DELETE_PLAN);
      await chooseFromMenu(text.deleteAction);

      const confirm = (alerts().at(-1)?.[2] ?? []).find(
        (button) => button.text === text.deleteConfirm
      );

      await act(() => {
        confirm?.onPress?.();
      });
      await act(() =>
        until(
          () => activateButton()?.props.accessibilityState?.disabled === true
        )
      );

      expect(shownActivateButton().props.accessibilityState).toEqual({
        busy: false,
        disabled: true,
      });

      resume();
      await settle(queryClient);

      expect(mockDismissTo).toHaveBeenCalledWith("/plans");
    });

    it("activates nothing when the User cancels", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan();
      await mount();

      await pressActivate();
      // Cancel only closes the alert: it has no handler of its own.
      expect(
        alerts()
          .at(-1)?.[2]
          ?.find((button) => button.text === text.cancel)?.onPress
      ).toBeUndefined();

      expect(requestsTo(ACTIVATE_PLAN)).toHaveLength(0);
      expect(activePlanIds()).toEqual(["plan-2"]);
      expect(firedHaptics).toEqual([]);
      expect(activateButton()).toBeTruthy();
    });

    it("disables the button with a spinner while it activates", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan(false);
      await mount();

      const resume = fakePublicApi.pause(ACTIVATE_PLAN);
      await fireEvent.press(shownActivateButton());
      await act(() =>
        until(() => activateButton()?.props.accessibilityState?.busy === true)
      );

      expect(activateButton()?.props.accessibilityState).toEqual({
        busy: true,
        disabled: true,
      });

      // Delete waits too: the Plan is about to be the active one.
      expect(
        screen.getByRole("menuitem", { name: text.deleteAction }).props
          .accessibilityState
      ).toEqual({ disabled: true });

      resume();
      await settle(queryClient);

      expect(activateButton()).toBeNull();
      expect(activePlanIds()).toEqual(["plan-1"]);
    });

    it("says an activation failed, keeping the button", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan(false);
      await mount();

      fakePublicApi.failNext(ACTIVATE_PLAN, { status: 500 });
      await pressActivate();

      expect(alerts().at(-1)?.slice(0, 2)).toEqual([
        text.activateFailed,
        text.network,
      ]);
      expect(firedHaptics).toEqual([]);
      expect(activePlanIds()).toEqual([]);
      expect(activateButton()?.props.accessibilityState?.busy).toBe(false);
    });

    it("says how long to wait when an activation is rate limited", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan(false);
      await mount();

      fakePublicApi.failNext(ACTIVATE_PLAN, {
        code: "rate_limited",
        status: 429,
      });
      await pressActivate();

      expect(alerts().at(-1)?.slice(0, 2)).toEqual([
        text.activateFailed,
        text.rateLimited,
      ]);
    });

    it("confirms Delete Plan on an inactive Plan, deletes it and goes back to My Plans", async () => {
      seedActivePlan({ is_active: false });
      seedOtherPlan();
      await mount();

      await chooseFromMenu(text.deleteAction);

      const [title, message, buttons] = alerts().at(-1) ?? [];
      expect(title).toBe(text.deleteTitle);
      expect(message).toBe(text.deleteMessage);
      expect(
        buttons?.map(({ style, text: label }) => ({ label, style }))
      ).toEqual([
        { label: text.cancel, style: "cancel" },
        { label: text.deleteConfirm, style: "destructive" },
      ]);
      expect(requestsTo(DELETE_PLAN)).toHaveLength(0);

      await answerAlert(text.deleteConfirm);

      expect(livePlanIds()).toEqual(["plan-2"]);
      expect(mockDismissTo).toHaveBeenCalledWith("/plans");
    });

    it("refuses to delete the active Plan", async () => {
      seedActivePlan();
      await mount();

      await chooseFromMenu(text.deleteAction);

      expect(alerts().at(-1)).toEqual([
        text.activeTitle,
        text.activeMessage,
        [{ text: text.ok }],
      ]);
      expect(requestsTo(DELETE_PLAN)).toHaveLength(0);
      expect(livePlanIds()).toEqual(["plan-1"]);
      expect(mockDismissTo).not.toHaveBeenCalled();
    });

    it("says a delete failed and stays on the Plan", async () => {
      seedActivePlan({ is_active: false });
      await mount();

      fakePublicApi.failNext(DELETE_PLAN, { status: 500 });
      await chooseFromMenu(text.deleteAction);
      await answerAlert(text.deleteConfirm);

      expect(alerts().at(-1)?.slice(0, 2)).toEqual([
        text.deleteFailed,
        text.network,
      ]);
      expect(livePlanIds()).toEqual(["plan-1"]);
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
    });

    it("says how long to wait when a delete is rate limited", async () => {
      seedActivePlan({ is_active: false });
      await mount();

      fakePublicApi.failNext(DELETE_PLAN, {
        code: "rate_limited",
        status: 429,
      });
      await chooseFromMenu(text.deleteAction);
      await answerAlert(text.deleteConfirm);

      expect(alerts().at(-1)?.slice(0, 2)).toEqual([
        text.deleteFailed,
        text.rateLimited,
      ]);
      expect(livePlanIds()).toEqual(["plan-1"]);
    });
  }
);
