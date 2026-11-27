/**
 * My Plans with the Plans redesign flag on (project "My Plans and Plan detail
 * redesign"): the real Plans screen over the fake Public API (`test-utils/`),
 * its header and pushes on the router stub, Pro from the real `useIsProQuery`
 * over the fake RevenueCat customer, in English and Ukrainian. The active
 * Plan is the hero card and the others are rows under "Other Plans"; a single
 * Plan is its card alone; with none active an info card heads the rows. Each
 * state (the skeleton, the empty state with the Create Plan tiles, the load
 * error and the 429 wait) and a failed refresh keeping the Plans shown.
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
import type { ReactElement } from "react";

import PlansScreen from "~/app/plans/index";
import { setPlansRedesignEnabled } from "~/lib/feature-flags";
import { CREATE_PLAN_NAMING_STEP } from "~/lib/plan-draft";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
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

const PLANS = "GET /v1/plans" as const;

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

beforeEach(() => {
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

    await fireEvent.press(screen.getByRole("button", { name: text.tryAgain }));
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
});
