/**
 * The emailed-code screen (every purpose) and the forgot and reset password
 * screens on a Ukrainian device: every string the app writes is Ukrainian.
 * Clerk's own error text stays as Clerk sends it. Each render goes through
 * the root layout's language sync, so the App language follows the device.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import ForgotPasswordView from "~/components/views/forgot-password-view";
import ResetPasswordView from "~/components/views/reset-password-view";
import VerifyCodeView from "~/components/views/verify-code-view";
import { useAppLanguageSync } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";

/** Clerk's resources, each answering just enough for the screens' copy. */
const mockSignUp = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  status: "missing_requirements",
  verifications: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    // Clerk accepts the code, but the sign-up still misses a requirement.
    verifyEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
};

const mockSignIn = {
  create: jest.fn(() => Promise.resolve({ error: null })),
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  mfa: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    verifyEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
  resetPasswordEmailCode: {
    sendCode: jest.fn(() => Promise.resolve({ error: null })),
    submitPassword: jest.fn(() => Promise.resolve({ error: null })),
    verifyCode: jest.fn(() => Promise.resolve({ error: null })),
  },
  status: "needs_first_factor",
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

function InAppLanguage({ children }: { children: ReactNode }) {
  useAppLanguageSync();
  return children;
}

const renderInUkrainian = async (view: ReactNode) => {
  setDeviceLanguages(["uk-UA"]);
  await render(<InAppLanguage>{view}</InAppLanguage>);
};

const enterCode = async (code: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText("Код"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Підтвердити" }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.status = "missing_requirements";
  mockSignIn.status = "needs_first_factor";
  mockSignIn.supportedSecondFactors = [];
});

describe("the emailed-code screen in Ukrainian", () => {
  it("asks for the sign-up code and says when it can't finish the account", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="sign-up" />);

    expect(screen.getByText("Перевірте пошту")).toBeTruthy();
    expect(
      screen.getByText(
        "Введіть код, який ми надіслали на вашу пошту, щоб активувати акаунт"
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
        "Введіть код, який ми надіслали на вашу пошту, щоб скинути пароль"
      )
    ).toBeTruthy();

    await enterCode("424242");

    expect(
      screen.getByText("Не вдалося перевірити код. Спробуйте ще раз.")
    ).toBeTruthy();
  });

  it("asks for the new-device code and says when it can't sign in", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="sign-in" />);

    expect(
      screen.getByText(
        "Введіть код, який ми вам надіслали, щоб підтвердити, що це ви на цьому пристрої"
      )
    ).toBeTruthy();

    await enterCode("424242");

    expect(
      screen.getByText("Не вдалося увійти. Спробуйте ще раз.")
    ).toBeTruthy();
  });

  it("sends a new code and says so", async () => {
    await renderInUkrainian(<VerifyCodeView purpose="sign-up" />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Надіслати новий код" })
    );

    expect(screen.getByText("Ми надіслали вам новий код.")).toBeTruthy();
  });
});

describe("the forgot password screen in Ukrainian", () => {
  it("explains itself and rejects an invalid email", async () => {
    await renderInUkrainian(<ForgotPasswordView />);

    expect(screen.getByText("Забули пароль?")).toBeTruthy();
    expect(
      screen.getByText(
        "Введіть свою електронну пошту, і ми надішлемо вам код для скидання пароля."
      )
    ).toBeTruthy();
    expect(screen.getByText("Пам’ятаєте пароль? Увійдіть тут")).toBeTruthy();

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
});

describe("the reset password screen in Ukrainian", () => {
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

    await submitPasswords("short", "short");

    expect(
      screen.getByText("Пароль має містити щонайменше 15 символів.")
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
    mockSignIn.resetPasswordEmailCode.submitPassword.mockImplementation(() => {
      mockSignIn.status = "needs_second_factor";
      return Promise.resolve({ error: null });
    });
    await renderInUkrainian(<ResetPasswordView />);

    await submitPasswords("a-long-new-password", "a-long-new-password");

    expect(
      screen.getByText("Пароль змінено. Увійдіть з новим паролем.")
    ).toBeTruthy();
  });
});
