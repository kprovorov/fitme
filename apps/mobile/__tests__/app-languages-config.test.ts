/**
 * The device's per-app language Settings (iOS Settings → Fitme → Language,
 * Android 13+ per-app language) offer exactly the App languages: the
 * `expo-localization` config plugin in `app.json` declares them, and what it
 * writes at prebuild (iOS `CFBundleLocalizations`, Android's locales config)
 * comes from that list.
 */

import { appLanguages } from "@fitme/core";
import { describe, expect, it } from "@jest/globals";
import appJson from "~/app.json";

const isLocalization = (plugin: unknown) =>
  Array.isArray(plugin)
    ? plugin[0] === "expo-localization"
    : plugin === "expo-localization";

const entry: unknown = appJson.expo.plugins.find(isLocalization);
const options: unknown = Array.isArray(entry) ? entry[1] : undefined;

describe("the expo-localization plugin", () => {
  it("declares exactly the App languages as the supported locales", () => {
    expect(options).toEqual(
      expect.objectContaining({ supportedLocales: [...appLanguages] })
    );
  });

  it("keeps right-to-left support as the plugin's default", () => {
    expect(options).toBeDefined();
    expect(options).not.toHaveProperty("supportsRTL");
    expect(options).not.toHaveProperty("forcesRTL");
  });
});
