/**
 * The Account & Security screen, opened from Profile's Account
 * list: the real screen over the fake Clerk User, on iOS and Android, in
 * English and Ukrainian, with the in-app browser stood in: Connect and
 * Disconnect. Delete Account's sheet has its own test
 * (`delete-account-sheet.test.tsx`); change email comes with its own ticket.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { captureException } from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Platform } from "react-native";
import type { AlertButton } from "react-native";

import AccountSecurityScreen from "~/app/account-security";
import ProfileScreen from "~/app/profile";
import { markConfirmSheetClosed } from "~/hooks/reverification";
import { getClerk } from "~/lib/clerk";
import type { GoogleClientIds } from "~/lib/google-client-ids";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Link: ({ children }: { children: ReactNode }) => children,
    // Read lazily: the imports, this factory included, run before the
    // module's own declarations.
    get router() {
      return mockRouter;
    },
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <MockText>{options.title}</MockText> : null,
    },
    useRouter: () => mockRouter,
  };
});

interface AuthSessionResult {
  readonly type: "cancel" | "dismiss" | "success";
  readonly url?: string;
}

/**
 * The in-app browser sheet: what the provider's sign-in ends in. A test
 * sets it per case (finishing the round trip on the fake Clerk User first).
 */
let mockAuthSession: (
  url: string,
  redirectUrl: string
) => Promise<AuthSessionResult> = () => Promise.resolve({ type: "cancel" });

const mockOpenedSessions: { redirectUrl: string; url: string }[] = [];

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (url: string, redirectUrl: string) => {
    mockOpenedSessions.push({ redirectUrl, url });

    return mockAuthSession(url, redirectUrl);
  },
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: "automatic" },
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
  default: { presentPaywall: jest.fn() },
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

const GOOGLE_IDS: GoogleClientIds = {
  iosClientId: "123-ios.apps.googleusercontent.com",
  iosUrlScheme: "com.googleusercontent.apps.123-ios",
  webClientId: "123-web.apps.googleusercontent.com",
};

let mockGoogleClientIds: GoogleClientIds = GOOGLE_IDS;

jest.mock("~/lib/google-client-ids", () => ({
  googleClientIds: () => mockGoogleClientIds,
}));

let client = createTestQueryClient();

const mount = async (screenElement: ReactNode = <AccountSecurityScreen />) => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>{screenElement}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

/** The redirect Clerk sends the browser back to: the app's own scheme. */
const REDIRECT_URL = "fitme://account-security";

const COPY = {
  en: {
    addAnotherMethod: "Add another way to sign in first",
    apple: "Apple",
    cancel: "Cancel",
    alreadyLinked:
      "This Google account is already connected to another Fitme account.",
    appleUnavailable:
      "Signing in with Apple isn't available yet. Use Google or your email for now.",
    connect: "Connect",
    connectApple: "Connect Apple",
    connectFailed: "Couldn't connect Google. Try again.",
    connectGoogle: "Connect Google",
    connectedAs: "Connected as kirill@gmail.com",
    connecting: "Connecting…",
    connectingGoogle: "Connecting Google",
    deleteAccount: "Delete Account",
    disconnect: "Disconnect",
    disconnectAppleTitle: "Disconnect Apple?",
    disconnectFailed: "Couldn't disconnect Google. Try again.",
    disconnectGoogleMessage: "You won't be able to log in with Google anymore.",
    disconnectGoogleTitle: "Disconnect Google?",
    email: "Email",
    google: "Google",
    methods: "Sign-in Methods",
    notConnected: "Not connected",
    password: "Change Password",
    profileRow: "Account & Security",
    signIn: "Sign-in",
    title: "Account & Security",
  },
  uk: {
    addAnotherMethod: "Спершу додай інший спосіб входу",
    apple: "Apple",
    cancel: "Скасувати",
    alreadyLinked: "Цей акаунт Google уже під’єднано до іншого акаунта Fitme.",
    appleUnavailable:
      "Вхід через Apple поки недоступний. Поки що використовуй Google або ел. пошту.",
    connect: "Під’єднати",
    connectApple: "Під’єднати Apple",
    connectFailed: "Не вдалося під’єднати Google. Спробуй ще раз.",
    connectGoogle: "Під’єднати Google",
    connectedAs: "Під’єднано як kirill@gmail.com",
    connecting: "Під’єднання…",
    connectingGoogle: "Під’єднання Google",
    deleteAccount: "Видалити акаунт",
    disconnect: "Від’єднати",
    disconnectAppleTitle: "Від’єднати Apple?",
    disconnectFailed: "Не вдалося від’єднати Google. Спробуй ще раз.",
    disconnectGoogleMessage: "Ти більше не зможеш входити через Google.",
    disconnectGoogleTitle: "Від’єднати Google?",
    email: "Ел. пошта",
    google: "Google",
    methods: "Способи входу",
    notConnected: "Не під’єднано",
    password: "Змінити пароль",
    profileRow: "Обліковий запис і безпека",
    signIn: "Вхід",
    title: "Акаунт і безпека",
  },
} as const;

