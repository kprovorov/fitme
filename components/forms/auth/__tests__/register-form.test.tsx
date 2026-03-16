import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import RegisterForm from "../register-form";

jest.mock("~/lib/icons/ArrowRight", () => ({
  ArrowRight: () => null,
}));

describe("RegisterForm", () => {
  it("renders all fields and button", () => {
    const { getByTestId } = render(<RegisterForm onSubmit={jest.fn()} />);

    expect(getByTestId("name-input")).toBeTruthy();
    expect(getByTestId("email-input")).toBeTruthy();
    expect(getByTestId("password-input")).toBeTruthy();
    expect(getByTestId("register-button")).toBeTruthy();
  });

  it("validates short name", async () => {
    const { getByTestId, findByText } = render(
      <RegisterForm onSubmit={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId("name-input"), "A");
    fireEvent.press(getByTestId("register-button"));

    await findByText("Name must be at least 2 characters.");
  });

  it("validates short password", async () => {
    const { getByTestId, findByText } = render(
      <RegisterForm onSubmit={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId("name-input"), "Alice");
    fireEvent.changeText(getByTestId("email-input"), "alice@example.com");
    fireEvent.changeText(getByTestId("password-input"), "pass");
    fireEvent.press(getByTestId("register-button"));

    await findByText("Password must be at least 6 characters.");
  });

  it("submits with valid values", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.changeText(getByTestId("name-input"), "Alice");
    fireEvent.changeText(getByTestId("email-input"), "alice@example.com");
    fireEvent.changeText(getByTestId("password-input"), "password123");
    fireEvent.press(getByTestId("register-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
      expect(onSubmit.mock.calls[0][0]).toEqual({
        name: "Alice",
        email: "alice@example.com",
        password: "password123",
      });
    });
  });
});
