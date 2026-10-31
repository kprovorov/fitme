/**
 * The Home tab on a Ukrainian device: the real screen under the root layout's
 * language sync, with Supabase swapped for the in-memory backend (from
 * `test-utils/`). The header is rendered as its title and plain buttons, the
 * Plan menu as the dropdown stand-in.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

interface MockHeaderItem {
  label: string;
  onPress?: () => void;
}

interface MockHeaderOptions {
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

// The header's title and items as buttons. Top-level (and `mock`-prefixed,
// so the factory may use it) because the React Compiler rewrites components
// declared inside a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) => (
  <>
    {options.title ? <Text>{options.title}</Text> : null}
    {(options.unstable_headerRightItems?.() ?? []).map((item) => (
      <Pressable key={item.label} onPress={item.onPress}>
        <Text>{item.label}</Text>
      </Pressable>
    ))}
  </>
);

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeader {...props} />
    ),
  },
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    push: jest.fn(),
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
jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: false }),
}));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <HomeScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** `count` Exercises of 3 sets each, named after `prefix`. */
const exercises = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sets: 3,
    slug: `${prefix}-${index + 1}`,
  }));

beforeEach(() => {
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  setDeviceLanguages(["uk-UA"]);
});

const seedActivePlan = () =>
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Сила",
    workouts: [
      // `backend.seed({ id: "s1" })` opens a session of this Workout.
      { exercises: exercises("legs", 1), id: "workout-of-s1", name: "Ноги" },
      { exercises: exercises("push", 3), id: "workout-2", name: "Груди" },
      { exercises: exercises("pull", 5), id: "workout-3", name: "Спина" },
    ],
  });

describe("Home in Ukrainian", () => {
  it("shows its tab title and the Plan actions behind the sliders button", async () => {
    seedActivePlan();
    await mount();

    // The tab's title and the Workouts heading read the same in Ukrainian.
    expect(screen.getAllByText("Тренування")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Тренування" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Параметри плану" })
    );
    expect(
      screen.getByRole("menuitem", { name: "Керувати планами" })
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Створити план" })
    ).toBeTruthy();
  });

  it("shows the active Plan and each Workout card's count with its plural form", async () => {
    seedActivePlan();
    await mount();

    // The Plan header: its name, its badges (3 a week, a `few` form) and its
    // description, with no experience level as the old Plan card had.
    expect(screen.getByRole("heading", { name: "Сила" })).toBeTruthy();
    expect(screen.getByText("3 рази на тиждень")).toBeTruthy();
    expect(screen.getByText("Сила та результативність")).toBeTruthy();
    expect(screen.getByText("Спортзал")).toBeTruthy();
    expect(screen.getByText("About Сила")).toBeTruthy();
    expect(screen.queryByText("Середній рівень")).toBeNull();

    // Each card's count with its plural form, the Plan's duration, its
    // name and both buttons, as VoiceOver reads them.
    expect(screen.getByText("1 вправа")).toBeTruthy();
    expect(screen.getByText("3 вправи")).toBeTruthy();
    expect(screen.getByText("5 вправ")).toBeTruthy();
    expect(screen.getAllByText("60 хв")).toHaveLength(3);
    expect(screen.getAllByLabelText("60 хвилин")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Ноги" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Огляд: Ноги" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Почати: Ноги" })).toBeTruthy();
    expect(screen.getAllByText("Огляд")).toHaveLength(3);
    expect(screen.getAllByText("Почати")).toHaveLength(3);
  });

  it("names the muscle groups in Ukrainian, with the rest counted in their plural form", async () => {
    serveLibrary([
      libraryExercise("pull-1", {
        muscle_groups: ["back", "lats", "biceps", "forearms", "traps"],
      }),
    ]);
    seedActivePlan();
    await mount();

    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByLabelText("і ще 2 групи м’язів")).toBeTruthy();
  });

  it("says the User is all set when the Plan has no Workouts", async () => {
    backend.seedPlan({
      id: "plan-1",
      is_active: true,
      name: "Сила",
      workouts: [],
    });
    await mount();

    expect(screen.getByText("Чудова робота! Усе готово!")).toBeTruthy();
  });

  it("asks the User to activate or create a Plan when none is active", async () => {
    backend.seedPlan({ id: "plan-1", name: "Сила", workouts: [] });
    await mount();

    expect(screen.getByText("Немає активного плану")).toBeTruthy();
    expect(
      screen.getByText("Активуйте один зі своїх планів або створіть новий.")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Створити план тренувань" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Керувати планами" })
    ).toBeTruthy();
  });

  it("says the Plans couldn't load, and loads them again on Try Again", async () => {
    seedActivePlan();
    backend.failNext("plans", "select");
    await mount();

    expect(screen.getByText("Не вдалося завантажити план")).toBeTruthy();
    expect(
      screen.getByText("Перевірте з’єднання й спробуйте ще раз.")
    ).toBeTruthy();
    expect(screen.queryByText("Немає активного плану")).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", { name: "Спробувати ще раз" })
    );
    await settle(queryClient);

    expect(screen.getByRole("heading", { name: "Ноги" })).toBeTruthy();
  });
});
