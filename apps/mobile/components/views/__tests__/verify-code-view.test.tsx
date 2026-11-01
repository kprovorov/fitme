import "~/test-utils/auth-ui";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { segmentClient } from "~/lib/segment";
import VerifyCodeView from "../verify-code-view";

const EMAILED_CODE = "424242";
const clerkError = (longMessage: string) => ({
  errors: [{ longMessage, message: longMessage }],
  isClerkApiError: true,
});
let mockResendError: unknown = null;
const mockSignUp = {
  emailAddress: "tony@example.com",
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  id: "sua_test" as string | null,
  reset: jest.fn(() => Promise.resolve({ error: null })),
  status: "missing_requirements",
  unverifiedFields: ["email_address"],
  verifications: {
    sendEmailCode: jest.fn(() => Promise.resolve({ error: mockResendError })),
    verifyEmailCode: jest.fn(({ code }: { code: string }) => {
      if (code !== EMAILED_CODE) {
        return Promise.resolve({ error: clerkError("Incorrect code") });
      }
      mockSignUp.status = "complete";
      return Promise.resolve({ error: null });
    }),
  },
};
const mockSignIn = {
  finalize: jest.fn(() => Promise.resolve({ error: null })),
  id: "sia_test" as string | null,
  identifier: "tony@example.com",
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
  reset: jest.fn(() => Promise.resolve({ error: null })),
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
  supportedFirstFactors: [{ strategy: "reset_password_email_code" }],
  supportedSecondFactors: [{ strategy: "email_code" }],
};
jest.mock("@clerk/expo", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    isClerkAPIResponseError: (error: { isClerkApiError?: boolean }) =>
      error.isClerkApiError === true,
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
  await fireEvent.changeText(screen.getByLabelText("Code"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
};
const allowResend = () =>
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSignUp.id = "sua_test";
  mockSignIn.id = "sia_test";
  mockSignUp.status = "missing_requirements";
  mockSignIn.status = "needs_first_factor";
  mockResendError = null;
});
afterEach(() => {
  jest.useRealTimers();
});

describe("email verification", () => {
  it("names the destination and activates the User after an explicit six-digit verification", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);
    expect(
      screen.getByText("Enter the 6-digit code we sent to tony@example.com")
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Code"), "42424");
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    await enterCode(EMAILED_CODE);
    expect(mockSignUp.finalize).toHaveBeenCalledTimes(1);
  });
  it("shows a wrong-code error and clears it on edit before a successful retry", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);
    await enterCode("000000");
    expect(screen.getByText("Incorrect code")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Code"), EMAILED_CODE);
    expect(screen.queryByText("Incorrect code")).toBeNull();
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    expect(mockSignUp.finalize).toHaveBeenCalledTimes(1);
  });
  it("sanitizes a pasted code and never auto-submits it", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);
    await fireEvent.changeText(screen.getByLabelText("Code"), "42 42 42extra");
    expect(screen.getByLabelText("Code")).toHaveProp("value", EMAILED_CODE);
    expect(mockSignUp.verifications.verifyEmailCode).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    expect(mockSignUp.verifications.verifyEmailCode).toHaveBeenCalledWith({
      code: EMAILED_CODE,
    });
  });
  it("waits before resend, then clears digits and starts a new cooldown", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);
    expect(screen.getByTestId("verify-code-resend-button")).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
    await allowResend();
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Code")).toHaveProp("value", "");
    expect(screen.getByText("We sent you a new code.")).toBeTruthy();
    expect(screen.getByTestId("verify-code-resend-button")).toBeDisabled();
  });
  it("leaves a failed resend retryable", async () => {
    mockResendError = clerkError("Too many requests. Try again.");
    await render(<VerifyCodeView purpose="sign-up" />);
    await allowResend();
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(screen.getByText("Too many requests. Try again.")).toBeTruthy();
    expect(screen.getByTestId("verify-code-resend-button")).toBeEnabled();
    mockResendError = null;
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(screen.getByText("We sent you a new code.")).toBeTruthy();
  });
  it("offers restart on a cold verification link without calling verification", async () => {
    mockSignUp.id = null;
    await render(<VerifyCodeView purpose="sign-up" />);
    expect(screen.queryByLabelText("Code")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Start again" }));
    expect(mockSignUp.reset).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/auth/register");
    expect(mockSignUp.verifications.verifyEmailCode).not.toHaveBeenCalled();
  });
  it("resets the attempt when the User chooses to change email", async () => {
    await render(<VerifyCodeView purpose="sign-up" />);
    await fireEvent.press(screen.getByRole("link", { name: "Change it" }));
    expect(mockSignUp.reset).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/auth/register");
  });
});

describe("password recovery verification", () => {
  it("asks for a new password once the reset code checks out", async () => {
    await render(<VerifyCodeView purpose="reset-password" />);
    await enterCode(EMAILED_CODE);
    expect(router.replace).toHaveBeenCalledWith("/auth/reset-password");
  });
  it("resends a reset code using the recovery strategy", async () => {
    await render(<VerifyCodeView purpose="reset-password" />);
    await allowResend();
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
  });
});

describe("Device Trust verification", () => {
  it.each(["login", "reset-password", "social"] as const)(
    "finishes %s and preserves its analytics",
    async (source) => {
      mockSignIn.status = "needs_client_trust";
      await render(<VerifyCodeView purpose="sign-in" source={source} />);
      await enterCode(EMAILED_CODE);
      expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
      if (source === "reset-password") {
        expect(segmentClient.track).not.toHaveBeenCalled();
      } else {
        expect(segmentClient.track).toHaveBeenCalledWith("User Logged In");
      }
    }
  );
  it("resends a Device Trust code", async () => {
    mockSignIn.status = "needs_client_trust";
    await render(<VerifyCodeView purpose="sign-in" />);
    await allowResend();
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
  });
});
