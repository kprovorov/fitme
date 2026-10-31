import "~/test-utils/auth-ui";
/**
 * The emailed-code screen (every purpose) and the forgot and reset password
 * screens on a Ukrainian device: every string the app writes is Ukrainian.
 * Clerk's own error text stays as Clerk sends it. Each render goes through
 * the root layout's language sync, so the App language follows the device.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import ForgotPasswordView from "~/components/views/forgot-password-view";
import ResetPasswordView from "~/components/views/reset-password-view";
import VerifyCodeView from "~/components/views/verify-code-view";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";

/** Clerk's resources, each answering just enough for the screens' copy. */
const mockSignUp = {
  emailAddress: "tony@example.com",
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  id: "sua_uk",
  reset: jest.fn(() => Promise.resolve({ error: null })),
  status: "missing_requirements",
  unverifiedFields: ["email_address"],
  verifications: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    // Clerk accepts the code, but the sign-up still misses a requirement.
    verifyEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
};

const mockSignIn = {
  create: jest.fn(
    (): Promise<{ error: unknown }> => Promise.resolve({ error: null })
  ),
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  id: "sia_uk",
  identifier: "tony@example.com",
  mfa: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    verifyEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
  reset: jest.fn(() => Promise.resolve({ error: null })),
  resetPasswordEmailCode: {
    sendCode: jest.fn(() => Promise.resolve({ error: null })),
    submitPassword: jest.fn(() => Promise.resolve({ error: null })),
    verifyCode: jest.fn(() => Promise.resolve({ error: null })),
  },
  status: "needs_first_factor",
  supportedFirstFactors: [{ strategy: "reset_password_email_code" }],
  supportedSecondFactors: [] as { strategy: string }[],
};

jest.mock("@clerk/expo", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    isClerkAPIResponseError: () => false,
    useAuth: () => ({ isSignedIn: false }),
    useSignIn: () => {
      const [fetchStatus] = useState("idle");
      return { fetchStatus, signIn: mockSignIn };
    },
    useSignUp: () => {
      const [fetchStatus] = useState("idle");
      return { fetchStatus, signUp: mockSignUp };
    },
  };
});
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const renderInUkrainian = async (view: ReactNode) => {
  setDeviceLanguages(["uk-UA"]);
  await render(<InAppLanguage>{view}</InAppLanguage>);
};

const enterCode = async (code: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText("Код"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Підтвердити" }));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSignUp.status = "missing_requirements";
  mockSignIn.status = "needs_first_factor";
  mockSignIn.supportedSecondFactors = [];
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the emailed-code screen in Ukrainian", () => {
  it("asks for the sign-up code and says when it can't finish the account", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="sign-up" />);

    expect(screen.getByText("Перевірте пошту")).toBeTruthy();
    expect(
      screen.getByText(
        "Введи 6-значний код, який ми надіслали на tony@example.com"
      )
    ).toBeTruthy();

    await enterCode("424242");

    expect(
      screen.getByText(
        "Не вдалося завершити створення акаунта. Спробуйте ще раз."
      )
    ).toBeTruthy();
  });

  it("asks for the reset code and says when it can't verify it", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="reset-password" />);

    expect(
      screen.getByText(
        "Введи 6-значний код, який ми надіслали на tony@example.com"
      )
    ).toBeTruthy();

    await enterCode("424242");

    expect(
      screen.getByText("Не вдалося перевірити код. Спробуйте ще раз.")
    ).toBeTruthy();
  });

  it("asks for the new-device code and says when it can't sign in", async () => {
    mockSignIn.status = "needs_client_trust";
    mockSignIn.supportedSecondFactors = [{ strategy: "email_code" }];
    await renderInUkrainian(<VerifyCodeView purpose="sign-in" />);

    expect(
      screen.getByText(
        "Введи 6-значний код, який ми надіслали на tony@example.com"
      )
    ).toBeTruthy();

    await enterCode("424242");

    expect(
      screen.getByText("Не вдалося увійти. Спробуйте ще раз.")
    ).toBeTruthy();
  });

  it("sends a new code and says so", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="sign-up" />);

    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Надіслати код ще раз" })
    );

    expect(screen.getByText("Ми надіслали вам новий код.")).toBeTruthy();
  });
});

describe("the forgot password screen in Ukrainian", () => {
  it("explains itself and rejects an invalid email", async () => {
    await renderInUkrainian(<ForgotPasswordView />);

    expect(screen.getByText("Забув пароль?")).toBeTruthy();
    expect(
      screen.getByText(
        "Введи ел. пошту, з якою зареєструвався. Ми надішлемо 6-значний код."
      )
    ).toBeTruthy();
    expect(screen.getByText("Згадав пароль?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Увійдіть тут" })).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText("Електронна пошта"),
      "not-an-email"
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Надіслати код" })
    );

    expect(screen.getByText("Некоректна електронна пошта")).toBeTruthy();
    expect(mockSignIn.create).not.toHaveBeenCalled();
  });

  it("says something went wrong when the request fails outside Clerk", async () => {
    mockSignIn.create.mockImplementationOnce(() =>
      Promise.resolve({ error: new TypeError("Network request failed") })
    );
    await renderInUkrainian(<ForgotPasswordView />);

    await fireEvent.changeText(
      screen.getByPlaceholderText("Електронна пошта"),
      "known@example.com"
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Надіслати код" })
    );

    expect(
      screen.getByText("Перевір з’єднання та спробуй ще раз.")
    ).toBeTruthy();
  });
});

describe("the reset password screen in Ukrainian", () => {
  beforeEach(() => {
    mockSignIn.status = "needs_new_password";
  });
  const submitPasswords = async (password: string, confirmation: string) => {
    await fireEvent.changeText(
      screen.getByPlaceholderText("Новий пароль"),
      password
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Підтвердьте пароль"),
      confirmation
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Оновити пароль" })
    );
  };

  it("rejects a short password with Ukrainian plural wording", async () => {
    await renderInUkrainian(<ResetPasswordView />);

    expect(screen.getByText("Встановіть новий пароль")).toBeTruthy();

    await submitPasswords("seven77", "seven77");

    expect(
      screen.getByText("Пароль має містити щонайменше 8 символів.")
    ).toBeTruthy();
    expect(
      mockSignIn.resetPasswordEmailCode.submitPassword
    ).not.toHaveBeenCalled();
  });

  it("rejects passwords that don't match", async () => {
    await renderInUkrainian(<ResetPasswordView />);

    await submitPasswords("a-long-new-password", "another-long-password");

    expect(screen.getByText("Паролі не збігаються.")).toBeTruthy();
  });

  it("asks to log in again when Clerk can't finish the sign-in", async () => {
    mockSignIn.resetPasswordEmailCode.submitPassword.mockImplementationOnce(
      () => {
        mockSignIn.status = "needs_second_factor";
        return Promise.resolve({ error: null });
      }
    );
    await renderInUkrainian(<ResetPasswordView />);

    await submitPasswords("eight888", "eight888");

    expect(
      screen.getByText("Пароль змінено. Увійдіть з новим паролем.")
    ).toBeTruthy();
  });
});
