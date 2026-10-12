import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import ResetPasswordView from "../reset-password-view";

const NEW_PASSWORD = "a-long-new-password";
const BREACHED_PASSWORD = "password-found-in-a-breach";

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
  resetPasswordEmailCode: {
    submitPassword: jest.fn(({ password }: { password: string }) => {
      if (password === BREACHED_PASSWORD) {
        return Promise.resolve({
          error: clerkError(
            "Password has been found in an online data breach."
          ),
        });
      }
      mockSignIn.status = "complete";
      return Promise.resolve({ error: null });
    }),
  },
  status: "needs_new_password",
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
    error.isClerkApiError === true,
  useAuth: () => ({ isSignedIn: false }),
  useSignIn: () => ({ fetchStatus: "idle", signIn: mockSignIn }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
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
