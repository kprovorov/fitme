/**
 * The Profile tab, Settings, Legal and Support on a Ukrainian device: the real
 * screens under the root layout's language sync, with Supabase swapped for the
 * in-memory backend, Clerk for a signed-in User, RevenueCat for a free plan
 * and the SwiftUI-backed primitives for stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import LegalScreen from "~/app/legal";
import SettingsScreen from "~/app/settings";
import SupportScreen from "~/app/support";
import ProfileView from "~/components/views/profile-view";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

// Each Screen's title, as the native header shows it.
jest.mock("expo-router", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Link: ({ children }: { children: ReactNode }) => children,
    router: { replace: jest.fn() },
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <MockText>{options.title}</MockText> : null,
    },
  };
});

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The signed-in Clerk User; deleting the account fails without a Clerk error.
const mockUser = {
  delete: jest.fn(() => Promise.reject(new Error("offline"))),
  fullName: "Тарас Шевченко",
  id: "user_test",
  primaryEmailAddress: { emailAddress: "taras@example.com" },
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: () => false,
  useUser: () => ({ isLoaded: true, user: mockUser }),
}));

jest.mock("~/lib/clerk", () => ({
  ...jest.requireActual<typeof import("~/lib/clerk")>("~/lib/clerk"),
  getClerk: () => ({ signOut: jest.fn(), user: mockUser }),
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("~/hooks/revenueCat", () => ({
  useCustomerInfoQuery: () => ({ data: undefined }),
  useIsProQuery: () => ({ data: false }),
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// The native alert stand-in: its trigger, then its title, message and
// buttons, as the alert shows them once opened. Top-level (and
// `mock`-prefixed, so the factory may use it) because the React Compiler
// rewrites components declared inside a `jest.mock` factory into code the
// factory can't reach.
const MockAlertDialog = ({
  actions,
  children,
  message,
  title,
}: {
  actions: { label: string; onPress?: () => void }[];
  children?: ReactNode;
  message?: string;
  title: string;
}) => (
  <View testID="alert-dialog">
    {children}
    <Text>{title}</Text>
    {message ? <Text>{message}</Text> : null}
    {actions.map((action) => (
      <Pressable
        accessibilityRole="button"
        key={action.label}
        onPress={action.onPress}
      >
        <Text>{action.label}</Text>
      </Pressable>
    ))}
  </View>
);

jest.mock("~/components/ui/alert-dialog", () => ({
  AlertDialog: (props: Parameters<typeof MockAlertDialog>[0]) => (
    <MockAlertDialog {...props} />
  ),
}));

const mount = async (element: ReactNode) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>{element}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
  return client;
};

describe("Profile and Settings on a Ukrainian device", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
    jest.clearAllMocks();
    backend.reset();
  });

  it("shows the Profile tab in Ukrainian", async () => {
    await mount(<ProfileView />);

    expect(screen.getByText("Тарас Шевченко")).toBeTruthy();
    expect(screen.getByText("У вас безкоштовний план")).toBeTruthy();
    expect(screen.getByText("Перейти на Pro")).toBeTruthy();
    for (const item of [
      "Редагувати профіль",
      "Налаштування",
      "Підтримка",
      "Правова інформація",
      "Вийти",
      "Подобається застосунок?",
      "Оцініть його в App Store!",
    ]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("shows Settings and the account-deletion confirmation in Ukrainian", async () => {
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    await mount(<SettingsScreen />);

    expect(screen.getByText("Налаштування")).toBeTruthy();
    expect(screen.getByText("Система вимірювання")).toBeTruthy();
    expect(screen.getByText("США")).toBeTruthy();
    // The menu item, then the confirmation's title.
    expect(screen.getAllByText("Видалити акаунт")).toHaveLength(2);
    expect(
      screen.getByText(
        "Ваш акаунт і всі пов’язані з ним дані буде видалено назавжди. Цю дію не можна скасувати."
      )
    ).toBeTruthy();
    expect(screen.getByText("Скасувати")).toBeTruthy();
    expect(screen.getByText("Видалити")).toBeTruthy();
  });

  it("says in Ukrainian that the account couldn't be deleted", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {
      // The native alert isn't shown under Jest.
    });
    const client = await mount(<SettingsScreen />);

    await fireEvent.press(screen.getByText("Видалити"));
    await settle(client);

    expect(mockUser.delete).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "Не вдалося видалити акаунт",
      "Щось пішло не так. Спробуйте пізніше."
    );
    alert.mockRestore();
  });

  it("shows Legal and its account-deletion confirmation in Ukrainian", async () => {
    await mount(<LegalScreen />);

    for (const text of [
      "Правова інформація",
      "Політика конфіденційності",
      "Умови використання",
      "Видалити акаунт",
      "Ви впевнені, що хочете видалити акаунт?",
      "Цю дію не можна скасувати. Ваш акаунт буде видалено назавжди, а ваші дані — з наших серверів.",
      "Скасувати",
      "Так, видалити мій акаунт",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("shows Support in Ukrainian", async () => {
    await mount(<SupportScreen />);

    expect(screen.getByText("Підтримка")).toBeTruthy();
    expect(
      screen.getByText("Пишіть нам будь-коли, якщо маєте запитання чи відгуки")
    ).toBeTruthy();
    expect(screen.getByText("support@fitmeproject.com")).toBeTruthy();
  });
});
