import "~/test-utils/auth-ui";
/**
 * The sign-in and register screens in the App language: the real screens,
 * under the root layout's language sync, with Clerk's sign-in and sign-up
 * resources stubbed. The device language comes from the mocked
 * `expo-localization` (`test-utils/device-locales.ts`).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ComponentType } from "react";
import LoginScreen from "~/app/auth/login";
import RegisterScreen from "~/app/auth/register";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";

/** Stand-in for Clerk's sign-in resource; each test sets what it answers. */
const mockSignIn = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  mfa: { sendEmailCode: jest.fn(() => Promise.resolve({ error: null })) },
  password: jest.fn(() => Promise.resolve<{ error: unknown }>({ error: null })),
  status: "needs_identifier",
  supportedSecondFactors: [] as { strategy: string }[],
};

const mockSignUp = {
  password: jest.fn(() => Promise.resolve({ error: null })),
  verifications: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
    error.isClerkApiError === true,
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useSignIn: () => ({ fetchStatus: "idle", signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Link: ({ children }: { children: string }) => <Text>{children}</Text>,
    router: { push: jest.fn(), replace: jest.fn() },
    // The screen's header title, shown as text.
    Stack: {
      Screen: ({ options }: { options: { title: string } }) => (
        <Text testID="screen-title">{options.title}</Text>
      ),
    },
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

/** A screen under the root layout's language sync. */
const renderInApp = async (Screen: ComponentType) => {
  await render(
    <InAppLanguage>
      <Screen />
    </InAppLanguage>
  );
};

const fillIn = async (fields: Record<string, string>) => {
  for (const [placeholder, value] of Object.entries(fields)) {
    // biome-ignore lint/performance/noAwaitInLoops: a User types one field after another
    await fireEvent.changeText(screen.getByPlaceholderText(placeholder), value);
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = "needs_identifier";
  mockSignIn.supportedSecondFactors = [];
  mockSignIn.password.mockImplementation(() =>
    Promise.resolve({ error: null })
  );
});

describe("login screen in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows its titles, fields and links in Ukrainian", async () => {
    await renderInApp(LoginScreen);

    expect(screen.getByTestId("screen-title")).toHaveTextContent("Вхід");
    expect(screen.getByText("З поверненням")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ел. пошта")).toBeTruthy();
    expect(screen.getByPlaceholderText("Пароль")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Увійти" })).toBeTruthy();
    expect(screen.getByText("Забули пароль?")).toBeTruthy();
    expect(screen.getByText("Створити акаунт")).toBeTruthy();
    expect(screen.queryByText("Welcome to Fitme!")).toBeNull();
  });

  it("shows the form's validation messages in Ukrainian", async () => {
    await renderInApp(LoginScreen);

    await fillIn({ "Ел. пошта": "not-an-email" });
    await fireEvent.press(screen.getByRole("button", { name: "Увійти" }));

    expect(
      await screen.findByText("Неправильна адреса ел. пошти")
    ).toBeTruthy();
    expect(screen.getByText("Введіть пароль.")).toBeTruthy();
    expect(mockSignIn.password).not.toHaveBeenCalled();
  });

  it("shows the app's own error in Ukrainian when the account can't sign in here", async () => {
    mockSignIn.status = "needs_second_factor";
    await renderInApp(LoginScreen);

    await fillIn({ "Ел. пошта": "tony@example.com", Пароль: "a-password" });
    await fireEvent.press(screen.getByRole("button", { name: "Увійти" }));

    expect(
      await screen.findByText("Цей акаунт поки не може тут увійти.")
    ).toBeTruthy();
  });

  it("shows the generic error in Ukrainian for a failure that isn't Clerk's", async () => {
    mockSignIn.password.mockImplementation(() =>
      Promise.resolve({ error: new Error("offline") })
    );
    await renderInApp(LoginScreen);

    await fillIn({ "Ел. пошта": "tony@example.com", Пароль: "a-password" });
    await fireEvent.press(screen.getByRole("button", { name: "Увійти" }));

    expect(
      await screen.findByText("Щось пішло не так. Спробуйте пізніше.")
    ).toBeTruthy();
  });

  it("asks for the emailed code in Ukrainian on a new device", async () => {
    mockSignIn.status = "needs_client_trust";
    mockSignIn.supportedSecondFactors = [{ strategy: "email_code" }];
    await renderInApp(LoginScreen);

    await fillIn({ "Ел. пошта": "tony@example.com", Пароль: "a-password" });
    await fireEvent.press(screen.getByRole("button", { name: "Увійти" }));

    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "sign-in", source: "login" },
      pathname: "/auth/verify-code",
    });
  });
});

describe("register screen in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
  });

  it("shows its titles, fields and links in Ukrainian", async () => {
    await renderInApp(RegisterScreen);

    expect(screen.getByTestId("screen-title")).toHaveTextContent("Реєстрація");
    expect(screen.getByText("Створи свій акаунт")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ім’я")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ел. пошта")).toBeTruthy();
    expect(screen.getByPlaceholderText("Пароль")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Створити акаунт" })
    ).toBeTruthy();
    expect(screen.getByText("Увійти")).toBeTruthy();
  });

  it("shows the minimum lengths in Ukrainian, with their plural forms", async () => {
    await renderInApp(RegisterScreen);

    await fillIn({
      "Ім’я": "T",
      "Ел. пошта": "tony@example.com",
      Пароль: "seven77",
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Створити акаунт" })
    );

    expect(
      await screen.findByText("Пароль має містити щонайменше 8 символів.")
    ).toBeTruthy();
    expect(
      screen.getByText("Ім’я має містити щонайменше 2 символи.")
    ).toBeTruthy();
    expect(mockSignUp.password).not.toHaveBeenCalled();
  });
});

describe("in English", () => {
  it("shows the login screen in English on an English device", async () => {
    await renderInApp(LoginScreen);

    expect(screen.getByTestId("screen-title")).toHaveTextContent("Log in");
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("Forgot password?")).toBeTruthy();
  });

  it("shows the register screen's validation in English", async () => {
    await renderInApp(RegisterScreen);

    await fillIn({ Email: "tony@example.com", Name: "T", Password: "short" });
    await fireEvent.press(
      screen.getByRole("button", { name: "Create Account" })
    );

    expect(
      await screen.findByText("Password must be at least 8 characters.")
    ).toBeTruthy();
    expect(
      screen.getByText("Name must be at least 2 characters.")
    ).toBeTruthy();
  });
});