const platform = Platform.OS;

const alertCalls = () =>
  jest.mocked(Alert.alert).mock.calls as [string, string?, AlertButton[]?][];

/**
 * Presses the button named `label` in the last alert shown. It doesn't wait
 * for what the press starts, which may wait on "Confirm it's you".
 */
const pressInAlert = async (label: string) => {
  const buttons = alertCalls().at(-1)?.[2] ?? [];
  const button = buttons.find(({ text }) => text === label);

  if (!button) {
    throw new Error(`No "${label}" button in the last alert.`);
  }

  await act(() => {
    button.onPress?.();
  });
};

/** The Disconnect button of a provider's row. */
const disconnectButton = (testID: string, label: string) =>
  within(screen.getByTestId(testID)).getByRole("button", { name: label });

const disconnectCalls = () =>
  fakeClerk.calls.filter(({ method }) => method === "destroyExternalAccount");

/** Lets every pending Clerk answer land. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

afterEach(() => {
  Platform.OS = platform;
  // "Confirm it's you" never mounts here, so nothing closes it.
  markConfirmSheetClosed();
  jest.restoreAllMocks();
});

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("Account & Security in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenedSessions.length = 0;
    mockAuthSession = () => Promise.resolve({ type: "cancel" });
    jest.spyOn(console, "warn").mockReturnValue(undefined);
    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
    mockGoogleClientIds = GOOGLE_IDS;
    Platform.OS = "ios";
    setDeviceLanguages([...deviceLanguages]);
  });

  it("opens from Profile's Account & Security row", async () => {
    fakeClerk.setUser({ emailAddresses: ["kirill@example.com"] });
    await mount(<ProfileScreen />);

    await fireEvent.press(screen.getByLabelText(copy.profileRow));

    expect(router.push).toHaveBeenCalledWith("/account-security");
  });

  it("opens Change Password from its row", async () => {
    fakeClerk.setUser({ passwordEnabled: true });
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: copy.password }));

    expect(router.push).toHaveBeenCalledWith("/change-password");
  });

  it("shows a password User's email, Change Password and Delete Account", async () => {
    fakeClerk.setUser({
      emailAddresses: ["kirill@example.com", "old@example.com"],
      passwordEnabled: true,
    });
    await mount();

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.signIn)).toBeTruthy();
    expect(screen.getByText(copy.methods)).toBeTruthy();
    expect(screen.getByLabelText(copy.email).props.accessibilityValue).toEqual({
      text: "kirill@example.com",
    });
    expect(screen.getByText("kirill@example.com")).toBeTruthy();
    expect(screen.queryByText("old@example.com")).toBeNull();
    expect(screen.getByLabelText(copy.password)).toBeTruthy();
    expect(screen.getByText(copy.deleteAccount)).toBeTruthy();
  });

  it("leaves Change Password out for an Apple-only User", async () => {
    fakeClerk.setUser({
      emailAddresses: ["abc123@privaterelay.appleid.com"],
      externalAccounts: [
        { email: "abc123@privaterelay.appleid.com", provider: "apple" },
      ],
      passwordEnabled: false,
    });
    await mount();

    expect(screen.queryByText(copy.password)).toBeNull();
    expect(screen.getByLabelText(copy.apple).props.accessibilityValue).toEqual({
      text: COPY[language].connectedAs.replace(
        "kirill@gmail.com",
        "abc123@privaterelay.appleid.com"
      ),
    });
    expect(screen.getByLabelText(copy.google).props.accessibilityValue).toEqual(
      { text: copy.notConnected }
    );
  });

  it("shows Google connected with its account's email and Apple not connected", async () => {
    fakeClerk.setUser({
      emailAddresses: ["kirill@example.com"],
      externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
      passwordEnabled: true,
    });
    await mount();

    expect(screen.getByText("kirill@gmail.com")).toBeTruthy();
    expect(screen.getByLabelText(copy.google).props.accessibilityValue).toEqual(
      { text: copy.connectedAs }
    );
    expect(screen.getByText(copy.notConnected)).toBeTruthy();
    expect(screen.getByLabelText(copy.apple).props.accessibilityValue).toEqual({
      text: copy.notConnected,
    });
  });

  it("keeps a provider Not connected while its link is still unverified", async () => {
    fakeClerk.setUser({ passwordEnabled: true });
    await getClerk().user?.createExternalAccount({
      redirectUrl: "fitme://account-security",
      strategy: "oauth_google",
    });
    await mount();

    expect(screen.getByLabelText(copy.google).props.accessibilityValue).toEqual(
      { text: copy.notConnected }
    );
  });

  it("lists Apple and Google on iOS", async () => {
    fakeClerk.setUser({ passwordEnabled: true });
    await mount();

    expect(screen.getByLabelText(copy.apple)).toBeTruthy();
    expect(screen.getByLabelText(copy.google)).toBeTruthy();
  });

  it("lists only Google on Android, even for a User with Apple linked", async () => {
    Platform.OS = "android";
    fakeClerk.setUser({
      externalAccounts: [{ email: "kirill@icloud.com", provider: "apple" }],
      passwordEnabled: true,
    });
    await mount();

    expect(screen.queryByLabelText(copy.apple)).toBeNull();
    expect(screen.getByLabelText(copy.google)).toBeTruthy();
  });

  it("leaves Google out of a build without its client ids", async () => {
    mockGoogleClientIds = {
      iosClientId: "",
      iosUrlScheme: "",
      webClientId: "",
    };
    fakeClerk.setUser({ passwordEnabled: true });
    await mount();

    expect(screen.getByLabelText(copy.apple)).toBeTruthy();
    expect(screen.queryByLabelText(copy.google)).toBeNull();
  });

  describe("Disconnect", () => {
    it("lets a password User disconnect Google, after confirming", async () => {
      fakeClerk.setUser({
        emailAddresses: ["kirill@example.com"],
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      await mount();

      const button = disconnectButton("sign-in-method-google", copy.disconnect);
      expect(button.props.accessibilityState).toMatchObject({
        disabled: false,
      });
      // Apple isn't linked: nothing to disconnect there, only Connect.
      expect(
        within(screen.getByTestId("sign-in-method-apple"))
          .getAllByRole("button")
          .map(({ props }) => props.accessibilityLabel)
      ).toEqual([copy.connectApple]);

      await fireEvent.press(button);

      expect(alertCalls().at(-1)?.slice(0, 2)).toEqual([
        copy.disconnectGoogleTitle,
        copy.disconnectGoogleMessage,
      ]);
      expect(disconnectCalls()).toEqual([]);

      await pressInAlert(copy.disconnect);
      await flush();

      expect(disconnectCalls()).toEqual([
        {
          method: "destroyExternalAccount",
          params: expect.objectContaining({ provider: "google" }),
        },
      ]);
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.notConnected });
      // Disconnected: Google can be connected again.
      expect(
        within(screen.getByTestId("sign-in-method-google"))
          .getAllByRole("button")
          .map(({ props }) => props.accessibilityLabel)
      ).toEqual([copy.connectGoogle]);
      expect(alertCalls()).toHaveLength(1);
    });

    it("changes nothing when the confirmation is cancelled", async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.cancel);
      await flush();

      expect(disconnectCalls()).toEqual([]);
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.connectedAs });
    });

    it("blocks an Apple-only User's Disconnect, saying why", async () => {
      fakeClerk.setUser({
        emailAddresses: ["abc123@privaterelay.appleid.com"],
        externalAccounts: [
          { email: "abc123@privaterelay.appleid.com", provider: "apple" },
        ],
        passwordEnabled: false,
      });
      await mount();

      const button = disconnectButton("sign-in-method-apple", copy.disconnect);
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      expect(button.props.accessibilityHint).toBe(copy.addAnotherMethod);
      expect(
        within(screen.getByTestId("sign-in-method-apple")).getByText(
          copy.addAnotherMethod
        )
      ).toBeTruthy();

      await fireEvent.press(button);

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(disconnectCalls()).toEqual([]);
    });

    it("lets an Apple + Google User disconnect one, then blocks the other", async () => {
      fakeClerk.setUser({
        externalAccounts: [
          { email: "kirill@icloud.com", provider: "apple" },
          { email: "kirill@gmail.com", provider: "google" },
        ],
        passwordEnabled: false,
      });
      await mount();

      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: false });

      await fireEvent.press(
        disconnectButton("sign-in-method-apple", copy.disconnect)
      );
      expect(alertCalls().at(-1)?.[0]).toBe(copy.disconnectAppleTitle);
      await pressInAlert(copy.disconnect);
      await flush();

      expect(disconnectCalls()).toEqual([
        {
          method: "destroyExternalAccount",
          params: expect.objectContaining({ provider: "apple" }),
        },
      ]);
      expect(
        screen.getByLabelText(copy.apple).props.accessibilityValue
      ).toEqual({ text: copy.notConnected });
      // Google is now the only way in.
      const google = disconnectButton("sign-in-method-google", copy.disconnect);
      expect(google.props.accessibilityState).toMatchObject({ disabled: true });
      expect(google.props.accessibilityHint).toBe(copy.addAnotherMethod);
    });

    it("counts Apple as another way in on Android, where its row is hidden", async () => {
      Platform.OS = "android";
      fakeClerk.setUser({
        externalAccounts: [
          { email: "kirill@icloud.com", provider: "apple" },
          { email: "kirill@gmail.com", provider: "google" },
        ],
        passwordEnabled: false,
      });
      await mount();

      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: false });
    });

    it("keeps Google connected and says so when Clerk refuses", async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      fakeClerk.failNext("destroyExternalAccount", {
        code: "resource_forbidden",
      });
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.disconnect);
      await flush();

      expect(disconnectCalls()).toHaveLength(1);
      expect(alertCalls().at(-1)?.[0]).toBe(copy.disconnectFailed);
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.connectedAs });
      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: false });
    });

    it("takes an account already disconnected elsewhere as done", async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      fakeClerk.failNext("destroyExternalAccount", {
        code: "resource_not_found",
      });
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.disconnect);
      await flush();

      expect(alertCalls()).toHaveLength(1);
      expect(captureException).not.toHaveBeenCalled();
      expect(fakeClerk.calls.map(({ method }) => method)).toContain("reload");
    });

    it("doesn't report a disconnect that failed offline", async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      fakeClerk.failNext("destroyExternalAccount", "network");
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.disconnect);
      await flush();

      expect(alertCalls().at(-1)?.[0]).toBe(copy.disconnectFailed);
      expect(captureException).not.toHaveBeenCalled();
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.connectedAs });
    });

    it("asks \"Confirm it's you\" first, and changes nothing when it's cancelled", async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      fakeClerk.requireReverification();
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.disconnect);
      await flush();

      expect(router.push).toHaveBeenCalledWith("/confirm-identity");
      expect(disconnectCalls()).toEqual([]);

      await act(() => {
        fakeClerk.cancelReverification();
      });
      await flush();

      expect(disconnectCalls()).toEqual([]);
      expect(alertCalls()).toHaveLength(1);
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.connectedAs });
      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: false });
    });

    it('disconnects once "Confirm it\'s you" is completed', async () => {
      fakeClerk.setUser({
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      fakeClerk.requireReverification();
      await mount();

      await fireEvent.press(
        disconnectButton("sign-in-method-google", copy.disconnect)
      );
      await pressInAlert(copy.disconnect);
      await flush();
      await act(() => {
        fakeClerk.completeReverification();
      });
      await flush();

      expect(disconnectCalls()).toHaveLength(1);
      expect(
        screen.getByLabelText(copy.google).props.accessibilityValue
      ).toEqual({ text: copy.notConnected });
    });
  });

  describe("Connect", () => {
    beforeEach(() => {
      // "Confirm it's you" isn't mounted here: a test that opened it leaves
      // it open, as only the sheet itself says it closed.
      markConfirmSheetClosed();
      fakeClerk.setUser({
        emailAddresses: ["kirill@example.com"],
        passwordEnabled: true,
      });
    });

    const googleRow = () => screen.getByLabelText(copy.google);

    const connectGoogle = async () => {
      await fireEvent.press(screen.getByLabelText(copy.connectGoogle));
      await settle(client);
    };

    it("links Google through the in-app browser and shows it Connected", async () => {
      mockAuthSession = () => {
        fakeClerk.completeExternalAccount("google");

        return Promise.resolve({ type: "success", url: REDIRECT_URL });
      };

      await mount();

      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.notConnected,
      });
      await connectGoogle();

      expect(fakeClerk.calls).toEqual([
        {
          method: "createExternalAccount",
          params: { redirectUrl: REDIRECT_URL, strategy: "oauth_google" },
        },
        { method: "reload" },
      ]);
      expect(mockOpenedSessions).toEqual([
        {
          redirectUrl: REDIRECT_URL,
          url: expect.stringMatching(
            /^https:\/\/accounts\.example\.com\/oauth\/google\?id=/u
          ),
        },
      ]);
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.connectedAs.replace(
          "kirill@gmail.com",
          "tony@google.example"
        ),
      });
      expect(screen.getByText("tony@google.example")).toBeTruthy();
      expect(screen.queryByLabelText(copy.connectGoogle)).toBeNull();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("shows Connecting on the provider while the browser is open, with the other Connect held", async () => {
      let finish: (result: AuthSessionResult) => void = () => undefined;
      mockAuthSession = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      await mount();

      await connectGoogle();

      expect(screen.getByText(copy.connecting)).toBeTruthy();
      expect(
        screen.getByLabelText(copy.connectingGoogle).props.accessibilityState
      ).toMatchObject({ busy: true, disabled: true });
      expect(
        screen.getByLabelText(copy.connectApple).props.accessibilityState
      ).toMatchObject({ disabled: true });

      await act(async () => {
        finish({ type: "cancel" });
        await Promise.resolve();
      });
      await settle(client);

      expect(screen.queryByText(copy.connecting)).toBeNull();
      expect(
        screen.getByLabelText(copy.connectApple).props.accessibilityState
      ).toMatchObject({ disabled: false });
    });

    it("leaves Google Not connected, with no message, when the browser is closed", async () => {
      await mount();

      await connectGoogle();

      expect(mockOpenedSessions).toHaveLength(1);
      // The unverified link is taken back off the User: a retry starts clean.
      expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
        "createExternalAccount",
        "reload",
        "destroyExternalAccount",
      ]);
      expect(getClerk().user?.externalAccounts).toEqual([]);
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.notConnected,
      });
      expect(
        screen.getByLabelText(copy.connectGoogle).props.accessibilityState
      ).toMatchObject({ busy: false, disabled: false });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("holds Google's Disconnect while Apple connects", async () => {
      let finish: (result: AuthSessionResult) => void = () => undefined;
      mockAuthSession = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      fakeClerk.setUser({
        emailAddresses: ["kirill@example.com"],
        externalAccounts: [{ email: "kirill@gmail.com", provider: "google" }],
        passwordEnabled: true,
      });
      await mount();

      await fireEvent.press(screen.getByLabelText(copy.connectApple));
      await settle(client);

      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: true });

      await act(async () => {
        finish({ type: "cancel" });
        await Promise.resolve();
      });
      await settle(client);

      expect(
        disconnectButton("sign-in-method-google", copy.disconnect).props
          .accessibilityState
      ).toMatchObject({ disabled: false });
    });

    it("starts one Connect for two quick taps", async () => {
      let finish: (result: AuthSessionResult) => void = () => undefined;
      mockAuthSession = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      await mount();
      const button = screen.getByLabelText(copy.connectGoogle);

      const tap = () =>
        button.props.onClick({ nativeEvent: {}, persist: () => undefined });

      // Both taps reach the button before it re-renders as busy.
      await act(async () => {
        tap();
        tap();
        await Promise.resolve();
      });
      await settle(client);

      expect(
        fakeClerk.calls.filter(
          ({ method }) => method === "createExternalAccount"
        )
      ).toHaveLength(1);
      expect(mockOpenedSessions).toHaveLength(1);

      await act(async () => {
        finish({ type: "cancel" });
        await Promise.resolve();
      });
      await settle(client);
    });

    it("says so when Clerk fails, and opens no browser", async () => {
      fakeClerk.failNext("createExternalAccount", {
        code: "internal_clerk_error",
        status: 500,
      });
      await mount();

      await connectGoogle();

      expect(mockOpenedSessions).toEqual([]);
      expect(Alert.alert).toHaveBeenCalledWith(copy.connectFailed);
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.notConnected,
      });
      expect(
        screen.getByLabelText(copy.connectGoogle).props.accessibilityState
      ).toMatchObject({ busy: false, disabled: false });
    });

    it("opens no browser when the User signs out before Clerk answers", async () => {
      const release = fakeClerk.holdNext("createExternalAccount");
      await mount();

      await connectGoogle();
      await act(async () => {
        signInAs(null);
        release();
        await Promise.resolve();
      });
      await settle(client);

      expect(mockOpenedSessions).toEqual([]);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("says nothing when Clerk fails after the User has signed out", async () => {
      const release = fakeClerk.holdNext("createExternalAccount");
      fakeClerk.failNext("createExternalAccount", {
        code: "internal_clerk_error",
        status: 500,
      });
      await mount();

      await connectGoogle();
      await act(async () => {
        signInAs(null);
        release();
        await Promise.resolve();
      });
      await settle(client);

      expect(mockOpenedSessions).toEqual([]);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("says the Google account is linked elsewhere when the provider refuses it", async () => {
      mockAuthSession = () => {
        fakeClerk.refuseExternalAccount("google", "external_account_exists");

        return Promise.resolve({ type: "success", url: REDIRECT_URL });
      };

      await mount();

      await connectGoogle();

      expect(Alert.alert).toHaveBeenCalledWith(copy.alreadyLinked);
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.notConnected,
      });
    });

    it("says Apple isn't available yet when Clerk can't start Apple's sign-in", async () => {
      fakeClerk.failNext("createExternalAccount", {
        code: "oauth_config_missing",
        status: 422,
      });
      await mount();

      await fireEvent.press(screen.getByLabelText(copy.connectApple));
      await settle(client);

      expect(mockOpenedSessions).toEqual([]);
      expect(Alert.alert).toHaveBeenCalledWith(copy.appleUnavailable);
      expect(screen.queryByText(copy.connecting)).toBeNull();
      expect(
        screen.getByLabelText(copy.apple).props.accessibilityValue
      ).toEqual({ text: copy.notConnected });
    });

    it("says Connect failed, not Apple's setup, when Clerk itself fails on Apple", async () => {
      fakeClerk.failNext("createExternalAccount", {
        code: "internal_clerk_error",
        status: 500,
      });
      await mount();

      await fireEvent.press(screen.getByLabelText(copy.connectApple));
      await settle(client);

      expect(Alert.alert).toHaveBeenCalledWith(
        copy.connectFailed.replace("Google", "Apple")
      );
    });

    it("says Apple isn't available yet when Apple's sign-in comes back unlinked", async () => {
      mockAuthSession = () => {
        fakeClerk.refuseExternalAccount("apple", "oauth_access_denied");

        return Promise.resolve({ type: "success", url: REDIRECT_URL });
      };

      await mount();

      await fireEvent.press(screen.getByLabelText(copy.connectApple));
      await settle(client);

      expect(Alert.alert).toHaveBeenCalledWith(copy.appleUnavailable);
      expect(screen.queryByText(copy.connecting)).toBeNull();
    });

    it("runs nothing when the User cancels Confirm it's you", async () => {
      fakeClerk.requireReverification();
      await mount();

      await connectGoogle();

      expect(mockRouter.push).toHaveBeenCalledWith("/confirm-identity");
      expect(screen.getByText(copy.connecting)).toBeTruthy();

      await act(async () => {
        fakeClerk.cancelReverification();
        await Promise.resolve();
      });
      await settle(client);

      expect(fakeClerk.calls).toEqual([]);
      expect(mockOpenedSessions).toEqual([]);
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(screen.queryByText(copy.connecting)).toBeNull();
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.notConnected,
      });
    });

    it("connects once the User has confirmed it's them", async () => {
      fakeClerk.requireReverification();
      mockAuthSession = () => {
        fakeClerk.completeExternalAccount("google");

        return Promise.resolve({ type: "success", url: REDIRECT_URL });
      };

      await mount();

      await connectGoogle();
      await act(async () => {
        fakeClerk.completeReverification();
        await Promise.resolve();
      });
      await settle(client);

      expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
        "createExternalAccount",
        "reload",
      ]);
      expect(googleRow().props.accessibilityValue).toEqual({
        text: copy.connectedAs.replace(
          "kirill@gmail.com",
          "tony@google.example"
        ),
      });
    });
  });
});
