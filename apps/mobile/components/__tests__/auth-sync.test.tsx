import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import AuthSync from "../auth-sync";

interface FakeUser {
  fullName: string;
  id: string;
  primaryEmailAddress: { emailAddress: string };
}

let mockUser: FakeUser | null = null;

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: mockUser }),
}));
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  setUser: jest.fn(),
}));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    addCustomerInfoUpdateListener: jest.fn(),
    logIn: jest.fn(() => Promise.resolve()),
    logOut: jest.fn(() => Promise.resolve()),
    removeCustomerInfoUpdateListener: jest.fn(),
    setDisplayName: jest.fn(() => Promise.resolve()),
    setEmail: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock("~/lib/segment", () => ({
  segmentClient: { identify: jest.fn(() => Promise.resolve()) },
}));

const CLERK_ID = "user_2abcDEF";

const renderAuthSync = async () => {
  const queryClient = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
    </QueryClientProvider>
  );
  const result = await render(tree());
  return { rerender: () => result.rerender(tree()) };
};

describe("AuthSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      fullName: "Ada Lovelace",
      id: CLERK_ID,
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    };
  });

  it("identifies the signed-in User to Sentry by their Clerk id only", async () => {
    await renderAuthSync();

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: CLERK_ID });
    for (const [user] of jest.mocked(Sentry.setUser).mock.calls) {
      expect(user).not.toHaveProperty("email");
      expect(user).not.toHaveProperty("username");
    }
  });

  it("clears the Sentry user on sign-out", async () => {
    const { rerender } = await renderAuthSync();
    jest.mocked(Sentry.setUser).mockClear();

    mockUser = null;
    await rerender();

    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });
});
