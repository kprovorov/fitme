/**
 * My Plans with the Plans redesign flag on (project "My Plans and Plan detail
 * redesign"): the real Plans screen over the fake Public API (`test-utils/`),
 * its header and pushes on the router stub, Pro from the real `useIsProQuery`
 * over the fake RevenueCat customer, in English and Ukrainian. The active
 * Plan is the hero card and the others are rows under "Other Plans"; a single
 * Plan is its card alone; with none active an info card heads the rows. Each
 * state (the skeleton, the empty state with the Create Plan tiles, the load
 * error and the 429 wait) and a failed refresh keeping the Plans shown. A
 * long press on a card or row (the context menu's stand-in), or VoiceOver's
 * actions, offers Edit Plan and Delete Plan: Edit opens the Plan editor, and
 * Delete confirms, refuses the active Plan or alerts a failure, the fake's
 * rows checked afterwards. An inactive Plan also offers Activate Plan: at once
 * with no active Plan, after "Activate Plan" with one; while the fake holds
 * it, the row's spinner and the disabled items; then the success haptic and
 * the hero card swapping, or the failure alert and the 429 wait. `Alert.alert`
 * is answered by pressing one of the buttons it was given.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { NotificationFeedbackType } from "expo-haptics";
import type { ReactElement } from "react";
import { Alert } from "react-native";
import type { AlertButton } from "react-native";

import PlansScreen from "~/app/plans/index";
import { setPlansRedesignEnabled } from "~/lib/feature-flags";
import { CREATE_PLAN_NAMING_STEP } from "~/lib/plan-draft";
import { DESTRUCTIVE_HINT } from "~/test-utils/context-menu-stub";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { firedHaptics } from "~/test-utils/haptics-stub";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { pushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

const mockPresentPaywall = jest.fn();

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Link: stub.LinkStub,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => stub.stubRouter,
  };
});

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: () => mockPresentPaywall() },
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
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

jest.mock("~/components/ui/context-menu", () =>
  jest.requireActual("~/test-utils/context-menu-stub")
);

const PLANS = "GET /v1/plans" as const;
const DELETE_PLAN = "DELETE /v1/plans/{id}" as const;
const ACTIVATE_PLAN = "POST /v1/plans/{id}/activate" as const;

/** Each language's text the screen shows, from the catalogs. */
const TEXT = {
  "en-US": {
    active: "Active",
    activePlan: "Active plan",
    checkConnection: "Check your connection and try again.",
    create: "Create workout plan",
    emptyMessage: "Create your first workout plan to get started.",
    emptyTitle: "No Plans Yet",
    gym: "Gym",
    home: "Home",
    intermediate: "Intermediate",
    loading: "Loading plans",
    loadError: "Couldn't Load Your Plans",
    muscleGain: "Gain Muscle",
    noActiveMessage: "Pick a plan and activate it to start training.",
    noActiveTitle: "No Active Plan",
    otherPlans: "Other Plans",
    perWeek: (count: number) => `${count}× per week`,
    rateLimited: "Too many requests: please try again in 30 s.",
    tryAgain: "Try Again",
    byHand: "Build it yourself",
    askArnold: "Ask Arnold",
    workouts: (count: number) =>
      count === 1 ? "1 workout" : `${count} workouts`,
    edit: "Edit Plan",
    deleteAction: "Delete Plan",
    deleteTitle: "Delete Plan?",
    deleteMessage: "This can't be undone. Your past workouts stay in History.",
    deleteConfirm: "Delete",
    cancel: "Cancel",
    ok: "OK",
    deleteFailed: "Couldn't Delete Plan",
    activeTitle: "Can't Delete Active Plan",
    activeMessage:
      "Create or activate another plan first, then delete this one.",
    network: "Please check your connection and try again.",
    notFound: "This plan no longer exists.",
    activate: "Activate Plan",
    activateMessage: "This will deactivate your current plan",
    activateConfirm: "Activate",
    activateFailed: "Couldn't Activate Plan",
    activating: "Activating plan",
  },
  "uk-UA": {
    active: "Активний",
    activePlan: "Активний план",
    checkConnection: "Перевірте з’єднання і спробуйте ще раз.",
    create: "Створити план тренувань",
    emptyMessage: "Створіть свій перший план тренувань, щоб почати.",
    emptyTitle: "Планів ще немає",
    gym: "Спортзал",
    home: "Вдома",
    intermediate: "Середній рівень",
    loading: "Завантаження планів",
    loadError: "Не вдалося завантажити ваші плани",
    muscleGain: "Набір м’язової маси",
    noActiveMessage: "Виберіть план і активуйте його, щоб почати тренування.",
    noActiveTitle: "Немає активного плану",
    otherPlans: "Інші плани",
    perWeek: (count: number) =>
      count >= 2 && count <= 4
        ? `${count} рази на тиждень`
        : `${count} разів на тиждень`,
    rateLimited: "Забагато запитів: спробуйте ще раз через 30 с.",
    tryAgain: "Спробувати ще раз",
    byHand: "Створити самостійно",
    askArnold: "Запитати Arnold",
    workouts: (count: number) =>
      count >= 2 && count <= 4 ? `${count} тренування` : `${count} тренувань`,
    edit: "Редагувати план",
    deleteAction: "Видалити план",
    deleteTitle: "Видалити план?",
    deleteMessage:
      "Цю дію не можна скасувати. Ваші минулі тренування залишаться в Історії.",
    deleteConfirm: "Видалити",
    cancel: "Скасувати",
    ok: "OK",
    deleteFailed: "Не вдалося видалити план",
    activeTitle: "Активний план не можна видалити",
    activeMessage:
      "Спершу створіть або активуйте інший план, а потім видаліть цей.",
    network: "Перевірте з’єднання й спробуйте ще раз.",
    notFound: "Цього плану більше немає.",
    activate: "Активувати план",
    activateMessage: "Ваш поточний план буде деактивовано",
    activateConfirm: "Активувати",
    activateFailed: "Не вдалося активувати план",
    activating: "План активується",
  },
} as const;

