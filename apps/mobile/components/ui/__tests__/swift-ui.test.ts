import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type * as ReactNative from "react-native";

import type * as SwiftUI from "../swift-ui";

describe("native circle availability", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["16.7.12", false],
    ["17.7.1", true],
    ["18.7.1", true],
    ["26.1.1", true],
    [26, true],
  ] as const)("uses the device's major version for %s", (version, enabled) => {
    let nativeCircleEnabled = false;

    jest.isolateModules(() => {
      const { Platform } =
        jest.requireActual<typeof ReactNative>("react-native");

      jest.spyOn(Platform, "Version", "get").mockReturnValue(version);

      nativeCircleEnabled =
        jest.requireActual<typeof SwiftUI>("../swift-ui").NATIVE_CIRCLE_ENABLED;
    });

    expect(nativeCircleEnabled).toBe(enabled);
  });
});
