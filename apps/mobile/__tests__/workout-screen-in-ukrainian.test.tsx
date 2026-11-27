/**
 * A Plan's Workout screen on a Ukrainian device: the real screen under the
 * root layout's language sync, with the Public API client's `fetch` swapped
 * for the fake Public API (`test-utils/`). The header is rendered as its
 * title and plain buttons, the menus' items flattened. My Plans and the Plan
 * screen in Ukrainian are `my-plans.test.tsx`' and `plan-detail.test.tsx`'.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert, Pressable, Text } from "react-native";
import type { AlertButton } from "react-native";

import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
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

// The real Clerk SDK (reached through the Workout cards) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: false }),
}));

jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

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
  jest.mocked(Alert.alert).mock.calls as [string, string, AlertButton[]?][];

/** `count` Exercises of 3 sets each, named after `prefix`. */
const exercises = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sets: 3,
    slug: `${prefix}-${index + 1}`,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
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

describe("a Plan's Workout screen in Ukrainian", () => {
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
    expect(
      screen.getByText("Спершу завершіть або відкиньте «Груди»")
    ).toBeTruthy();
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
    fakePublicApi.failNext("GET /v1/plans/{id}", "network");
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
