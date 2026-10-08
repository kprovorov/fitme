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
      children,
      dismissDisabled,
      isPresented,
      onIsPresentedChange,
    }: {
      children?: React.ReactNode;
      dismissDisabled?: boolean;
      isPresented: boolean;
      onIsPresentedChange: (isPresented: boolean) => void;
    }) => (
      // Tests read the sheet's props off this view and fire
      // `isPresentedChange` on it the way the native sheet does when swiped
      // down or tapped outside.
      <View
        {...{ dismissDisabled, isPresented, onIsPresentedChange }}
        testID="native-sheet"
      >
        {isPresented ? children : null}
      </View>
    ),
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

type Props = React.ComponentProps<typeof FinishWorkoutSuggestionDialog>;

const sheet = () => screen.getByTestId("native-sheet");

const dismissSheet = () => fireEvent(sheet(), "isPresentedChange", false);

const FINISH = { name: "Finish Workout" } as const;
const KEEP_TRAINING = { name: "Keep Training" } as const;
const CLOSE = { name: "Close" } as const;

const setup = async (props: Partial<Props> = {}) => {
  const onFinish = jest.fn();
  const onKeepTraining = jest.fn();
  const element = (overrides: Partial<Props> = {}) => (
    <FinishWorkoutSuggestionDialog
      isFinishing={false}
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
    rerender: (overrides: Partial<Props>) => utils.rerender(element(overrides)),
  };
};

describe("FinishWorkoutSuggestionDialog", () => {
  it("passes the open state to the sheet", async () => {
    const { rerender } = await setup({ open: false });
    expect(sheet()).toHaveProp("isPresented", false);

    await rerender({ open: true });
    expect(sheet()).toHaveProp("isPresented", true);
  });

  it("shows the completion copy and both actions when open", async () => {
    await setup();

    expect(screen.getByText("Workout completed!")).toBeTruthy();
    expect(
      screen.getByText("You've tracked all your planned sets.")
    ).toBeTruthy();
    expect(screen.getByRole("button", FINISH)).toBeTruthy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeTruthy();
  });

  it("labels every action for assistive technology", async () => {
    await setup();
    const keepTrainingHint =
      "Closes this suggestion and keeps the workout going";

    const finish = screen.getByTestId("finish-workout-suggestion-finish");
    expect(finish).toHaveProp("accessibilityLabel", "Finish Workout");
    expect(finish).toHaveProp(
      "accessibilityHint",
      "Finishes this workout session"
    );

    const keepTraining = screen.getByTestId(
      "finish-workout-suggestion-keep-training"
    );
    expect(keepTraining).toHaveProp("accessibilityLabel", "Keep Training");
    expect(keepTraining).toHaveProp("accessibilityHint", keepTrainingHint);

    const close = screen.getByTestId("finish-workout-suggestion-close");
    expect(close).toHaveProp("accessibilityLabel", "Close");
    expect(close).toHaveProp("accessibilityHint", keepTrainingHint);
  });

  it("calls onFinish when Finish Workout is tapped", async () => {
    const { onFinish, onKeepTraining } = await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("ignores repeated Finish taps", async () => {
    const { onFinish } = await setup();
    const finish = screen.getByRole("button", FINISH);

    await fireEvent.press(finish);
    await fireEvent.press(finish);
    await fireEvent.press(finish);

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("ignores Finish taps while isFinishing is set", async () => {
    const { onFinish, rerender } = await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));
    await rerender({ isFinishing: true });
    await fireEvent.press(screen.getByRole("button", FINISH));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("locks the dialog as soon as Finish is tapped", async () => {
    await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));

    expect(screen.getByRole("button", FINISH)).toBeBusy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeDisabled();
    expect(screen.getByRole("button", CLOSE)).toBeDisabled();
    expect(sheet()).toHaveProp("dismissDisabled", true);
  });

  it("stays locked while isFinishing is set", async () => {
    await setup({ isFinishing: true });

    expect(screen.getByRole("button", FINISH)).toBeBusy();
    expect(screen.getByRole("button", KEEP_TRAINING)).toBeDisabled();
    expect(screen.getByRole("button", CLOSE)).toBeDisabled();
    expect(sheet()).toHaveProp("dismissDisabled", true);
  });

  it("can be dismissed while idle", async () => {
    await setup();

    expect(sheet()).toHaveProp("dismissDisabled", false);
  });

  it("ignores Keep Training once Finish was tapped", async () => {
    const { onFinish, onKeepTraining } = await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));
    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));
    await fireEvent.press(screen.getByRole("button", CLOSE));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("unlocks for a retry when the finish fails with the dialog open", async () => {
    const { onFinish, onKeepTraining, rerender } = await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));
    await rerender({ isFinishing: true });
    await rerender({ isFinishing: false });

    expect(screen.getByRole("button", FINISH)).not.toBeBusy();
    expect(screen.getByRole("button", KEEP_TRAINING)).not.toBeDisabled();
    expect(sheet()).toHaveProp("dismissDisabled", false);

    await fireEvent.press(screen.getByRole("button", FINISH));
    expect(onFinish).toHaveBeenCalledTimes(2);

    await rerender({ isFinishing: true });
    await rerender({ isFinishing: false });
    await dismissSheet();
    expect(onKeepTraining).toHaveBeenCalledTimes(1);
  });

  it("calls onKeepTraining when Keep Training is tapped", async () => {
    const { onFinish, onKeepTraining } = await setup();

    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("treats the close button as Keep Training", async () => {
    const { onFinish, onKeepTraining } = await setup();

    await fireEvent.press(screen.getByRole("button", CLOSE));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("treats a swipe or backdrop dismissal as Keep Training", async () => {
    const { onFinish, onKeepTraining } = await setup();

    await dismissSheet();

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("reports Keep Training only once per presentation", async () => {
    const { onKeepTraining } = await setup();

    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));
    await dismissSheet();
    await fireEvent.press(screen.getByRole("button", CLOSE));

    expect(onKeepTraining).toHaveBeenCalledTimes(1);
  });

  it("does not report Keep Training when the caller closes the dialog", async () => {
    const { onKeepTraining, rerender } = await setup();

    await rerender({ open: false });
    await dismissSheet();

    expect(onKeepTraining).not.toHaveBeenCalled();
  });

  it("starts fresh each time it is opened again", async () => {
    const { onFinish, onKeepTraining, rerender } = await setup();

    await fireEvent.press(screen.getByRole("button", FINISH));
    await rerender({ open: false });
    await rerender({ open: true });

    expect(screen.getByRole("button", FINISH)).not.toBeBusy();
    await fireEvent.press(screen.getByRole("button", KEEP_TRAINING));
    expect(onKeepTraining).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
