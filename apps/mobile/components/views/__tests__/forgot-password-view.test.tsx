import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import ForgotPasswordView from "../forgot-password-view";

const KNOWN_EMAIL = "known@example.com";

/** A Clerk API error as the sign-in resource reports it. */
const clerkError = (longMessage: string) => ({
  errors: [{ longMessage, message: longMessage }],
  isClerkApiError: true,
});

/** Stand-in for Clerk's sign-in resource; only `KNOWN_EMAIL` has an account. */
const mockSignIn = {
  create: jest.fn(({ identifier }: { identifier: string }) =>
    Promise.resolve({
      error:
        identifier === KNOWN_EMAIL
          ? null
          : clerkError("Couldn't find your account."),
    })
  ),
  resetPasswordEmailCode: {
    sendCode: jest.fn(() => Promise.resolve({ error: null })),
  },
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
    error.isClerkApiError === true,
  useSignIn: () => ({ fetchStatus: "idle", signIn: mockSignIn }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  router: { push: jest.fn() },
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const requestReset = async (email: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
  await fireEvent.press(screen.getByRole("button", { name: "Send Code" }));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ForgotPasswordView", () => {
  it("emails a reset code and opens the code screen", async () => {
    await render(<ForgotPasswordView />);

    await requestReset(KNOWN_EMAIL);

    expect(mockSignIn.create).toHaveBeenCalledWith({
      identifier: KNOWN_EMAIL,
    });
    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "reset-password" },
      pathname: "/auth/verify-code",
    });
  });

  it("shows Clerk's error for an unknown email and sends nothing", async () => {
    await render(<ForgotPasswordView />);

    await requestReset("stranger@example.com");

    expect(screen.getByText("Couldn't find your account.")).toBeTruthy();
    expect(mockSignIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
