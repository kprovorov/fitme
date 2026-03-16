import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import Authenticated from "../authenticated";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { mockUser } from "~/lib/test-fixtures";

jest.mock("~/hooks/queries/auth", () => ({
  useCurrentUserQuery: jest.fn(),
}));

jest.mock("expo-router", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(View, { testID: `redirect:${href}` }),
  };
});

const mockUseCurrentUserQuery = useCurrentUserQuery as jest.MockedFunction<
  typeof useCurrentUserQuery
>;

describe("Authenticated", () => {
  it("shows spinner while loading", () => {
    mockUseCurrentUserQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetched: false,
    } as any);

    const { UNSAFE_getByType } = render(
      <Authenticated>
        <Text>Child</Text>
      </Authenticated>,
    );

    const { ActivityIndicator } = require("react-native");
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it("redirects when unauthenticated", () => {
    mockUseCurrentUserQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isFetched: true,
    } as any);

    const { getByTestId } = render(
      <Authenticated>
        <Text>Child</Text>
      </Authenticated>,
    );

    expect(getByTestId("redirect:/auth/register")).toBeTruthy();
  });

  it("renders children when authenticated", () => {
    mockUseCurrentUserQuery.mockReturnValue({
      data: mockUser,
      isLoading: false,
      isFetched: true,
    } as any);

    const { getByText } = render(
      <Authenticated>
        <Text>Child Content</Text>
      </Authenticated>,
    );

    expect(getByText("Child Content")).toBeTruthy();
  });
});
