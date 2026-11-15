/**
 * The Account & Security screen, opened from the redesigned Profile's Account
 * list: the real screen over the fake Clerk User, on iOS and Android, in
 * English and Ukrainian. Its actions (change email and password, connect,
 * disconnect, delete) come with their own tickets.
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
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Platform } from "react-native";

import AccountSecurityScreen from "~/app/account-security";
import ProfileScreen from "~/app/profile";
import { setProfileRedesignEnabled } from "~/lib/feature-flags";
import type { GoogleClientIds } from "~/lib/google-client-ids";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

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

const mount = async (screenElement: ReactNode = <AccountSecurityScreen />) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>{screenElement}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

const COPY = {
  en: {
    apple: "Apple",
    connectedAs: "Connected as kirill@gmail.com",
    deleteAccount: "Delete Account",
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
    apple: "Apple",
    connectedAs: "Під’єднано як kirill@gmail.com",
    deleteAccount: "Видалити акаунт",
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

afterEach(() => {
  Platform.OS = platform;
  jest.restoreAllMocks();
});

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("Account & Security in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockReturnValue(undefined);
    mockGoogleClientIds = GOOGLE_IDS;
    Platform.OS = "ios";
    setProfileRedesignEnabled(true);
    setDeviceLanguages([...deviceLanguages]);
  });

  it("opens from the redesigned Profile's Account & Security row", async () => {
    fakeClerk.setUser({ emailAddresses: ["kirill@example.com"] });
    await mount(<ProfileScreen />);

    await fireEvent.press(screen.getByLabelText(copy.profileRow));

    expect(router.push).toHaveBeenCalledWith("/account-security");
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
});
