import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Input } from "../input";
import { Textarea } from "../textarea";

describe("Input", () => {
  it("shows its error under the field and reads it as the field's hint", async () => {
    await render(<Input error="Invalid email" placeholder="Email" />);

    expect(screen.getByRole("alert", { name: "Invalid email" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Email").props.accessibilityHint).toBe(
      "Invalid email"
    );
  });

  it("keeps the caller's hint after the error", async () => {
    await render(
      <Input
        accessibilityHint="Used to sign in"
        error="Invalid email"
        placeholder="Email"
      />
    );

    expect(screen.getByPlaceholderText("Email").props.accessibilityHint).toBe(
      "Invalid email. Used to sign in"
    );
  });

  it("shows no message without an error, or when the error is only a flag", async () => {
    const { rerender } = await render(<Input placeholder="Reps" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByPlaceholderText("Reps").props.accessibilityHint
    ).toBeUndefined();

    await rerender(<Input error placeholder="Reps" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("draws the ring stroke while focused, and the destructive one over it with an error", async () => {
    const { rerender } = await render(<Input placeholder="Email" />);
    await fireEvent(screen.getByPlaceholderText("Email"), "focus");
    expect(screen.getByPlaceholderText("Email").props.className).toContain(
      "border-ring"
    );

    await rerender(<Input error="Invalid email" placeholder="Email" />);
    const field = screen.getByPlaceholderText("Email");
    expect(field.props.className).toContain("border-destructive");
    expect(field.props.className).not.toContain("border-ring");
  });

  it("dims a field that isn't editable", async () => {
    const { rerender } = await render(<Input placeholder="Email" />);
    expect(screen.getByPlaceholderText("Email").props.className).not.toContain(
      "opacity-50"
    );

    await rerender(<Input editable={false} placeholder="Email" />);
    expect(screen.getByPlaceholderText("Email").props.className).toContain(
      "opacity-50"
    );
  });

  it("draws a transparent stroke as ghost, still ring while focused and destructive with an error", async () => {
    const { rerender } = await render(
      <Input placeholder="Reps" variant="ghost" />
    );
    const field = screen.getByPlaceholderText("Reps");
    expect(field.props.className).toContain("border-transparent");
    expect(field.props.className).not.toContain("border-input");

    await fireEvent(screen.getByPlaceholderText("Reps"), "focus");
    expect(screen.getByPlaceholderText("Reps").props.className).toContain(
      "border-ring"
    );

    await rerender(<Input error placeholder="Reps" variant="ghost" />);
    expect(screen.getByPlaceholderText("Reps").props.className).toContain(
      "border-destructive"
    );
  });

  it("still calls the caller's focus handlers", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(
      <Input onBlur={onBlur} onFocus={onFocus} placeholder="Email" />
    );

    await fireEvent(screen.getByPlaceholderText("Email"), "focus");
    await fireEvent(screen.getByPlaceholderText("Email"), "blur");

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe("Textarea", () => {
  it("shows its error like Input", async () => {
    await render(
      <Textarea error="Keep it under 500 characters." placeholder="Note" />
    );

    expect(
      screen.getByRole("alert", { name: "Keep it under 500 characters." })
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Note").props.multiline).toBe(true);
  });
});
