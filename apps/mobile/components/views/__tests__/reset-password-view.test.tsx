import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import ResetPasswordView from "../reset-password-view";

const NEW_PASSWORD = "a-long-new-password";
const BREACHED_PASSWORD = "password-found-in-a-breach";

/** What Clerk wants after the new password; a new device needs a code. */
let mockStatusAfterReset = "complete";

/** A Clerk API error as the sign-in resource reports it. */
const clerkError = (longMessage: string) => ({
  errors: [{ longMessage, message: longMessage }],
  isClerkApiError: true,
});

/**
 * Stand-in for Clerk's sign-in resource after the reset code checked out:
 * any password Clerk accepts completes the sign-in.
 */
const mockSignIn = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  mfa: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
  },
  resetPasswordEmailCode: {
    submitPassword: jest.fn(({ password }: { password: string }) => {
      if (password === BREACHED_PASSWORD) {
        return Promise.resolve({
          error: clerkError(
            "Password has been found in an online data breach."
          ),
        });
      }
      mockSignIn.status = mockStatusAfterReset;
      return Promise.resolve({ error: null });
    }),
  },
  status: "needs_new_password",
  supportedSecondFactors: [{ strategy: "email_code" }],
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
    error.isClerkApiError === true,
  useAuth: () => ({ isSignedIn: false }),
  useSignIn: () => ({ fetchStatus: "idle", signIn: mockSignIn }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const submitNewPassword = async (password: string) => {
  await fireEvent.changeText(
    screen.getByPlaceholderText("New Password"),
    password
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Confirm Password"),
    password
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Update Password" })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = "needs_new_password";
  mockStatusAfterReset = "complete";
});

describe("ResetPasswordView", () => {
  it("sets the new password and signs the User in", async () => {
    await render(<ResetPasswordView />);

    await submitNewPassword(NEW_PASSWORD);

    expect(
      mockSignIn.resetPasswordEmailCode.submitPassword
    ).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
  });

  it("rejects a password shorter than Clerk's minimum before calling Clerk", async () => {
    await render(<ResetPasswordView />);

    await submitNewPassword("short");

    expect(
      screen.getByText("Password must be at least 15 characters.")
    ).toBeTruthy();
    expect(
      mockSignIn.resetPasswordEmailCode.submitPassword
    ).not.toHaveBeenCalled();
  });

  it("shows Clerk's error for a rejected password and accepts another after", async () => {
    await render(<ResetPasswordView />);

    await submitNewPassword(BREACHED_PASSWORD);

    expect(
      screen.getByText("Password has been found in an online data breach.")
    ).toBeTruthy();
    expect(mockSignIn.finalize).not.toHaveBeenCalled();

    await submitNewPassword(NEW_PASSWORD);

    expect(
      screen.queryByText("Password has been found in an online data breach.")
    ).toBeNull();
    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
  });
});

describe("ResetPasswordView on a device Clerk doesn't trust yet", () => {
  it("emails a sign-in code and opens the code screen", async () => {
    mockStatusAfterReset = "needs_client_trust";
    await render(<ResetPasswordView />);

    await submitNewPassword(NEW_PASSWORD);

    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(mockSignIn.finalize).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "sign-in" },
      pathname: "/auth/verify-code",
    });
  });
});
