/**
 * The Subscription card on Profile, on the mounted-screen
 * seam: the real Profile screen with RevenueCat for the fake customer, Clerk
 * for the fake Clerk User and the SwiftUI-backed Button for its stand-in, in
 * English and Ukrainian.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import ProfileScreen from "~/app/profile";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { backend } from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

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
  default: { presentPaywall: jest.fn(() => Promise.resolve("NOT_PRESENTED")) },
}));

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

const mount = async ({ waitForReads = true } = {}) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ProfileScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );

  if (waitForReads) {
    await settle(client);
  }

  return client;
};

/** When the Subscription renews, ends or its trial ends, in every test. */
const EXPIRES_AT = "2026-11-30T12:00:00.000Z";

const MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";

const COPY = {
  en: {
    endsOn: "Ends on November 30, 2026",
    freeDescription: "Pro unlocks Arnold AI and AI-built plans.",
    freeTitle: "You're on Free",
    lifetime: "Lifetime",
    loadError: "Couldn't load subscription",
    loading: "Loading subscription",
    manage: "Manage",
    renewsOn: "Renews on November 30, 2026",
    trialEndsOn: "Trial ends on November 30, 2026",
    tryAgain: "Try Again",
    upgrade: "Upgrade to Pro",
  },
  uk: {
    endsOn: "Закінчується 30 листопада 2026 р.",
    freeDescription: "Pro відкриває Arnold AI і плани, створені ШІ.",
    freeTitle: "У вас Free",
    lifetime: "Довічно",
    loadError: "Не вдалося завантажити підписку",
    loading: "Завантаження підписки",
    manage: "Керувати",
    renewsOn: "Поновиться 30 листопада 2026 р.",
    trialEndsOn: "Пробний період до 30 листопада 2026 р.",
    tryAgain: "Спробувати ще раз",
    upgrade: "Перейти на Pro",
  },
} as const;

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("the Subscription card in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    setDeviceLanguages([...deviceLanguages]);
    jest.clearAllMocks();
    backend.reset();
    fakeClerk.setUser({
      createdAt: new Date("2025-03-14T12:00:00.000Z"),
      emailAddresses: ["kirill@example.com"],
      firstName: "Kirill",
    });
  });

  it("offers a free User the upgrade, which presents the paywall", async () => {
    await mount();

    expect(screen.getByText(copy.freeTitle)).toBeTruthy();
    expect(screen.getByText(copy.freeDescription)).toBeTruthy();
    expect(screen.queryByText("Fitme Pro")).toBeNull();
    expect(screen.queryByText(copy.manage)).toBeNull();

    await fireEvent.press(screen.getByText(copy.upgrade));

    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["renewing", "renewsOn"],
    ["trial", "trialEndsOn"],
    ["cancelled", "endsOn"],
  ] as const)(
    "shows a %s Pro User Fitme Pro, its date and Manage",
    async (state, line) => {
      const openUrl = jest
        .spyOn(Linking, "openURL")
        .mockResolvedValue(undefined);

      fakeRevenueCat.setPro(state, { expiresAt: EXPIRES_AT });
      await mount();

      expect(screen.getByText("Fitme Pro")).toBeTruthy();
      expect(screen.getByText(copy[line])).toBeTruthy();
      expect(screen.queryByText(copy.upgrade)).toBeNull();

      await fireEvent.press(screen.getByText(copy.manage));

      expect(openUrl).toHaveBeenCalledWith(MANAGEMENT_URL);
      openUrl.mockRestore();
    }
  );

  it("hides Manage when RevenueCat has no management page", async () => {
    fakeRevenueCat.setPro("renewing", {
      expiresAt: EXPIRES_AT,
      managementURL: null,
    });
    await mount();

    expect(screen.getByText(copy.renewsOn)).toBeTruthy();
    expect(screen.queryByText(copy.manage)).toBeNull();
  });

  it("shows a lifetime Pro User Lifetime with no date and no Manage", async () => {
    fakeRevenueCat.setPro("lifetime");
    await mount();

    expect(screen.getByText("Fitme Pro")).toBeTruthy();
    expect(screen.getByText(copy.lifetime)).toBeTruthy();
    expect(screen.queryByText(copy.manage)).toBeNull();
    expect(screen.queryByText(copy.upgrade)).toBeNull();
  });

  it("shows a promotional grant's end with no Manage", async () => {
    fakeRevenueCat.setPro("promotional", { expiresAt: EXPIRES_AT });
    await mount();

    expect(screen.getByText("Fitme Pro")).toBeTruthy();
    expect(screen.getByText(copy.endsOn)).toBeTruthy();
    expect(screen.queryByText(copy.manage)).toBeNull();
  });

  it("shows a skeleton, never the Free card, while it loads", async () => {
    const release = fakeRevenueCat.holdReads();
    fakeRevenueCat.setPro("renewing", { expiresAt: EXPIRES_AT });
    const client = await mount({ waitForReads: false });

    expect(screen.getByLabelText(copy.loading)).toBeTruthy();
    expect(screen.queryByText(copy.freeTitle)).toBeNull();
    expect(screen.queryByText(copy.upgrade)).toBeNull();

    release();
    await settle(client);

    expect(screen.queryByLabelText(copy.loading)).toBeNull();
    expect(screen.getByText(copy.renewsOn)).toBeTruthy();
  });

  it("says it couldn't load, keeps Profile usable, and reads again on Try Again", async () => {
    fakeRevenueCat.failReads();
    const client = await mount();

    expect(screen.getByText(copy.loadError)).toBeTruthy();
    expect(screen.queryByText(copy.freeTitle)).toBeNull();
    expect(screen.getByText("kirill@example.com")).toBeTruthy();
    expect(screen.getByTestId("logout-button")).toBeTruthy();

    fakeRevenueCat.setPro("renewing", { expiresAt: EXPIRES_AT });
    await fireEvent.press(screen.getByText(copy.tryAgain));
    await settle(client);

    expect(screen.queryByText(copy.loadError)).toBeNull();
    expect(screen.getByText(copy.renewsOn)).toBeTruthy();
  });
});
