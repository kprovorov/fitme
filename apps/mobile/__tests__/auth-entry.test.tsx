import "~/test-utils/auth-ui";

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import AuthWelcomeView from "~/components/views/auth-welcome-view";
import { configuredSocialProviders } from "~/hooks/native-social-auth";
import { segmentClient } from "~/lib/segment";
import { setAuthProviderConfig } from "~/test-utils/auth-ui";

interface NativeResult {
  createdSessionId: string | null;
  setActive?: (params: { session: string }) => Promise<void>;
  signIn?: {
    firstFactorVerification: { status: string };
    prepareSecondFactor: (params: {
      strategy: string;
      emailAddressId: string;
    }) => Promise<unknown>;
    id: string;
    status: string;
    supportedSecondFactors?: { strategy: string; emailAddressId?: string }[];
  };
  signUp?: {
    prepareEmailAddressVerification: (params: {
      strategy: string;
    }) => Promise<unknown>;
    verifications: { externalAccount: { status: string } };
    id: string;
    status: string;
    emailAddress?: string;
    missingFields: string[];
    unverifiedFields: string[];
    createdSessionId?: string;
  };
}
const mockSetActive = jest.fn<NonNullable<NativeResult["setActive"]>>(() =>
  Promise.resolve()
);
let mockResult: NativeResult = { createdSessionId: null };
const mockApple = jest.fn<() => Promise<NativeResult>>(() =>
  Promise.resolve(mockResult)
);
const mockGoogle = jest.fn<() => Promise<NativeResult>>(() =>
  Promise.resolve(mockResult)
);
const mockPrepareEmail = jest.fn(() => Promise.resolve({}));
const mockPrepareSecond = jest.fn(() => Promise.resolve({}));
const mockSignIn = {
  firstFactorVerification: { status: "unverified" },
  id: "sia_previous",
  prepareSecondFactor: mockPrepareSecond,
  status: "needs_identifier",
};
const mockSignUp = {
  emailAddress: "tony@example.com",
  id: "sua_previous",
  missingFields: [],
  prepareEmailAddressVerification: mockPrepareEmail,
  status: "missing_requirements",
  unverifiedFields: ["email_address"],
  verifications: { externalAccount: { status: "unverified" } },
};
const makeSignIn = (
  overrides: Partial<NonNullable<NativeResult["signIn"]>>
) => ({ ...mockSignIn, ...overrides });
const makeSignUp = (
  overrides: Partial<NonNullable<NativeResult["signUp"]>>
) => ({ ...mockSignUp, ...overrides });
jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: () => false,
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
}));
jest.mock("@clerk/expo/legacy", () => ({
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
}));
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockApple }),
}));
jest.mock("@clerk/expo/google", () => ({
  useSignInWithGoogle: () => ({ startGoogleAuthenticationFlow: mockGoogle }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
const config = {
  appleEnabled: true,
  googleEnabled: true,
  googleIosClientId: "123-ios.apps.googleusercontent.com",
  googleIosUrlScheme: "com.googleusercontent.apps.123-ios",
  googleWebClientId: "123-web.apps.googleusercontent.com",
};
beforeEach(() => {
  jest.clearAllMocks();
  setAuthProviderConfig(config);
  mockResult = { createdSessionId: null };
  mockApple.mockImplementation(() => Promise.resolve(mockResult));
  mockGoogle.mockImplementation(() => Promise.resolve(mockResult));
});
const show = async () => {
  await render(<AuthWelcomeView />);
  await screen.findByRole("button", { name: "Continue with Apple" });
};

describe("signed-out Welcome", () => {
  it("offers email registration and existing-user login", async () => {
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Email" })
    );
    expect(router.push).toHaveBeenCalledWith("/auth/register");
    await fireEvent.press(screen.getByRole("link", { name: "Log in" }));
    expect(router.push).toHaveBeenCalledWith("/auth/login");
  });
  it("uses the email-only fallback when providers are not enabled", async () => {
    setAuthProviderConfig({
      ...config,
      appleEnabled: false,
      googleEnabled: false,
    });
    await render(<AuthWelcomeView />);
    expect(
      screen.getByRole("button", { name: "Continue with Email" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Continue with Apple" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" })
    ).toBeNull();
  });
  it("does not offer Google when its native callback scheme is missing", () => {
    setAuthProviderConfig({ ...config, googleIosUrlScheme: "" });
    expect(configuredSocialProviders()).toEqual(["apple"]);
  });
});

describe("native social results", () => {
  it.each(["Apple", "Google"])(
    "activates a completed %s session",
    async (provider) => {
      mockResult = {
        createdSessionId: "sess_social",
        setActive: mockSetActive,
      };
      await show();
      await fireEvent.press(
        screen.getByRole("button", { name: `Continue with ${provider}` })
      );
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_social" });
      expect(router.replace).toHaveBeenCalledWith("/");
      expect(segmentClient.track).toHaveBeenCalledWith("User Logged In");
    }
  );
  it("enters with a new social User without asking for a name", async () => {
    mockResult = {
      createdSessionId: "sess_new",
      setActive: mockSetActive,
      signUp: makeSignUp({
        createdSessionId: "sess_new",
        id: "sua_new",
        missingFields: [],
        status: "complete",
        unverifiedFields: [],
      }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(segmentClient.track).toHaveBeenCalledWith("User Registered");
  });
  it("returns quietly to Welcome when the User cancels", async () => {
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" })
    ).toBeEnabled();
  });
  it("shows a provider failure and permits another attempt", async () => {
    mockApple.mockRejectedValueOnce(new Error("Offline"));
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(
      screen.getByText("Something went wrong. Please try again later.")
    ).toBeTruthy();
    mockResult = { createdSessionId: "sess_retry", setActive: mockSetActive };
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_retry" });
  });
  it("continues a social signup requiring email verification", async () => {
    mockResult = {
      createdSessionId: null,
      signUp: makeSignUp({
        emailAddress: "tony@example.com",
        id: "sua_new",
        missingFields: [],
        status: "missing_requirements",
        unverifiedFields: ["email_address"],
      }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(mockPrepareEmail).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "sign-up" },
      pathname: "/auth/verify-code",
    });
    expect(mockSetActive).not.toHaveBeenCalled();
  });
  it("continues a supported Device Trust challenge", async () => {
    mockResult = {
      createdSessionId: null,
      signIn: makeSignIn({
        id: "sia_new",
        status: "needs_client_trust",
        supportedSecondFactors: [
          { emailAddressId: "idn_email", strategy: "email_code" },
        ],
      }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Google" })
    );
    expect(mockPrepareSecond).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "sign-in", source: "social" },
      pathname: "/auth/verify-code",
    });
  });
  it("explains unsupported requirements without creating a fabricated name", async () => {
    mockResult = {
      createdSessionId: null,
      signUp: makeSignUp({
        id: "sua_new",
        missingFields: ["first_name"],
        status: "missing_requirements",
        unverifiedFields: [],
      }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(
      screen.getByText(
        "We couldn’t finish signing you in. Try again or continue with email."
      )
    ).toBeTruthy();
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
  it("prevents concurrent attempts and ignores a result after leaving the screen", async () => {
    let finish: (value: NativeResult) => void = () => undefined;
    mockApple.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = await render(<AuthWelcomeView />);
    const apple = await screen.findByRole("button", {
      name: "Continue with Apple",
    });
    await fireEvent.press(apple);
    await fireEvent.press(apple);
    expect(mockApple).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Continue with Email" })
    ).toBeDisabled();
    await view.unmount();
    await act(() => {
      finish({ createdSessionId: "sess_abandoned", setActive: mockSetActive });
    });
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("native legacy resource boundary", () => {
  it("does not mistake an old incomplete Apple attempt returned on cancellation for a new signup", async () => {
    mockResult = { createdSessionId: null, signUp: mockSignUp };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(mockPrepareEmail).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("sends verification on the new resource returned by the native Google hook", async () => {
    const newPrepare = jest.fn<
      (params: { strategy: string }) => Promise<unknown>
    >(() => Promise.resolve({}));
    mockResult = {
      createdSessionId: null,
      signUp: makeSignUp({
        id: "sua_replacement",
        prepareEmailAddressVerification: newPrepare,
      }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Google" })
    );
    expect(newPrepare).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(mockPrepareEmail).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      params: { purpose: "sign-up" },
      pathname: "/auth/verify-code",
    });
  });
  it("uses the activated session id to classify analytics despite an old signup session", async () => {
    mockResult = {
      createdSessionId: "sess_current",
      setActive: mockSetActive,
      signUp: makeSignUp({ createdSessionId: "sess_old" }),
    };
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(segmentClient.track).toHaveBeenCalledWith("User Logged In");
    expect(segmentClient.track).not.toHaveBeenCalledWith("User Registered");
  });
  it("treats a native cancellation error as cancellation", async () => {
    mockApple.mockRejectedValueOnce(
      Object.assign(new Error("Cancelled"), { code: "ERR_REQUEST_CANCELED" })
    );
    await show();
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue with Apple" })
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
