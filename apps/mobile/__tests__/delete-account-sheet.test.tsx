/**
 * The Delete sheet over Account & Security: the real screens over the fake
 * Clerk User and the fake RevenueCat customer, in English and Ukrainian. What
 * a test asserts is what the User sees, the calls that reached Clerk, and
 * whether this device's Arnold Conversation is still there.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Linking, Platform } from "react-native";

import AccountSecurityScreen from "~/app/account-security";
import DeleteAccountSheet from "~/app/delete-account";
import { markConfirmSheetClosed } from "~/hooks/reverification";
import {
  loadSavedArnoldConversation,
  saveArnoldSession,
} from "~/lib/arnold-chat";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import type { ProState } from "~/test-utils/fake-revenuecat";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import {
  pushedRoutes,
  PushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useNavigation: () => ({ isFocused: () => true }),
    useRouter: () => stub.stubRouter,
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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const COPY = {
  en: {
    cancel: "Cancel",
    confirm: "Delete Account",
    failed: "Couldn't delete your account. Try again.",
    manage: "Manage Subscription",
    message:
      "Your workouts, plans, profile and Arnold chats will be permanently deleted. This can't be undone.",
    title: "Delete your account?",
    warningAppStore:
      "Your App Store subscription won't be cancelled automatically. Manage it in the App Store to stop billing.",
    warningGooglePlay:
      "Your Google Play subscription won't be cancelled automatically. Manage it in Google Play to stop billing.",
  },
  uk: {
    cancel: "Скасувати",
    confirm: "Видалити акаунт",
    failed: "Не вдалося видалити акаунт. Спробуй ще раз.",
    manage: "Керувати підпискою",
    message:
      "Твої тренування, плани, профіль і чати з Arnold буде видалено назавжди. Це не можна скасувати.",
    title: "Видалити акаунт?",
    warningAppStore:
      "Твою підписку в App Store не буде скасовано автоматично. Керуй нею в App Store, щоб припинити оплату.",
    warningGooglePlay:
      "Твою підписку в Google Play не буде скасовано автоматично. Керуй нею в Google Play, щоб припинити оплату.",
  },
} as const;

const MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";

const platform = Platform.OS;

let queryClient = createTestQueryClient();

/** Account & Security, then the Delete sheet opened from its last row. */
const openSheet = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <AccountSecurityScreen />
        <PushedRoutes screens={{ "/delete-account": DeleteAccountSheet }} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
  await fireEvent.press(screen.getByTestId("delete-account"));
  await settle(queryClient);
};

const press = async (testID: string) => {
  await fireEvent.press(screen.getByTestId(testID));
  await settle(queryClient);
};

const paths = () => pushedRoutes().map(({ pathname }) => pathname);

const clerkCalls = () => fakeClerk.calls.map(({ method }) => method);

const hasConversation = () =>
  loadSavedArnoldConversation(FAKE_USER_ID).session !== undefined;

