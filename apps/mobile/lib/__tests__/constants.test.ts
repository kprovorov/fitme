import { afterEach, describe, expect, it } from "@jest/globals";
import { isDevToolsSyncEnabled } from "../constants";

// Mutate `process.env` in place: Expo's Babel preset reads `EXPO_PUBLIC_*`
// through the object it saw at import, so a replaced object goes unseen.
const { EXPO_PUBLIC_DEVTOOLS_SYNC, NODE_ENV } = process.env;

const setEnv = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

afterEach(() => {
  setEnv("EXPO_PUBLIC_DEVTOOLS_SYNC", EXPO_PUBLIC_DEVTOOLS_SYNC);
  setEnv("NODE_ENV", NODE_ENV);
});

describe("isDevToolsSyncEnabled", () => {
  it("is off when the flag is unset", () => {
    setEnv("EXPO_PUBLIC_DEVTOOLS_SYNC", undefined);
    expect(isDevToolsSyncEnabled()).toBe(false);
  });

  it("is off for anything but true", () => {
    setEnv("EXPO_PUBLIC_DEVTOOLS_SYNC", "1");
    expect(isDevToolsSyncEnabled()).toBe(false);
  });

  it("is on when opted in outside production", () => {
    setEnv("EXPO_PUBLIC_DEVTOOLS_SYNC", "true");
    expect(isDevToolsSyncEnabled()).toBe(true);
  });

  it("stays off in production builds even when opted in", () => {
    setEnv("EXPO_PUBLIC_DEVTOOLS_SYNC", "true");
    setEnv("NODE_ENV", "production");
    expect(isDevToolsSyncEnabled()).toBe(false);
  });
});
