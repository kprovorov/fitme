import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProfileView from "../profile-view";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { useIsProQuery, useCustomerInfoQuery } from "~/hooks/revenueCat";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import { mockUser } from "~/lib/test-fixtures";

jest.mock("~/hooks/queries/auth", () => ({
  useCurrentUserQuery: jest.fn(),
}));

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: jest.fn(),
  useCustomerInfoQuery: jest.fn(),
}));

jest.mock("~/hooks/mutations/auth", () => ({
  useLogoutMutation: jest.fn(),
}));

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  router: { replace: jest.fn() },
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ clear: jest.fn(), invalidateQueries: jest.fn() }),
}));

jest.mock("react-native-purchases-ui", () => ({
  default: { presentPaywall: jest.fn() },
}));

jest.mock("@sentry/react-native", () => ({
  setUser: jest.fn(),
}));

jest.mock("~/lib/icons/Trophy", () => ({ Trophy: () => null }));
jest.mock("~/lib/icons/Volleyball", () => ({ Volleyball: () => null }));
jest.mock("~/lib/icons/Heart", () => ({ Heart: () => null }));

const mockUseCurrentUserQuery = useCurrentUserQuery as jest.MockedFunction<
  typeof useCurrentUserQuery
>;
const mockUseIsProQuery = useIsProQuery as jest.MockedFunction<
  typeof useIsProQuery
>;
const mockUseCustomerInfoQuery = useCustomerInfoQuery as jest.MockedFunction<
  typeof useCustomerInfoQuery
>;
const mockUseLogoutMutation = useLogoutMutation as jest.MockedFunction<
  typeof useLogoutMutation
>;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ProfileView", () => {
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    mockUseCurrentUserQuery.mockReturnValue({ data: mockUser } as any);
    mockUseIsProQuery.mockReturnValue({ data: false } as any);
    mockUseCustomerInfoQuery.mockReturnValue({ data: null } as any);
    mockUseLogoutMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as any);
  });

  it("renders user name", () => {
    const { getByText } = render(<ProfileView />, { wrapper });

    expect(getByText(mockUser.name)).toBeTruthy();
  });

  it("calls logout mutation on logout button press", () => {
    const { getByTestId } = render(<ProfileView />, { wrapper });

    fireEvent.press(getByTestId("logout-button"));

    expect(mockMutateAsync).toHaveBeenCalled();
  });

  it("shows Pro badge for pro users", () => {
    mockUseIsProQuery.mockReturnValue({ data: true } as any);

    const { getByText } = render(<ProfileView />, { wrapper });

    expect(getByText("You're Pro!")).toBeTruthy();
  });

  it("shows upgrade CTA for free users", () => {
    mockUseIsProQuery.mockReturnValue({ data: false } as any);

    const { getByText } = render(<ProfileView />, { wrapper });

    expect(getByText("Upgrade to Pro")).toBeTruthy();
  });
});
