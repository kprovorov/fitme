import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { WorkoutSessionFinishSuggestion } from "../workout-session-finish-suggestion";

const mockDismiss = jest.fn();
const mockFinish = jest.fn();
const mockState = { isFinishing: false, isFocused: true, isSuggested: true };

jest.mock("expo-router", () => ({
  useIsFocused: () => mockState.isFocused,
}));

jest.mock("~/hooks/finish-workout-suggestion", () => ({
  useFinishWorkoutSuggestion: () => ({
    dismiss: mockDismiss,
    isSuggested: mockState.isSuggested,
  }),
}));

jest.mock("~/hooks/finish-workout-session", () => ({
  useFinishWorkoutSession: () => ({
    finish: mockFinish,
    isFinishing: mockState.isFinishing,
  }),
}));

// Exposes the props the dialog was given; its own behavior has its own tests.
jest.mock("../finish-workout-suggestion-dialog", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FinishWorkoutSuggestionDialog: ({
      isFinishing,
      onFinish,
      onKeepTraining,
      open,
    }: {
      isFinishing: boolean;
      onFinish: () => void;
      onKeepTraining: () => void;
      open: boolean;
    }) =>
      open ? (
        <>
          <Text testID="finishing">{String(isFinishing)}</Text>
          <Pressable onPress={onFinish} testID="finish" />
          <Pressable onPress={onKeepTraining} testID="keep-training" />
        </>
      ) : null,
  };
});

const renderSuggestion = (isFinished = false) =>
  render(
    <WorkoutSessionFinishSuggestion
      isFinished={isFinished}
      sessionId="session-1"
    />
  );

describe("WorkoutSessionFinishSuggestion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockState, {
      isFinishing: false,
      isFocused: true,
      isSuggested: true,
    });
  });

  it("shows the suggestion on the focused screen of a suggested session", async () => {
    await renderSuggestion();

    expect(screen.getByTestId("finish")).toBeTruthy();
  });

  it("stays hidden until suggested", async () => {
    mockState.isSuggested = false;
    await renderSuggestion();

    expect(screen.queryByTestId("finish")).toBeNull();
  });

  it("stays hidden on screens below the focused one", async () => {
    mockState.isFocused = false;
    await renderSuggestion();

    expect(screen.queryByTestId("finish")).toBeNull();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("never shows for a finished session and drops the suggestion", async () => {
    await renderSuggestion(true);

    expect(screen.queryByTestId("finish")).toBeNull();
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("finishes through the shared finish", async () => {
    mockState.isFinishing = true;
    await renderSuggestion();

    fireEvent.press(screen.getByTestId("finish"));

    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId("finishing").props.children).toBe("true");
  });

  it("keeps training by dismissing the suggestion only", async () => {
    await renderSuggestion();

    fireEvent.press(screen.getByTestId("keep-training"));

    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockFinish).not.toHaveBeenCalled();
  });
});