type Language = keyof typeof TEXT;

const LANGUAGES = Object.keys(TEXT) as Language[];

let client: QueryClient;

const ui = (element: ReactElement) => (
  <QueryClientProvider client={client}>
    <InAppLanguage>{element}</InAppLanguage>
  </QueryClientProvider>
);

const mount = async (language: Language) => {
  client = createTestQueryClient();
  setDeviceLanguages([language]);
  await render(ui(<PlansScreen />));
  await settle(client);
};

/** The Plan a test opens My Plans on, active unless it says otherwise. */
const seedHypertrophy = (overrides: { is_active?: boolean } = {}) =>
  backend.seedPlan({
    description: "A 4-day upper/lower split.",
    frequency: 4,
    goal: "muscle-gain",
    id: "plan-hypertrophy",
    is_active: true,
    name: "Hypertrophy Builder",
    place: "gym",
    workout_duration: 75,
    workouts: [
      { exercises: [], id: "w-upper-a", name: "Upper A" },
      { exercises: [], id: "w-lower-a", name: "Lower A" },
      { exercises: [], id: "w-upper-b", name: "Upper B" },
    ],
    ...overrides,
  });

/** Two other Plans, seeded oldest first (the API answers newest first). */
const seedOthers = () => {
  backend.seedPlan({
    description: null,
    experience_level: null,
    goal: null,
    id: "plan-old",
    name: "Old Strength",
    place: "home",
    workouts: [],
  });
  backend.seedPlan({
    description: "",
    goal: "muscle-gain",
    id: "plan-new",
    name: "New Split",
    place: null,
    workouts: [],
  });
};

/** The Plans the rows show, top to bottom, by their names. */
const rowNames = () =>
  screen.getAllByTestId(/^plan-row-/u).map((row) => row.props.testID);

/** Pulls the list down to refresh it. */
const pullToRefresh = async () => {
  const list = screen.getByTestId("plans-screen");

  await act(async () => {
    await list.props.refreshControl.props.onRefresh();
  });
  await settle(client);
};

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
  await settle(client);
};

/** Long-presses a card's or row's menu (by its testID) open. */
const openMenu = async (menu: string) => {
  await fireEvent(screen.getByTestId(menu), "longPress");
};

/** Long-presses `menu` open and picks `item` in it. */
const chooseFromMenu = async (menu: string, item: string) => {
  await openMenu(menu);
  await fireEvent.press(screen.getByRole("menuitem", { name: item }));
  await settle(client);
};