afterEach(() => {
  Platform.OS = platform;
  // "Confirm it's you" isn't mounted here; its unmount is what lets the next
  // ask open the sheet again.
  markConfirmSheetClosed();
});

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("the Delete sheet in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    setDeviceLanguages([...deviceLanguages]);
    resetStubRouter();
    Platform.OS = "ios";
    fakeClerk.setUser({ emailAddresses: ["kirill@example.com"] });
    saveArnoldSession(FAKE_USER_ID, { sessionId: "session", streamIndex: 0 });
  });

  it("opens from Account & Security with what gets deleted, for a Free User", async () => {
    await openSheet();

    expect(paths()).toEqual(["/delete-account"]);
    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.message)).toBeTruthy();
    expect(screen.getByTestId("delete-account-confirm")).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.cancel })).toBeTruthy();
    expect(screen.queryByTestId("delete-account-billing-warning")).toBeNull();
    expect(screen.queryByText(copy.manage)).toBeNull();
  });

  it.each<ProState>(["renewing", "trial"])(
    "warns a %s Pro User the App Store keeps billing, with Manage Subscription",
    async (state) => {
      fakeRevenueCat.setPro(state);
      await openSheet();

      expect(screen.getByText(copy.warningAppStore)).toBeTruthy();

      await press("delete-account-manage");

      expect(screen.getByText(copy.manage)).toBeTruthy();
      expect(Linking.openURL).toHaveBeenCalledWith(MANAGEMENT_URL);
      expect(fakeClerk.deleted).toBe(false);
    }
  );

  it("holds Delete Account until the Subscription is known", async () => {
    fakeRevenueCat.setPro("renewing");
    const release = fakeRevenueCat.holdReads();
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <AccountSecurityScreen />
          <PushedRoutes screens={{ "/delete-account": DeleteAccountSheet }} />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await fireEvent.press(screen.getByTestId("delete-account"));

    expect(
      screen.getByTestId("delete-account-confirm").props.accessibilityState
    ).toMatchObject({ disabled: true });

    await act(() => {
      release();
    });
    await settle(queryClient);

    expect(screen.getByText(copy.warningAppStore)).toBeTruthy();
    expect(
      screen.getByTestId("delete-account-confirm").props.accessibilityState
    ).toMatchObject({ disabled: false });
  });

  it("names Google Play on Android", async () => {
    Platform.OS = "android";
    fakeRevenueCat.setPro("renewing", { store: "PLAY_STORE" });
    await openSheet();

    expect(screen.getByText(copy.warningGooglePlay)).toBeTruthy();
    expect(screen.queryByText(copy.warningAppStore)).toBeNull();
  });

  it.each<ProState>(["cancelled", "lifetime", "promotional"])(
    "has no billing warning for a %s Pro User",
    async (state) => {
      fakeRevenueCat.setPro(state);
      await openSheet();

      expect(screen.getByText(copy.title)).toBeTruthy();
      expect(screen.queryByTestId("delete-account-billing-warning")).toBeNull();
      expect(screen.queryByText(copy.manage)).toBeNull();
    }
  );

  it("deletes the account, cleans up and lands on the signed-out screen", async () => {
    await openSheet();
    await press("delete-account-confirm");

    expect(fakeClerk.deleted).toBe(true);
    expect(clerkCalls()).toEqual(["delete", "signOut"]);
    expect(hasConversation()).toBe(false);
    expect(paths().at(-1)).toBe("/auth");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks "Confirm it\'s you" first when Clerk wants it, then deletes', async () => {
    fakeClerk.requireReverification();
    await openSheet();
    // Waits on "Confirm it's you", so nothing settles until it's answered.
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));

    expect(paths()).toEqual(["/delete-account", "/confirm-identity"]);
    expect(fakeClerk.deleted).toBe(false);

    await act(() => {
      fakeClerk.completeReverification();
    });
    await settle(queryClient);

    expect(fakeClerk.deleted).toBe(true);
    expect(hasConversation()).toBe(false);
    expect(paths().at(-1)).toBe("/auth");
  });

  it('changes nothing when the User cancels "Confirm it\'s you"', async () => {
    fakeClerk.requireReverification();
    await openSheet();
    // Waits on "Confirm it's you", so nothing settles until it's answered.
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await act(() => {
      fakeClerk.cancelReverification();
    });
    await settle(queryClient);

    expect(fakeClerk.deleted).toBe(false);
    expect(clerkCalls()).toEqual([]);
    expect(hasConversation()).toBe(true);
    expect(paths()).not.toContain("/auth");
    expect(Alert.alert).not.toHaveBeenCalled();
    // The sheet is as it was: Delete Account can be pressed again.
    expect(
      screen.getByTestId("delete-account-confirm").props.accessibilityState
    ).toMatchObject({ busy: false, disabled: false });
  });

  it("keeps the account and the Conversation when Clerk refuses, and says so", async () => {
    fakeClerk.failNext("delete", "network");
    await openSheet();
    await press("delete-account-confirm");

    expect(fakeClerk.deleted).toBe(false);
    expect(clerkCalls()).not.toContain("signOut");
    expect(hasConversation()).toBe(true);
    expect(paths()).toEqual(["/delete-account"]);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[0]).toBe(copy.failed);
  });

  it("closes on Cancel without deleting anything", async () => {
    fakeRevenueCat.setPro("renewing");
    await openSheet();
    await press("delete-account-cancel");

    expect(paths()).toEqual([]);
    expect(fakeClerk.deleted).toBe(false);
    expect(clerkCalls()).toEqual([]);
    expect(hasConversation()).toBe(true);
  });
});
