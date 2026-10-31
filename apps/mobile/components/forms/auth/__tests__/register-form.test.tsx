import "~/test-utils/auth-ui";
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
  fireEvent.press(screen.getByRole("button", { name: "Create Account" }));

describe("RegisterForm", () => {
  it("reveals and hides the existing password without changing the draft", async () => {
    const onSubmit = jest.fn(() => Promise.resolve());
    await render(
      <RegisterForm onSubmit={onSubmit}>
        {({ fields, action }) => (
          <>
            {fields}
            {action}
          </>
        )}
      </RegisterForm>
    );
    await fillIn({
      email: "tony@example.com",
      name: "Tony",
      password: "eight888",
    });
    expect(screen.getByTestId("password-input").props.secureTextEntry).toBe(
      true
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Show password" })
    );
    expect(screen.getByTestId("password-input").props.secureTextEntry).toBe(
      false
    );
    expect(screen.getByTestId("password-input").props.value).toBe("eight888");
    await fireEvent.press(
      screen.getByRole("button", { name: "Hide password" })
    );
    expect(screen.getByTestId("password-input").props.secureTextEntry).toBe(
      true
    );
    expect(screen.getByTestId("password-input").props.value).toBe("eight888");
  });
  it("rejects a password shorter than Clerk's minimum without submitting", async () => {
    const onSubmit = jest.fn(() => Promise.resolve());
    await render(
      <RegisterForm onSubmit={onSubmit}>
        {({ fields, action }) => (
          <>
            {fields}
            {action}
          </>
        )}
      </RegisterForm>
    );

    await fillIn({
      email: "tony@example.com",
      name: "Tony Stark",
      password: "seven77",
    });
    await submit();

    expect(
      await screen.findByText("Password must be at least 8 characters.")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts an eight-character password", async () => {
    const onSubmit = jest.fn<(values: RegisterFormValues) => Promise<void>>(
      () => Promise.resolve()
    );
    const values = {
      email: "tony@example.com",
      name: "Tony Stark",
      password: "eight888",
    };
    await render(
      <RegisterForm onSubmit={onSubmit}>
        {({ fields, action }) => (
          <>
            {fields}
            {action}
          </>
        )}
      </RegisterForm>
    );

    await fillIn(values);
    await submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(values);
  });
});