/** The Plans the fake still has live, by id. */
const livePlanIds = () =>
  backend.plans.filter((plan) => !plan.deleted_at).map((plan) => plan.id);

const deleteRequests = () =>
  fakePublicApi.requests.filter(({ route }) => route === DELETE_PLAN);

const activateRequests = () =>
  fakePublicApi.requests.filter(({ route }) => route === ACTIVATE_PLAN);

/** The fake's active Plans, by id. */
const activePlanIds = () =>
  backend.plans.filter((plan) => plan.is_active).map((plan) => plan.id);

/** The open menu's items, by label, with whether each is disabled. */
const menuItems = () =>
  screen.getAllByRole("menuitem").map((item) => ({
    disabled: item.props.accessibilityState?.disabled === true,
    label: item.props.accessibilityLabel,
  }));

const SUCCESS_HAPTIC = {
  kind: "notification",
  type: NotificationFeedbackType.Success,
} as const;

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  jest.mocked(Alert.alert).mockClear();
  setPlansRedesignEnabled(true);
  resetStubRouter();
  mockPresentPaywall.mockClear();
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
});

describe.each(LANGUAGES)("My Plans (%s)", (language) => {
  const text = TEXT[language];

  it("shows the active Plan as the hero card and the others as rows, newest first", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    const hero = screen.getByTestId("active-plan-card");
    expect(within(hero).getByText(text.active)).toBeTruthy();
    expect(within(hero).getByText("Hypertrophy Builder")).toBeTruthy();
    expect(within(hero).getByText("A 4-day upper/lower split.")).toBeTruthy();
    expect(within(hero).getByText(text.muscleGain)).toBeTruthy();
    expect(within(hero).getByText(text.intermediate)).toBeTruthy();
    expect(within(hero).getByText(text.perWeek(4))).toBeTruthy();
    expect(within(hero).getByText(text.gym)).toBeTruthy();
    // The hero's meta row has no Workout duration.
    expect(within(hero).queryByText(/75/u)).toBeNull();
    expect(within(hero).getByText(text.workouts(3))).toBeTruthy();

    for (const workout of ["Upper A", "Lower A", "Upper B"]) {
      expect(within(hero).getByText(workout)).toBeTruthy();
    }

    expect(screen.getByText(text.otherPlans)).toBeTruthy();
    expect(rowNames()).toEqual(["plan-row-plan-new", "plan-row-plan-old"]);
  });

  it("leaves out every unset detail and an empty description", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    const fresh = screen.getByTestId("plan-row-plan-new");
    expect(within(fresh).getByText("New Split")).toBeTruthy();
    expect(within(fresh).getByText(text.muscleGain)).toBeTruthy();
    expect(within(fresh).getByText(text.intermediate)).toBeTruthy();
    expect(within(fresh).getByText(text.perWeek(3))).toBeTruthy();
    expect(within(fresh).queryByText(text.gym)).toBeNull();

    const old = screen.getByTestId("plan-row-plan-old");
    expect(within(old).getByText("Old Strength")).toBeTruthy();
    expect(within(old).getByText(text.perWeek(3))).toBeTruthy();
    expect(within(old).getByText(text.home)).toBeTruthy();
    expect(within(old).queryByText(text.intermediate)).toBeNull();
    expect(screen.queryByText(/null/u)).toBeNull();
  });

  it("reads each card and row to VoiceOver as one button", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    expect(
      screen.getByTestId("active-plan-card").props.accessibilityLabel
    ).toBe(
      [
        "Hypertrophy Builder",
        text.activePlan,
        "A 4-day upper/lower split.",
        text.muscleGain,
        text.intermediate,
        text.perWeek(4),
        text.gym,
        text.workouts(3),
        "Upper A",
        "Lower A",
        "Upper B",
      ].join(", ")
    );
    expect(
      screen.getByTestId("plan-row-plan-old").props.accessibilityLabel
    ).toBe(["Old Strength", text.perWeek(3), text.home].join(", "));
  });

  it("shows a single Plan as its card alone, with no heading", async () => {
    seedHypertrophy();

    await mount(language);

    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
    expect(screen.queryByText(text.otherPlans)).toBeNull();
    expect(screen.queryAllByTestId(/^plan-row-/u)).toHaveLength(0);
  });

  it("with no active Plan, says so above every Plan's row", async () => {
    seedOthers();
    seedHypertrophy({ is_active: false });

    await mount(language);

    expect(screen.queryByTestId("active-plan-card")).toBeNull();
    expect(screen.getByText(text.noActiveTitle)).toBeTruthy();
    expect(screen.getByText(text.noActiveMessage)).toBeTruthy();
    expect(screen.queryByText(text.otherPlans)).toBeNull();
    expect(rowNames()).toEqual([
      "plan-row-plan-hypertrophy",
      "plan-row-plan-new",
      "plan-row-plan-old",
    ]);
  });

  it("opens a Plan from its card or its row", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await fireEvent.press(screen.getByTestId("active-plan-card"));
    await fireEvent.press(screen.getByTestId("plan-row-plan-old"));

    expect(pushedRoutes().map((route) => route.pathname)).toEqual([
      "/plans/plan-hypertrophy",
      "/plans/plan-old",
    ]);
  });

  it("opens Create Plan from the header's +", async () => {
    seedHypertrophy();

    await mount(language);

    await fireEvent.press(screen.getByRole("button", { name: text.create }));

    expect(pushedRoutes().map((route) => route.pathname)).toEqual([
      "/plans/create",
    ]);
  });

  it("shows a skeleton while the Plans load", async () => {
    seedHypertrophy();
    const resume = fakePublicApi.pause(PLANS);

    client = createTestQueryClient();
    setDeviceLanguages([language]);
    await render(ui(<PlansScreen />));

    expect(screen.getByLabelText(text.loading)).toBeTruthy();
    expect(screen.queryByTestId("active-plan-card")).toBeNull();

    resume();
    await settle(client);

    expect(screen.queryByLabelText(text.loading)).toBeNull();
    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
  });

  it("with no Plans, offers the Create Plan tiles", async () => {
    await mount(language);

    expect(screen.getByText(text.emptyTitle)).toBeTruthy();
    expect(screen.getByText(text.emptyMessage)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: text.byHand }));

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { step: CREATE_PLAN_NAMING_STEP },
        pathname: "/plans/create",
      }),
    ]);
  });

  it("with no Plans, Ask Arnold shows a free User the paywall", async () => {
    await mount(language);

    await fireEvent.press(screen.getByRole("button", { name: text.askArnold }));

    expect(mockPresentPaywall).toHaveBeenCalledTimes(1);
    expect(pushedRoutes()).toEqual([]);
  });

  it("with no Plans, Ask Arnold opens the planner for a Pro User", async () => {
    fakeRevenueCat.setPro("renewing");

    await mount(language);

    await fireEvent.press(screen.getByRole("button", { name: text.askArnold }));

    expect(mockPresentPaywall).not.toHaveBeenCalled();
    expect(pushedRoutes().map((route) => route.pathname)).toEqual(["/planner"]);
  });

  it("says the Plans couldn't load, and Try Again reads them again", async () => {
    seedHypertrophy();
    fakePublicApi.failNext(PLANS, { status: 500 });

    await mount(language);

    expect(screen.getByText(text.loadError)).toBeTruthy();
    expect(screen.getByText(text.checkConnection)).toBeTruthy();

    const resume = fakePublicApi.pause(PLANS);
    await fireEvent.press(screen.getByRole("button", { name: text.tryAgain }));

    // The retry shows the skeleton, not the error it's answering.
    await until(() => screen.queryByLabelText(text.loading) !== null);
    expect(screen.queryByText(text.loadError)).toBeNull();

    resume();
    await settle(client);

    expect(screen.queryByText(text.loadError)).toBeNull();
    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
  });

  it("says how long to wait when rate limited", async () => {
    fakePublicApi.failNext(PLANS, { code: "rate_limited", status: 429 });

    await mount(language);

    expect(screen.getByText(text.loadError)).toBeTruthy();
    expect(screen.getByText(text.rateLimited)).toBeTruthy();
  });

  it("keeps the Plans shown when a refresh fails", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    fakePublicApi.failNext(PLANS, "network");
    await pullToRefresh();

    expect(screen.queryByText(text.loadError)).toBeNull();
    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
    expect(rowNames()).toHaveLength(2);
  });

  it("shows a Plan a refresh brings", async () => {
    seedHypertrophy();

    await mount(language);

    seedOthers();
    await pullToRefresh();

    expect(rowNames()).toEqual(["plan-row-plan-new", "plan-row-plan-old"]);
  });

  it("offers Edit Plan, Activate Plan and Delete Plan on a row's long press, Delete in red", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await openMenu("plan-menu-plan-old");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.props.accessibilityLabel)).toEqual([
      text.edit,
      text.activate,
      text.deleteAction,
    ]);
    expect(items[2].props.accessibilityHint).toBe(DESTRUCTIVE_HINT);
    expect(items[0].props.accessibilityHint).toBeUndefined();
    expect(items[1].props.accessibilityHint).toBeUndefined();
  });

  it("offers Edit Plan and Delete Plan on the hero card's long press", async () => {
    seedHypertrophy();

    await mount(language);

    await openMenu("active-plan-menu");

    expect(
      screen
        .getAllByRole("menuitem")
        .map((item) => item.props.accessibilityLabel)
    ).toEqual([text.edit, text.deleteAction]);
  });

  it("offers the same items as VoiceOver actions on each card and row", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    expect(
      screen.getByTestId("active-plan-card").props.accessibilityActions
    ).toEqual([
      { label: text.edit, name: "edit" },
      { label: text.deleteAction, name: "delete" },
    ]);
    expect(
      screen.getByTestId("plan-row-plan-old").props.accessibilityActions
    ).toEqual([
      { label: text.edit, name: "edit" },
      { label: text.activate, name: "activate" },
      { label: text.deleteAction, name: "delete" },
    ]);

    await fireEvent(
      screen.getByTestId("plan-row-plan-new"),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "edit" },
      }
    );

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { planId: "plan-new" },
        pathname: "/plans/[planId]/edit",
      }),
    ]);
  });

  it("opens the Plan editor from Edit Plan, on a row or the hero card", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("plan-menu-plan-old", text.edit);
    await chooseFromMenu("active-plan-menu", text.edit);

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { planId: "plan-old" },
        pathname: "/plans/[planId]/edit",
      }),
      expect.objectContaining({
        params: { planId: "plan-hypertrophy" },
        pathname: "/plans/[planId]/edit",
      }),
    ]);
  });

  it("asks before deleting an inactive Plan, then its row disappears", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);

    const [title, message, buttons] = alerts().at(-1) ?? [];
    expect(title).toBe(text.deleteTitle);
    expect(message).toBe(text.deleteMessage);
    expect(
      buttons?.map(({ style, text: label }) => ({ label, style }))
    ).toEqual([
      { label: text.cancel, style: "cancel" },
      { label: text.deleteConfirm, style: "destructive" },
    ]);
    // Nothing is deleted until the User says so.
    expect(deleteRequests()).toHaveLength(0);

    await answerAlert(text.deleteConfirm);

    expect(deleteRequests().map(({ path }) => path)).toEqual([
      "/v1/plans/plan-old",
    ]);
    expect(livePlanIds()).toEqual(["plan-new", "plan-hypertrophy"]);
    expect(rowNames()).toEqual(["plan-row-plan-new"]);
    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
    expect(pushedRoutes()).toEqual([]);
  });

  it("deletes nothing when the User cancels", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);
    expect(alerts().at(-1)?.[2]?.[0]?.onPress).toBeUndefined();

    expect(deleteRequests()).toHaveLength(0);
    expect(livePlanIds()).toHaveLength(3);
    expect(rowNames()).toHaveLength(2);
  });

  it("deletes the Plan through VoiceOver's Delete action too", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await fireEvent(
      screen.getByTestId("plan-row-plan-new"),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "delete" },
      }
    );
    await answerAlert(text.deleteConfirm);

    expect(livePlanIds()).toEqual(["plan-old", "plan-hypertrophy"]);
    expect(rowNames()).toEqual(["plan-row-plan-old"]);
  });

  it("won't delete the active Plan, saying what to do instead", async () => {
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("active-plan-menu", text.deleteAction);

    const [title, message, buttons] = alerts().at(-1) ?? [];
    expect(title).toBe(text.activeTitle);
    expect(message).toBe(text.activeMessage);
    expect(buttons?.map((button) => button.text)).toEqual([text.ok]);
    expect(deleteRequests()).toHaveLength(0);
    expect(livePlanIds()).toEqual(["plan-hypertrophy"]);
    expect(screen.getByTestId("active-plan-card")).toBeTruthy();
  });

  it("says a delete failed and keeps the row", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    fakePublicApi.failNext(DELETE_PLAN, { status: 500 });
    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);
    await answerAlert(text.deleteConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.deleteFailed,
      text.network,
    ]);
    expect(livePlanIds()).toContain("plan-old");
    expect(rowNames()).toEqual(["plan-row-plan-new", "plan-row-plan-old"]);
  });

  it("says how long to wait when a delete is rate limited", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    fakePublicApi.failNext(DELETE_PLAN, { code: "rate_limited", status: 429 });
    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);
    await answerAlert(text.deleteConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.deleteFailed,
      text.rateLimited,
    ]);
    expect(livePlanIds()).toContain("plan-old");
  });

  it("says a Plan the API can't find is gone, and drops it once read again", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    // Deleted elsewhere since the list was read.
    backend.plans[0].user_id = "user_other";
    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);
    await answerAlert(text.deleteConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.deleteFailed,
      text.notFound,
    ]);
    expect(rowNames()).toEqual(["plan-row-plan-new"]);
  });

  it("activates a Plan at once when none is active, with the success haptic", async () => {
    seedOthers();
    seedHypertrophy({ is_active: false });

    await mount(language);

    await chooseFromMenu("plan-menu-plan-old", text.activate);

    // No question: there's no current Plan to deactivate.
    expect(alerts()).toHaveLength(0);
    expect(activateRequests().map(({ path }) => path)).toEqual([
      "/v1/plans/plan-old/activate",
    ]);
    expect(activePlanIds()).toEqual(["plan-old"]);
    expect(firedHaptics).toEqual([SUCCESS_HAPTIC]);

    const hero = screen.getByTestId("active-plan-card");
    expect(within(hero).getByText("Old Strength")).toBeTruthy();
    expect(screen.queryByText(text.noActiveTitle)).toBeNull();
    expect(rowNames()).toEqual([
      "plan-row-plan-hypertrophy",
      "plan-row-plan-new",
    ]);
    // The User stays on My Plans.
    expect(pushedRoutes()).toEqual([]);
  });

  it("asks before activating a Plan while another is active, then swaps the hero card", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("plan-menu-plan-new", text.activate);

    const [title, message, buttons] = alerts().at(-1) ?? [];
    expect(title).toBe(text.activate);
    expect(message).toBe(text.activateMessage);
    expect(
      buttons?.map(({ style, text: label }) => ({ label, style }))
    ).toEqual([
      { label: text.cancel, style: "cancel" },
      { label: text.activateConfirm, style: undefined },
    ]);
    expect(activateRequests()).toHaveLength(0);

    await answerAlert(text.activateConfirm);

    expect(activePlanIds()).toEqual(["plan-new"]);
    expect(firedHaptics).toEqual([SUCCESS_HAPTIC]);
    expect(
      within(screen.getByTestId("active-plan-card")).getByText("New Split")
    ).toBeTruthy();
    // The old active Plan is a row now.
    expect(rowNames()).toEqual([
      "plan-row-plan-hypertrophy",
      "plan-row-plan-old",
    ]);
    expect(pushedRoutes()).toEqual([]);
  });

  it("activates nothing when the User cancels", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await chooseFromMenu("plan-menu-plan-new", text.activate);
    expect(alerts().at(-1)?.[2]?.[0]?.onPress).toBeUndefined();

    expect(activateRequests()).toHaveLength(0);
    expect(activePlanIds()).toEqual(["plan-hypertrophy"]);
    expect(firedHaptics).toEqual([]);
  });

  it("activates through VoiceOver's Activate action too", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    await fireEvent(
      screen.getByTestId("plan-row-plan-old"),
      "accessibilityAction",
      { nativeEvent: { actionName: "activate" } }
    );
    await answerAlert(text.activateConfirm);

    expect(activePlanIds()).toEqual(["plan-old"]);
  });

  it("while activating, spins on the row and disables every Activate and Delete but keeps Edit", async () => {
    seedOthers();
    seedHypertrophy({ is_active: false });

    await mount(language);

    const resume = fakePublicApi.pause(ACTIVATE_PLAN);
    // No settling: the fake holds the activation.
    await openMenu("plan-menu-plan-old");
    await fireEvent.press(
      screen.getByRole("menuitem", { name: text.activate })
    );
    // Inside `act`, so the screen renders the pending activation.
    await act(() =>
      until(() => screen.queryByTestId("plan-activating-plan-old") !== null)
    );

    expect(screen.getByTestId("plan-activating-plan-old")).toBeTruthy();
    expect(screen.queryByTestId("plan-activating-plan-new")).toBeNull();
    expect(
      screen.getByTestId("plan-row-plan-old").props.accessibilityLabel
    ).toContain(text.activating);

    await openMenu("plan-menu-plan-new");
    expect(menuItems()).toEqual([
      { disabled: false, label: text.edit },
      { disabled: true, label: text.activate },
      { disabled: true, label: text.deleteAction },
    ]);
    // VoiceOver offers only what's enabled.
    expect(
      screen.getByTestId("plan-row-plan-new").props.accessibilityActions
    ).toEqual([{ label: text.edit, name: "edit" }]);

    await fireEvent.press(screen.getByRole("menuitem", { name: text.edit }));
    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { planId: "plan-new" },
        pathname: "/plans/[planId]/edit",
      }),
    ]);

    resume();
    await settle(client);

    expect(screen.queryByTestId(/^plan-activating-/u)).toBeNull();
    expect(
      within(screen.getByTestId("active-plan-card")).getByText("Old Strength")
    ).toBeTruthy();
    expect(activateRequests()).toHaveLength(1);
  });

  it("disables Activate while a Plan is being deleted", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    const resume = fakePublicApi.pause(DELETE_PLAN);
    await chooseFromMenu("plan-menu-plan-old", text.deleteAction);

    const confirm = (alerts().at(-1)?.[2] ?? []).find(
      (button) => button.text === text.deleteConfirm
    );

    await act(() => {
      confirm?.onPress?.();
    });
    await until(() => deleteRequests().length === 1);

    // The pending delete reaches the menu once the screen has rendered it.
    await openMenu("plan-menu-plan-new");
    await act(() => until(() => menuItems().at(1)?.disabled ?? false));
    expect(menuItems()).toEqual([
      { disabled: false, label: text.edit },
      { disabled: true, label: text.activate },
      { disabled: true, label: text.deleteAction },
    ]);

    resume();
    await settle(client);
  });

  it("says an activation failed and keeps the Plans as they were", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    fakePublicApi.failNext(ACTIVATE_PLAN, { status: 500 });
    await chooseFromMenu("plan-menu-plan-old", text.activate);
    await answerAlert(text.activateConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.activateFailed,
      text.network,
    ]);
    expect(firedHaptics).toEqual([]);
    expect(activePlanIds()).toEqual(["plan-hypertrophy"]);
    expect(
      within(screen.getByTestId("active-plan-card")).getByText(
        "Hypertrophy Builder"
      )
    ).toBeTruthy();
    expect(screen.queryByTestId(/^plan-activating-/u)).toBeNull();
  });

  it("says how long to wait when an activation is rate limited", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    fakePublicApi.failNext(ACTIVATE_PLAN, {
      code: "rate_limited",
      status: 429,
    });
    await chooseFromMenu("plan-menu-plan-old", text.activate);
    await answerAlert(text.activateConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.activateFailed,
      text.rateLimited,
    ]);
    expect(activePlanIds()).toEqual(["plan-hypertrophy"]);
  });

  it("says a Plan the API can't find to activate is gone, and drops it once read again", async () => {
    seedOthers();
    seedHypertrophy();

    await mount(language);

    // Deleted elsewhere since the list was read.
    backend.plans[0].user_id = "user_other";
    await chooseFromMenu("plan-menu-plan-old", text.activate);
    await answerAlert(text.activateConfirm);

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      text.activateFailed,
      text.notFound,
    ]);
    expect(rowNames()).toEqual(["plan-row-plan-new"]);
    expect(activePlanIds()).toEqual(["plan-hypertrophy"]);
  });
});
