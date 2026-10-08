import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type * as React from "react";
import { FinishWorkoutSuggestionDialog } from "../finish-workout-suggestion-dialog";

// The real primitives render native SwiftUI views that can't mount under
// Jest, so they're swapped for plain React Native stand-ins that keep the
// props this component relies on.
jest.mock("~/components/ui/dialog", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Dialog: ({
      isPresented,
      onIsPresentedChange,
      children,
    }: {
      children?: React.ReactNode;
      isPresented: boolean;
      onIsPresentedChange: (isPresented: boolean) => void;
    }) =>
      isPresented ? (
        // Tests fire `isPresentedChange` on this view the way the native
        // sheet does when swiped down or tapped outside.
        <View {...{ onIsPresentedChange }} testID="native-sheet">
          {children}
        </View>
      ) : null,
  };
});

jest.mock("~/components/ui/button", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Button: ({
      accessibilityHint,
      accessibilityLabel,
      disabled,
      isLoading,
      label,
      onPress,
      testID,
    }: {
      accessibilityHint?: string;
      accessibilityLabel?: string;
      disabled?: boolean;
      isLoading?: boolean;
      label?: string;
      onPress?: () => void;
      testID?: string;
    }) => (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{
          busy: !!isLoading,
          disabled: !!(disabled || isLoading),
        }}
        // Presses always go through, so the tests exercise the component's own
        // duplicate-tap guard rather than the native disabled state.
        onPress={onPress}
        testID={testID}
      >
        {label ? <Text>{label}</Text> : null}
      </Pressable>
    ),
  };
});

const dismissSheet = () =>
  fireEvent(screen.getByTestId("native-sheet"), "isPresentedChange", false);

const FINISH = { name: "Finish Workout" } as const;
const KEEP_TRAINING = { name: "Keep Training" } as const;
const CLOSE = { name: "Close" } as const;

const setup = async (
  props: Partial<React.ComponentProps<typeof FinishWorkoutSuggestionDialog>>
) => {
  const onFinish = jest.fn();
  const onKeepTraining = jest.fn();
  const element = (
    overrides: Partial<
      React.ComponentProps<typeof FinishWorkoutSuggestionDialog>
    > = {}
  ) => (
    <FinishWorkoutSuggestionDialog
      onFinish={onFinish}
      onKeepTraining={onKeepTraining}
      open
      {...props}
      {...overrides}
    />
  );
  const utils = await render(element());

  return {
    onFinish,
    onKeepTraining,
    rerender: (
      overrides: Partial<
        React.ComponentProps<typeof FinishWorkoutSuggestionDialog>
      >
    ) => utils.rerender(element(overrides)),
  };
};

describe("FinishWorkoutSuggestionDialog", () => {
  it("renders nothing while closed", async () => {
    await setup({ open: false });

    expect(screen.queryByText("Workout completed!")).toBeNull();
    expect(screen.queryByRole("button", FINISH)).toBeNull();
  });

  it("shows the completion copy and both actions when open", async () => {
    await setup({});

    expect(screen.getByText("Workout completed!")).toBeTruthy();
    expect(
      screen.getByText("You've tracked all your planned sets.")
    ).toBeTruthy();
    expect(screen.getByRole("button", FINISH)).toBeTruthy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeTruthy();
  });

  it("labels every action for assistive technology", async () => {
    await setup({});

    expect(screen.getByRole("button", FINISH)).toHaveProp(
      "accessibilityHint",
      "Finishes this workout session"
    );
    expect(screen.getByRole("button", KEEP_TRAINING)).toHaveProp(
      "accessibilityHint",
      "Closes this suggestion and keeps the workout going"
    );
    expect(screen.getByRole("button", CLOSE)).toHaveProp(
      "accessibilityHint",
      "Closes this suggestion and keeps the workout going"
    );
  });

  it("calls onFinish when Finish Workout is tapped", async () => {
    const { onFinish, onKeepTraining } = await setup({});

    await fireEvent.press(screen.getByRole("button", FINISH));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("ignores repeated Finish taps", async () => {
    const { onFinish } = await setup({});
    const finish = screen.getByRole("button", FINISH);

    await fireEvent.press(finish);
    await fireEvent.press(finish);
    await fireEvent.press(finish);

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("marks Finish busy and disables the other actions once tapped", async () => {
    await setup({});

    await fireEvent.press(screen.getByRole("button", FINISH));

    expect(screen.getByRole("button", FINISH)).toBeBusy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeDisabled();
    expect(screen.getByRole("button", CLOSE)).toBeDisabled();
  });

  it("does not treat the sheet closing after Finish as Keep Training", async () => {
    const { onFinish, onKeepTraining } = await setup({});

    await fireEvent.press(screen.getByRole("button", FINISH));
    await dismissSheet();
    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("allows a retry when the finish promise rejects", async () => {
    const onFinish = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    await setup({ onFinish });

    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(await screen.findByRole("button", FINISH)).not.toBeBusy();

    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it("allows a retry when isFinishing settles with the dialog still open", async () => {
    const { onFinish, rerender } = await setup({});

    await fireEvent.press(screen.getByRole("button", FINISH));
    await rerender({ isFinishing: true });
    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(onFinish).toHaveBeenCalledTimes(1);

    await rerender({ isFinishing: false });
    expect(screen.getByRole("button", FINISH)).not.toBeBusy();

    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it("shows Finish busy while isFinishing is set", async () => {
    await setup({ isFinishing: true });

    expect(screen.getByRole("button", FINISH)).toBeBusy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeDisabled();
  });

  it("calls onKeepTraining when Keep Training is tapped", async () => {
    const { onFinish, onKeepTraining } = await setup({});

    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("treats the close button as Keep Training", async () => {
    const { onFinish, onKeepTraining } = await setup({});

    await fireEvent.press(screen.getByRole("button", CLOSE));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("treats a swipe or backdrop dismissal as Keep Training", async () => {
    const { onFinish, onKeepTraining } = await setup({});

    await dismissSheet();

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("reports Keep Training only once per presentation", async () => {
    const { onKeepTraining } = await setup({});

    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));
    await dismissSheet();
    await fireEvent.press(screen.getByRole("button", CLOSE));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
  });

  it("does not report Keep Training when the caller closes the dialog", async () => {
    const { onKeepTraining, rerender } = await setup({});

    await rerender({ open: false });

    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("starts fresh each time it is opened again", async () => {
    const { onFinish, rerender } = await setup({});

    await fireEvent.press(screen.getByRole("button", FINISH));
    await rerender({ open: false });
    await rerender({ open: true });

    expect(screen.getByRole("button", FINISH)).not.toBeBusy();
    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(onFinish).toHaveBeenCalledTimes(2);
  });
});
