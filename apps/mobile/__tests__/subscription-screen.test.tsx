/**
 * The Subscription screen on the mounted-screen seam: the real screen with
 * RevenueCat for the fake customer, the paywall stood in, the app's Toaster
 * beside it and the SwiftUI-backed Button for its stand-in, in English and
 * Ukrainian; and Profile's Subscription row opening it.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Linking } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import ProfileScreen from "~/app/profile";
import SubscriptionScreen from "~/app/subscription";
import { Toaster } from "~/components/ui/toast";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { backend } from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

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

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mount = async (
  children: ReactNode = <SubscriptionScreen />,
  { waitForReads = true } = {}
) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        {children}
        <Toaster />
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
    active: "Active",
    appStore: "Billed through the App Store",
    cancelled: "Cancelled",
    date: "November 30, 2026",
    endsOn: "Ends on",
    freeTitle: "You're on Free",
    heading: "Your Subscription",
    lifetime: "Lifetime",
    loadError: "Couldn't load subscription",
    loading: "Loading subscription",
    manage: "Manage Subscription",
    monthly: "Fitme Pro · Monthly",
    nothingToRestore: "No purchases to restore",
    playStore: "Billed through Google Play",
    productLifetime: "Fitme Pro · Lifetime",
    profileRow: "Subscription",
    renewsOn: "Renews on",
    restore: "Restore Purchases",
    restored: "Purchases restored",
    restoreFailed:
      "Couldn't restore purchases. Check your connection and try again.",
    status: "Status",
    subscription: "Subscription",
    trial: "Free trial",
    trialEndsOn: "Trial ends on",
    tryAgain: "Try Again",
    upgrade: "Upgrade to Pro",
    yearly: "Fitme Pro · Yearly",
  },
  uk: {
    active: "Активна",
    appStore: "Оплата через App Store",
    cancelled: "Скасована",
    date: "30 листопада 2026 р.",
    endsOn: "Закінчення",
    freeTitle: "У вас Free",
    heading: "Ваша підписка",
    lifetime: "Довічна",
    loadError: "Не вдалося завантажити підписку",
    loading: "Завантаження підписки",
    manage: "Керувати підпискою",
    monthly: "Fitme Pro · Щомісяця",
    nothingToRestore: "Немає покупок для відновлення",
    playStore: "Оплата через Google Play",
    productLifetime: "Fitme Pro · Довічно",
    profileRow: "Підписка",
    renewsOn: "Поновлення",
    restore: "Відновити покупки",
    restored: "Покупки відновлено",
    restoreFailed:
      "Не вдалося відновити покупки. Перевірте з’єднання і спробуйте ще раз.",
    status: "Статус",
    subscription: "Підписка",
    trial: "Пробний період",
    trialEndsOn: "Кінець пробного періоду",
    tryAgain: "Спробувати ще раз",
    upgrade: "Перейти на Pro",
    yearly: "Fitme Pro · Щороку",
  },
} as const;

/** A detail row's label and value, as VoiceOver reads them. */
const row = (testID: string) => {
  const element = screen.getByTestId(testID);

  return {
    label: element.props.accessibilityLabel as string,
    value: (element.props.accessibilityValue as { text: string }).text,
  };
};

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("the Subscription screen in %s", (language, deviceLanguages) => {
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

  it("opens from Profile's Subscription row", async () => {
    await mount(<ProfileScreen />);

    await fireEvent.press(screen.getByLabelText(copy.profileRow));

    expect(router.push).toHaveBeenCalledWith("/subscription");
  });

  it.each([
    ["renewing", "active", "renewsOn"],
    ["trial", "trial", "trialEndsOn"],
    ["cancelled", "cancelled", "endsOn"],
  ] as const)(
    "shows a %s Subscription's plan line, status, date, store and Manage",
    async (state, status, dateRow) => {
      const openUrl = jest
        .spyOn(Linking, "openURL")
        .mockResolvedValue(undefined);

      fakeRevenueCat.setPro(state, { expiresAt: EXPIRES_AT });
      await mount();

      expect(screen.getByText(copy.heading)).toBeTruthy();
      expect(row("subscription-product")).toEqual({
        label: copy.subscription,
        value: copy.yearly,
      });
      expect(row("subscription-status")).toEqual({
        label: copy.status,
        value: copy[status],
      });
      expect(row("subscription-date")).toEqual({
        label: copy[dateRow],
        value: copy.date,
      });
      expect(screen.getByText(copy.appStore)).toBeTruthy();
      expect(screen.queryByText(copy.upgrade)).toBeNull();

      await fireEvent.press(screen.getByText(copy.manage));

      expect(openUrl).toHaveBeenCalledWith(MANAGEMENT_URL);
      openUrl.mockRestore();
    }
  );

  it("names a monthly product's period", async () => {
    fakeRevenueCat.setPro("renewing", {
      billingPeriod: "P1M",
      expiresAt: EXPIRES_AT,
    });
    await mount();

    expect(row("subscription-product").value).toBe(copy.monthly);
  });

  it("names Google Play for a Subscription billed there", async () => {
    fakeRevenueCat.setPro("renewing", {
      expiresAt: EXPIRES_AT,
      store: "PLAY_STORE",
    });
    await mount();

    expect(screen.getByText(copy.playStore)).toBeTruthy();
    expect(screen.queryByText(copy.appStore)).toBeNull();
  });

  it("shows a lifetime Subscription with no date and no Manage", async () => {
    fakeRevenueCat.setPro("lifetime");
    await mount();

    expect(row("subscription-product").value).toBe(copy.productLifetime);
    expect(row("subscription-status").value).toBe(copy.lifetime);
    expect(screen.queryByTestId("subscription-date")).toBeNull();
    expect(screen.getByText(copy.appStore)).toBeTruthy();
    expect(screen.queryByText(copy.manage)).toBeNull();
  });

  it("shows a promotional grant with its end and no billing line", async () => {
    fakeRevenueCat.setPro("promotional", { expiresAt: EXPIRES_AT });
    await mount();

    expect(row("subscription-product").value).toBe("Fitme Pro");
    expect(row("subscription-status").value).toBe(copy.active);
    expect(row("subscription-date")).toEqual({
      label: copy.endsOn,
      value: copy.date,
    });
    expect(screen.queryByTestId("subscription-billing")).toBeNull();
    expect(screen.queryByText(copy.manage)).toBeNull();
  });

  it("offers a free User the upgrade, which presents the paywall", async () => {
    await mount();

    expect(screen.getByText(copy.freeTitle)).toBeTruthy();
    expect(screen.queryByText(copy.heading)).toBeNull();
    expect(screen.queryByText(copy.manage)).toBeNull();

    await fireEvent.press(screen.getByText(copy.upgrade));

    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
  });

  it.each(["free", "pro"] as const)(
    "restores purchases for a %s User and says whether it found Fitme Pro",
    async (kind) => {
      if (kind === "pro") {
        fakeRevenueCat.setPro("renewing", { expiresAt: EXPIRES_AT });
      }

      const client = await mount();

      await fireEvent.press(screen.getByText(copy.restore));
      await settle(client);

      expect(fakeRevenueCat.restores).toBe(1);
      expect(
        screen.getByText(kind === "pro" ? copy.restored : copy.nothingToRestore)
      ).toBeTruthy();
    }
  );

  it("says an offline restore failed, keeps the screen and reports nothing", async () => {
    fakeRevenueCat.failNextRestore();
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.restore));
    await settle(client);

    expect(fakeRevenueCat.restores).toBe(1);
    expect(screen.getByText(copy.restoreFailed)).toBeTruthy();
    expect(screen.getByText(copy.freeTitle)).toBeTruthy();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("says a store failure failed and reports it", async () => {
    fakeRevenueCat.failNextRestore("store");
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.restore));
    await settle(client);

    expect(screen.getByText(copy.restoreFailed)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the User backs out of the store's prompt", async () => {
    fakeRevenueCat.failNextRestore("cancelled");
    const client = await mount();

    await fireEvent.press(screen.getByText(copy.restore));
    await settle(client);

    expect(fakeRevenueCat.restores).toBe(1);
    expect(screen.queryByText(copy.restoreFailed)).toBeNull();
    expect(screen.queryByText(copy.nothingToRestore)).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("tells nobody when the User signed out before the restore answered", async () => {
    const release = fakeRevenueCat.holdReads();
    const client = await mount(<SubscriptionScreen />, { waitForReads: false });
    release();
    await settle(client);

    const hold = fakeRevenueCat.holdReads();
    await fireEvent.press(screen.getByText(copy.restore));
    signInAs(null);
    hold();
    await settle(client);

    expect(fakeRevenueCat.restores).toBe(1);
    expect(screen.queryByText(copy.nothingToRestore)).toBeNull();
  });

  it("shows what a restore brings back", async () => {
    const client = await mount();
    fakeRevenueCat.setPro("renewing", { expiresAt: EXPIRES_AT });

    await fireEvent.press(screen.getByText(copy.restore));
    await settle(client);

    expect(screen.getByText(copy.restored)).toBeTruthy();
    expect(screen.queryByText(copy.freeTitle)).toBeNull();
    expect(row("subscription-status").value).toBe(copy.active);
  });

  it("shows a skeleton, never the Free card, while it loads", async () => {
    const release = fakeRevenueCat.holdReads();
    fakeRevenueCat.setPro("renewing", { expiresAt: EXPIRES_AT });

    const client = await mount(<SubscriptionScreen />, {
      waitForReads: false,
    });

    expect(screen.getByLabelText(copy.loading)).toBeTruthy();
    expect(screen.queryByText(copy.freeTitle)).toBeNull();
    expect(screen.queryByText(copy.restore)).toBeNull();

    release();
    await settle(client);

    expect(screen.queryByLabelText(copy.loading)).toBeNull();
    expect(row("subscription-status").value).toBe(copy.active);
  });

  it("says it couldn't load, keeps Restore and reads again on Try Again", async () => {
    fakeRevenueCat.failReads();
    const client = await mount();

    expect(screen.getByText(copy.loadError)).toBeTruthy();
    expect(screen.queryByText(copy.freeTitle)).toBeNull();
    expect(screen.getByText(copy.restore)).toBeTruthy();

    fakeRevenueCat.setPro("trial", { expiresAt: EXPIRES_AT });
    await fireEvent.press(screen.getByText(copy.tryAgain));
    await settle(client);

    expect(screen.queryByText(copy.loadError)).toBeNull();
    expect(row("subscription-status").value).toBe(copy.trial);
  });
});
