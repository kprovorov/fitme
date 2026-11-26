/**
 * Stand-in for `expo-haptics`, mocked for every test file by `setup.ts`: each
 * haptic the app fires is recorded in `firedHaptics`, in order, so a test can
 * check which one fired (`{ kind: "notification", type: NotificationFeedbackType.Success }`).
 * The enums are the real module's. `after-each.ts` empties the list
 * (`resetHaptics`).
 */
import { jest } from "@jest/globals";
import type * as Haptics from "expo-haptics";
import type {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from "expo-haptics";

const {
  AndroidHaptics: androidHaptics,
  ImpactFeedbackStyle: impactFeedbackStyle,
  NotificationFeedbackType: notificationFeedbackType,
} = jest.requireActual<typeof Haptics>("expo-haptics");

type FiredHaptic =
  | { kind: "android"; type: AndroidHaptics }
  | { kind: "impact"; style: ImpactFeedbackStyle }
  | { kind: "notification"; type: NotificationFeedbackType }
  | { kind: "selection" };

export const firedHaptics: FiredHaptic[] = [];

export const resetHaptics = (): void => {
  firedHaptics.length = 0;
};

const fire = (haptic: FiredHaptic): Promise<void> => {
  firedHaptics.push(haptic);

  return Promise.resolve();
};

export const hapticsModule = {
  AndroidHaptics: androidHaptics,
  ImpactFeedbackStyle: impactFeedbackStyle,
  impactAsync: (style: ImpactFeedbackStyle = impactFeedbackStyle.Medium) =>
    fire({ kind: "impact", style }),
  NotificationFeedbackType: notificationFeedbackType,
  notificationAsync: (
    type: NotificationFeedbackType = notificationFeedbackType.Success
  ) => fire({ kind: "notification", type }),
  performAndroidHapticsAsync: (type: AndroidHaptics) =>
    fire({ kind: "android", type }),
  selectionAsync: () => fire({ kind: "selection" }),
};

export type { FiredHaptic };
