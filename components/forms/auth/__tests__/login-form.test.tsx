import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import LoginForm from "../login-form";

jest.mock("~/lib/icons/ArrowRight", () => ({
  ArrowRight: () => null,
}));

describe("LoginForm", () => {
  it("renders fields and button", () => {
    const { getByTestId } = render(<LoginForm onSubmit={jest.fn()} />);

    expect(getByTestId("login-email-input")).toBeTruthy();
    expect(getByTestId("login-password-input")).toBeTruthy();
    expect(getByTestId("login-button")).toBeTruthy();
  });

  it("shows validation errors on empty submit", async () => {
    const onSubmit = jest.fn();
    const { getByTestId, findByText } = render(
      <LoginForm onSubmit={onSubmit} />,
    );

    fireEvent.press(getByTestId("login-button"));

    await findByText("Invalid email");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows error for invalid email", async () => {
    const { getByTestId, findByText } = render(
      <LoginForm onSubmit={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId("login-email-input"), "notanemail");
    fireEvent.press(getByTestId("login-button"));

    await findByText("Invalid email");
  });

  it("submits with valid values", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(getByTestId("login-email-input"), "test@example.com");
    fireEvent.changeText(getByTestId("login-password-input"), "password123");
    fireEvent.press(getByTestId("login-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
      expect(onSubmit.mock.calls[0][0]).toEqual({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("shows spinner while submitting", async () => {
    let resolveSubmit: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = jest.fn().mockReturnValue(pendingPromise);

    const { getByTestId, findByTestId } = render(
      <LoginForm onSubmit={onSubmit} />,
    );

    fireEvent.changeText(getByTestId("login-email-input"), "test@example.com");
    fireEvent.changeText(getByTestId("login-password-input"), "password123");
    fireEvent.press(getByTestId("login-button"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const button = getByTestId("login-button");
    expect(button.props.accessibilityState?.disabled).toBe(true);

    resolveSubmit!();
  });
});
