/**
 * The Plan list, a Plan's screen and its Workout screen on a Ukrainian
 * device: the real screens under the root layout's language sync, with
 * Supabase swapped for the in-memory backend and the Public API client's
 * `fetch` for the fake Public API over the same rows (both from
 * `test-utils/`). The header is rendered as its title and plain buttons, the
 * menus' items flattened, and `Alert.alert` is answered by pressing one of
 * its buttons, as the User would.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert, type AlertButton, Pressable, Text } from "react-native";
import PlanScreen from "~/app/plans/[planId]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import PlansScreen from "~/app/plans/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockDismissTo = jest.fn();
const mockPlanId = { current: "plan-1" };

interface MockHeaderItem {
  label: string;
  menu?: { items: MockHeaderItem[] };
  onPress?: () => void;
}

interface MockHeaderOptions {
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

// The header's title and items as buttons, the menus' items flattened, with
// the menu's own label first. Top-level (and `mock`-prefixed, so the factory
// may use it) because the React Compiler rewrites components declared inside
// a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) => {
  const items = (options.unstable_headerRightItems?.() ?? []).flatMap((item) =>
    item.menu ? [item, ...item.menu.items] : [item]
  );
  return (
    <>
      {options.title ? <Text>{options.title}</Text> : null}
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
  useLocalSearchParams: () => ({
    planId: mockPlanId.current,
    workoutId: "workout-1",
  }),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismissTo: mockDismissTo,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
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
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const DELETE = "DELETE /v1/plans/{id}";
const START = "POST /v1/workout-sessions";

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

/** `count` Exercises of 3 sets each, named after `prefix`. */
const exercises = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sets: 3,
    slug: `${prefix}-${index + 1}`,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  mockPlanId.current = "plan-1";
  backend.seedPlan({
    id: "plan-1",
    name: "Сила",
    workouts: [
      { exercises: exercises("legs", 1), id: "workout-1", name: "Ноги" },
      { exercises: exercises("push", 3), id: "workout-2", name: "Груди" },
      { exercises: exercises("pull", 5), id: "workout-3", name: "Спина" },
    ],
  });
  backend.seedPlan({
    id: "plan-2",
    is_active: true,
    name: "Гіпертрофія",
    workouts: [],
  });
  setDeviceLanguages(["uk-UA"]);
});

describe("The Plan list in Ukrainian", () => {
  it("shows its title, each Plan's options and the create action", async () => {
    await mount(<PlansScreen />);

    expect(screen.getByText("Мої плани")).toBeTruthy();
    expect(screen.getByText("Створити план тренувань")).toBeTruthy();
    // The seeded Plans' goal, level, frequency (3, a `few` form) and place.
    expect(screen.getAllByText("Сила та результативність")).toHaveLength(2);
    expect(screen.getAllByText("Середній рівень")).toHaveLength(2);
    expect(screen.getAllByText("3 рази на тиждень")).toHaveLength(2);
    expect(screen.getAllByText("Спортзал")).toHaveLength(2);
    expect(screen.getByText("Створити новий план тренувань")).toBeTruthy();
  });
});

