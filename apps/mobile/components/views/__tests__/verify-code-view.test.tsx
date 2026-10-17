import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import VerifyCodeView from "../verify-code-view";

const EMAILED_CODE = "424242";

/** A Clerk API error as the sign-up resource reports it. */
const clerkError = (longMessage: string) => ({
  errors: [{ longMessage, message: longMessage }],
  isClerkApiError: true,
});

/**
 * Stand-in for Clerk's sign-up resource after `signUp.password()`: waiting
 * for the emailed code, which only `EMAILED_CODE` satisfies.
 */
const mockSignUp = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  status: "missing_requirements",
  verifications: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    verifyEmailCode: jest.fn(({ code }: { code: string }) => {
      if (code !== EMAILED_CODE) {
        return Promise.resolve({ error: clerkError("Incorrect code") });
      }
      mockSignUp.status = "complete";
      return Promise.resolve({ error: null });
    }),
  },
};

/**
 * Stand-in for Clerk's sign-in resource after a reset code was requested:
 * `EMAILED_CODE` moves it on to asking for a new password.
 */
const mockSignIn = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  mfa: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: null })),
    verifyEmailCode: jest.fn(({ code }: { code: string }) => {
      if (code !== EMAILED_CODE) {
        return Promise.resolve({ error: clerkError("Incorrect code") });
      }
      mockSignIn.status = "complete";
      return Promise.resolve({ error: null });
    }),
  },
  resetPasswordEmailCode: {
    sendCode: jest.fn(() => Promise.resolve({ error: null })),
    verifyCode: jest.fn(({ code }: { code: string }) => {
      if (code !== EMAILED_CODE) {
        return Promise.resolve({ error: clerkError("Incorrect code") });
      }
      mockSignIn.status = "needs_new_password";
      return Promise.resolve({ error: null });
    }),
  },
  status: "needs_first_factor",
};

/**
 * Clerk's hooks run React hooks of their own (`useClerkSignal` opens with
 * `useContext`), so the stand-ins do too: a View that skips them on a
 * re-render breaks the hook order, as on a device.
 */
jest.mock("@clerk/expo", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
      error.isClerkApiError === true,
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
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const enterCode = async (code: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText("Code"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.status = "missing_requirements";
  mockSignIn.status = "needs_first_factor";
});

describe("VerifyCodeView for sign-up", () => {
  it("activates the account and signs the User in with the emailed code", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);

    await enterCode(EMAILED_CODE);

    expect(mockSignUp.finalize).toHaveBeenCalledTimes(1);
  });

  it("shows Clerk's error for a wrong code and accepts the right one after", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);

    await enterCode("000000");

    expect(screen.getByText("Incorrect code")).toBeTruthy();
    expect(mockSignUp.finalize).not.toHaveBeenCalled();

    await enterCode(EMAILED_CODE);

    expect(screen.queryByText("Incorrect code")).toBeNull();
    expect(mockSignUp.finalize).toHaveBeenCalledTimes(1);
  });

  it("emails a new code on request", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Send a new code" })
    );

    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText("We sent you a new code.")).toBeTruthy();
  });
});

describe("VerifyCodeView for a password reset", () => {
  it("asks for a new password once the emailed code checks out", async () => {
    await render(<VerifyCodeView purpose="reset-password" />);

    await enterCode(EMAILED_CODE);

    expect(router.replace).toHaveBeenCalledWith("/auth/reset-password");
  });

  it("shows Clerk's error for a wrong code and accepts the right one after", async () => {
    await render(<VerifyCodeView purpose="reset-password" />);

    await enterCode("000000");

    expect(screen.getByText("Incorrect code")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();

    await enterCode(EMAILED_CODE);

    expect(screen.queryByText("Incorrect code")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/auth/reset-password");
  });

  it("emails a new reset code on request", async () => {
    await render(<VerifyCodeView purpose="reset-password" />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Send a new code" })
    );

    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText("We sent you a new code.")).toBeTruthy();
  });
});

describe("VerifyCodeView for a sign-in from a new device", () => {
  it("signs the User in with the emailed code", async () => {
    mockSignIn.status = "needs_client_trust";
    await render(<VerifyCodeView purpose="sign-in" />);

    await enterCode(EMAILED_CODE);

    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
  });

  it("emails a new code on request", async () => {
    await render(<VerifyCodeView purpose="sign-in" />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Send a new code" })
    );

    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
  });
});
