/**
 * The `expo-haptics` stand-in every test file gets: what the app fires is
 * recorded in order, with the real enums, and nothing carries over to the
 * next test.
 */
import { describe, expect, it } from "@jest/globals";
import * as Haptics from "expo-haptics";

import { firedHaptics } from "~/test-utils/haptics-stub";

describe("the haptics stand-in", () => {
  it("records each haptic fired, in order", async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Haptics.selectionAsync();

    expect(firedHaptics).toEqual([
      { kind: "notification", type: Haptics.NotificationFeedbackType.Success },
      { kind: "impact", style: Haptics.ImpactFeedbackStyle.Light },
      { kind: "selection" },
    ]);
  });

  it("starts each test with nothing recorded", () => {
    expect(firedHaptics).toEqual([]);
  });

  it("has the real module's enums", () => {
    expect(Haptics.NotificationFeedbackType.Success).toBe("success");
    expect(Haptics.ImpactFeedbackStyle.Light).toBe("light");
  });
});