describe("A Plan's screen in Ukrainian", () => {
  it("shows each Workout's Exercise count with its plural form", async () => {
    await mount(<PlanScreen />);

    expect(screen.getByText("Сила")).toBeTruthy();
    expect(screen.getByText("1 вправа")).toBeTruthy();
    expect(screen.getByText("3 вправи")).toBeTruthy();
    expect(screen.getByText("5 вправ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ноги, 1 вправа" })).toBeTruthy();
  });

  it("offers its actions in the menu", async () => {
    await mount(<PlanScreen />);

    expect(screen.getByText("Керувати")).toBeTruthy();
    expect(screen.getByText("Активувати план")).toBeTruthy();
    expect(screen.getByText("Архівувати")).toBeTruthy();
  });

  it("confirms activating it", async () => {
    await mount(<PlanScreen />);

    await fireEvent.press(screen.getByText("Активувати план"));

    const [title, message, buttons] = alerts().at(-1) ?? [];
    expect([title, message]).toEqual([
      "Активувати план",
      "Ваш поточний план буде деактивовано",
    ]);
    expect(buttons?.map(({ text }) => text)).toEqual([
      "Скасувати",
      "Активувати",
    ]);
  });

  it("confirms archiving it", async () => {
    await mount(<PlanScreen />);

    await fireEvent.press(screen.getByText("Архівувати"));

    const [title, message, buttons] = alerts().at(-1) ?? [];
    expect([title, message]).toEqual([
      "Архівувати план",
      "Справді архівувати цей план?",
    ]);
    expect(buttons?.map(({ text }) => text)).toEqual([
      "Скасувати",
      "Архівувати",
    ]);
  });

  it("won't archive the active Plan", async () => {
    mockPlanId.current = "plan-2";
    await mount(<PlanScreen />);

    await fireEvent.press(screen.getByText("Архівувати"));

    expect(alerts().at(-1)).toEqual([
      "Архівувати план",
      "Активний план не можна архівувати. У вас завжди має бути принаймні один активний план.",
    ]);
  });

  it("says a Plan that's gone no longer exists", async () => {
    fakePublicApi.failNext(DELETE, { code: "not_found", status: 404 });
    await mount(<PlanScreen />);

    await choose("Архівувати", "Архівувати");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Не вдалося архівувати план",
      "Цього плану більше немає.",
    ]);
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("tells the User how long to wait when rate limited", async () => {
    fakePublicApi.failNext(DELETE, { retryAfterSeconds: 12, status: 429 });
    await mount(<PlanScreen />);

    await choose("Архівувати", "Архівувати");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Не вдалося архівувати план",
      "Забагато запитів: спробуйте ще раз через 12 с.",
    ]);
  });

  it("asks to check the connection when the request fails", async () => {
    fakePublicApi.failNext(DELETE, "network");
    await mount(<PlanScreen />);

    await choose("Архівувати", "Архівувати");

    expect(alerts().at(-1)?.slice(0, 2)).toEqual([
      "Не вдалося архівувати план",
      "Перевірте з’єднання й спробуйте ще раз.",
    ]);
  });
});

describe("A Plan's Workout screen in Ukrainian", () => {
  it("shows its planned stats and Start", async () => {
    await mount(<WorkoutScreen />);

    expect(screen.getByText("Ноги")).toBeTruthy();
    expect(screen.getByText("Тривалість")).toBeTruthy();
    expect(screen.getByText("60 хв")).toBeTruthy();
    expect(screen.getByText("Вправи")).toBeTruthy();
    expect(screen.getByText("Підходи")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Почати тренування" })
    ).toBeTruthy();
  });

  it("says why it can't start while another Workout is in progress", async () => {
    backend.sessions.push({
      finished_at: null,
      id: "open-session",
      plan_id: "plan-1",
      started_at: "2026-10-29T09:00:00.000Z",
      workout_id: "workout-2",
      workoutName: "Груди",
    });
    await mount(<WorkoutScreen />);

    expect(
      screen.getByRole("button", { name: "Почати тренування" })
    ).toBeDisabled();
    expect(screen.getByText("Спершу завершіть «Груди»")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Продовжити «Груди»" })
    ).toBeTruthy();
  });

  it("tells the User how long to wait when Start is rate limited", async () => {
    fakePublicApi.failNext(START, { retryAfterSeconds: 12, status: 429 });
    await mount(<WorkoutScreen />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Почати тренування" })
    );
    await settle(queryClient);

    expect(alerts().at(-1)).toEqual([
      "Не вдалося почати тренування",
      "Забагато запитів: спробуйте ще раз через 12 с.",
    ]);
  });

  it("says a Workout that's gone no longer exists", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    await mount(<WorkoutScreen />);

    expect(screen.getByText("Цього тренування більше немає")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Назад" })).toBeTruthy();
  });

  it("says a Workout has no Exercises yet", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    backend.seedPlan({
      id: "plan-1",
      is_active: true,
      name: "Сила",
      workouts: [{ exercises: [], id: "workout-1", name: "Ноги" }],
    });
    await mount(<WorkoutScreen />);

    expect(screen.getByText("У цьому тренуванні ще немає вправ.")).toBeTruthy();
  });

  it("offers to try again when the Workout can't load", async () => {
    backend.failNext("workouts", "select");
    await mount(<WorkoutScreen />);

    expect(
      screen.getByText(
        "Не вдалося завантажити тренування. Перевірте з’єднання й спробуйте ще раз."
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Спробувати ще раз" })
    ).toBeTruthy();
  });
});
