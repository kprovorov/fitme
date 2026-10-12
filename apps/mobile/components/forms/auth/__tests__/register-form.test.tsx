import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import RegisterForm, { type RegisterFormValues } from "../register-form";

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const fillIn = async (values: RegisterFormValues) => {
  await fireEvent.changeText(screen.getByPlaceholderText("Name"), values.name);
  await fireEvent.changeText(
    screen.getByPlaceholderText("Email"),
    values.email
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Password"),
    values.password
  );
};

const submit = () =>
  fireEvent.press(screen.getByRole("button", { name: "Sign Up" }));

describe("RegisterForm", () => {
  it("rejects a password shorter than Clerk's minimum without submitting", async () => {
    const onSubmit = jest.fn(() => Promise.resolve());
    await render(<RegisterForm onSubmit={onSubmit} />);

    await fillIn({
      email: "tony@example.com",
      name: "Tony Stark",
      password: "short-password",
    });
    await submit();

    expect(
      await screen.findByText("Password must be at least 15 characters.")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
