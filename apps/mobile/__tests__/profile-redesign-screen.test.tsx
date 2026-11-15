/**
 * The Profile screen behind the Profile redesign flag, on the mounted-screen
 * seam: the real screen and view, with Clerk for the fake Clerk User, the
 * Public API's `fetch` for its fake, RevenueCat for the fake customer and the
 * SwiftUI-backed Button for its stand-in, in English and Ukrainian.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Linking } from "react-native";

import ProfileScreen from "~/app/profile";
import { Toaster } from "~/components/ui/toast";
import { setProfileRedesignEnabled } from "~/lib/feature-flags";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { signedInUserId } from "~/test-utils/signed-in-user";

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

// The native build an installed app reports.
jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.4.0",
  nativeBuildVersion: "212",
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mount = async () => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ProfileScreen />
        <Toaster />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);

  return client;
};

const COPY = {
  en: {
    account: "Account",
    help: "Help",
    language: "Language",
    languageName: "English",
    logOut: "Log Out",
    logOutFailed: "Couldn't log out. Check your connection and try again.",
    memberSince: "Member since March 2025",
    metric: "Metric",
    preferences: "Preferences",
    rows: [
      "Edit Profile",
      "Account & Security",
      "Subscription",
      "Units",
      "Support",
      "Rate Fitme",
      "Legal & Privacy",
    ],
  },
  uk: {
    account: "Обліковий запис",
    help: "Допомога",
    language: "Мова",
    languageName: "Українська",
    logOut: "Вийти",
    logOutFailed: "Не вдалося вийти. Перевірте з’єднання і спробуйте ще раз.",
    memberSince: "Дата реєстрації: березень 2025 р.",
    metric: "Метрична",
    preferences: "Налаштування",
    rows: [
      "Редагувати профіль",
      "Обліковий запис і безпека",
      "Підписка",
      "Одиниці",
      "Підтримка",
      "Оцінити Fitme",
      "Правова інформація і конфіденційність",
    ],
  },
} as const;

describe("Profile with the redesign flag off", () => {
  it("is today's Profile screen", async () => {
    await mount();

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Logout")).toBeTruthy();
    expect(screen.queryByText("Member since March 2025")).toBeNull();
    expect(screen.queryByTestId("profile-version")).toBeNull();
  });
});

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("the redesigned Profile in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    setProfileRedesignEnabled(true);
    setDeviceLanguages([...deviceLanguages]);
    jest.clearAllMocks();
    backend.reset();
    fakeClerk.setUser({
      createdAt: new Date("2025-03-14T12:00:00.000Z"),
      emailAddresses: ["kirill@example.com"],
      firstName: "Kirill",
      imageUrl: "https://img.clerk.com/kirill.jpg",
      lastName: null,
    });
  });

  it("shows the header with the photo, name, email and Member since", async () => {
    await mount();

    expect(screen.getByText("Kirill")).toBeTruthy();
    expect(screen.getByText("kirill@example.com")).toBeTruthy();
    expect(screen.getByText(copy.memberSince)).toBeTruthy();
    expect(screen.getByTestId("profile-header-photo").props.source).toEqual({
      uri: "https://img.clerk.com/kirill.jpg",
    });
  });

  it("shows the Account, Preferences and Help lists", async () => {
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "metric" });
    await mount();

    for (const text of [copy.account, copy.preferences, copy.help]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    for (const row of copy.rows) {
      expect(screen.getByLabelText(row)).toBeTruthy();
    }

    expect(screen.getByText(copy.metric)).toBeTruthy();
  });

  it("names the App language in its own name and opens Fitme's Settings page", async () => {
    const openSettings = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue(undefined);

    await mount();

    expect(screen.getByText(copy.languageName)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(copy.language));

    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it("logs out and goes to login", async () => {
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.logOut));
    await settle(client);

    expect(fakeClerk.calls.map((call) => call.method)).toContain("signOut");
    expect(signedInUserId()).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/auth/login");
  });

  it("keeps the User signed in and says so when logging out fails offline", async () => {
    fakeClerk.failNext("signOut", "network");
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.logOut));
    await settle(client);

    expect(signedInUserId()).toBe(FAKE_USER_ID);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText(copy.logOutFailed)).toBeTruthy();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports a log out failure that isn't the connection", async () => {
    fakeClerk.failNext("signOut", { code: "internal_clerk_error" });
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.logOut));
    await settle(client);

    expect(signedInUserId()).toBe(FAKE_USER_ID);
    expect(screen.getByText(copy.logOutFailed)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("shows the app version and build", async () => {
    await mount();

    expect(screen.getByTestId("profile-version")).toHaveTextContent(
      "Fitme 1.4.0 (212)"
    );
  });
});
