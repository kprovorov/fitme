import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ShownExercise } from "~/hooks/queries/library";
import SessionExerciseHeader from "../session-exercise-header";

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/exercises/exercise-video", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return ({ url }: { url: string }) => (
    <View testID="exercise-video" {...{ url }} />
  );
});

const PRESS: ShownExercise = {
  isResolved: true,
  muscle_groups: ["shoulders", "triceps"],
  name: "Shoulder Press",
  slug: "shoulder-press",
  thumbnail_url: "https://example.test/thumb.jpg",
  video_url: "https://example.test/clip.mp4",
};

const DESCRIPTION =
  "A foundational lower-body exercise enhancing strength, power, and balance.";

describe("SessionExerciseHeader", () => {
  it("shows the description on at most two lines, opening the guide", async () => {
    const onOpenGuide = jest.fn();
    await render(
      <SessionExerciseHeader
        description={DESCRIPTION}
        exercise={PRESS}
        onOpenGuide={onOpenGuide}
      />
    );

    expect(screen.getByText(DESCRIPTION).props.numberOfLines).toBe(2);
    await fireEvent.press(screen.getByRole("button", { name: DESCRIPTION }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it("opens the guide from the How to? button", async () => {
    const onOpenGuide = jest.fn();
    await render(
      <SessionExerciseHeader
        description={DESCRIPTION}
        exercise={PRESS}
        onOpenGuide={onOpenGuide}
      />
    );

    await fireEvent.press(screen.getByRole("button", { name: "How to?" }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it("plays the clip with the muscle groups over it", async () => {
    await render(
      <SessionExerciseHeader
        description={DESCRIPTION}
        exercise={PRESS}
        onOpenGuide={jest.fn()}
      />
    );

    expect(screen.getByTestId("exercise-video").props.url).toBe(
      PRESS.video_url
    );
    expect(screen.getByText("Shoulders")).toBeTruthy();
    expect(screen.getByText("Triceps")).toBeTruthy();
  });

  it("shows no description until the Exercise in full has one", async () => {
    await render(
      <SessionExerciseHeader
        description={null}
        exercise={PRESS}
        onOpenGuide={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: DESCRIPTION })).toBeNull();
    expect(screen.getByRole("button", { name: "How to?" })).toBeTruthy();
  });

  it("offers no guide and no media for an Exercise the library doesn't know", async () => {
    const unknown: ShownExercise = {
      isResolved: false,
      muscle_groups: [],
      name: "Shoulder press",
      slug: "shoulder-press",
      thumbnail_url: null,
      video_url: null,
    };
    await render(
      <SessionExerciseHeader description={null} exercise={unknown} />
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("exercise-video")).toBeNull();
  });
});
