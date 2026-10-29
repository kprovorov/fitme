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

type PluginEntry = string | [string, Record<string, unknown>];

const localizationOptions = () => {
  const entry = (appJson.expo.plugins as PluginEntry[]).find((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "expo-localization"
      : plugin === "expo-localization"
  );
  return Array.isArray(entry) ? entry[1] : undefined;
};

describe("the expo-localization plugin", () => {
  it("declares exactly the App languages as the supported locales", () => {
    expect(localizationOptions()?.supportedLocales).toEqual([...appLanguages]);
  });

  it("keeps right-to-left support as the plugin's default", () => {
    expect(localizationOptions()).not.toHaveProperty("supportsRTL");
    expect(localizationOptions()).not.toHaveProperty("forcesRTL");
  });
});
