/**
 * The Profile screen, Legal & Privacy and Support on a Ukrainian device: the
 * real screens under the root layout's language sync, with the Public API's
 * `fetch` swapped for its fake, Clerk for the fake Clerk User, RevenueCat for
 * the fake customer (Free) and the SwiftUI-backed Button for its stand-in.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import LegalScreen from "~/app/legal";
import ProfileScreen from "~/app/profile";
import SupportScreen from "~/app/support";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

// Each Screen's title, as the native header shows it.
jest.mock("expo-router", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Link: ({ children }: { children: ReactNode }) => children,
    router: { push: jest.fn(), replace: jest.fn() },
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <MockText>{options.title}</MockText> : null,
    },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.4.0",
  nativeBuildVersion: "212",
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

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

describe("Profile, Legal and Support on a Ukrainian device", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
    jest.clearAllMocks();
    backend.reset();
    fakeClerk.setUser({
      createdAt: new Date("2025-03-14T12:00:00.000Z"),
      emailAddresses: ["taras@example.com"],
      firstName: "Тарас",
      lastName: "Шевченко",
    });
  });

  it("shows the Profile screen in Ukrainian, with no Settings row", async () => {
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    await mount(<ProfileScreen />);

    for (const text of [
      "Профіль",
      "Тарас Шевченко",
      "taras@example.com",
      "Дата реєстрації: березень 2025 р.",
      "Обліковий запис",
      "Допомога",
      // The saved system, read through the Public API.
      "США",
      "Українська",
      "Вийти",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    for (const row of [
      "Редагувати профіль",
      "Обліковий запис і безпека",
      "Підписка",
      "Одиниці",
      "Мова",
      "Підтримка",
      "Оцінити Fitme",
      "Правова інформація і конфіденційність",
    ]) {
      expect(screen.getByLabelText(row)).toBeTruthy();
    }

    // Settings is gone, and Delete Account lives in Account & Security only.
    expect(screen.queryByTestId("settings-link")).toBeNull();
    expect(screen.queryByText("Видалити акаунт")).toBeNull();
  });

  it("shows Legal in Ukrainian, with no Delete Account", async () => {
    await mount(<LegalScreen />);

    for (const text of [
      "Правова інформація",
      "Політика конфіденційності",
      "Умови використання",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    expect(screen.queryByText("Видалити акаунт")).toBeNull();
  });

  it("shows Support in Ukrainian", async () => {
    await mount(<SupportScreen />);

    for (const text of [
      "Підтримка",
      "Контакти",
      "Написати в підтримку",
      "support@fitmeproject.com",
      "Стежте за Fitme",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});
