import { readFileSync } from "node:fs";
import path from "node:path";

import { appLanguages } from "@fitme/core";
/**
 * What `app.json` declares per App language, since the native project is
 * built from it and nothing there can read the catalogs.
 *
 * The device's per-app language Settings (iOS Settings → Fitme → Language,
 * Android 13+ per-app language) offer exactly the App languages: the
 * `expo-localization` config plugin declares them, and what it writes at
 * prebuild (iOS `CFBundleLocalizations`, Android's locales config) comes
 * from that list. The camera purpose string is the other one: iOS reads it
 * from the app's own per-locale `InfoPlist.strings`, which `expo.locales`
 * writes, so it is the one piece of Fitme's text that lives beside
 * `app.json` rather than in `@fitme/i18n`.
 */
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

const isImagePicker = (plugin: unknown) =>
  Array.isArray(plugin) && plugin[0] === "expo-image-picker";

const imagePicker: unknown = appJson.expo.plugins.find(isImagePicker);

const imagePickerOptions = (
  Array.isArray(imagePicker) ? imagePicker[1] : undefined
) as { cameraPermission?: string } | undefined;

/** What `expo.locales` declares, by App language. */
const declaredLocales = appJson.expo.locales as Record<string, string>;

/**
 * One language's locale file, read from the path `expo.locales` declares
 * rather than imported: there is one per App language, and a file prebuild
 * can't find is exactly what this checks for.
 */
const localeFile = (language: string) => {
  const declared = declaredLocales[language];

  if (!declared) {
    throw new Error(`No locale file declared for ${language}`);
  }

  // Relative to the app's own directory, which `expo.locales`' paths are
  // relative to and which Jest runs from.
  return JSON.parse(
    readFileSync(path.join(process.cwd(), declared), "utf-8")
  ) as Record<string, Record<string, string> | undefined>;
};

describe("the iOS camera purpose string", () => {
  it("keeps every purpose string under `ios`, so Android gets none", () => {
    // A key at the top level of a locale file is written for both
    // platforms, which would leave the Android build a dead
    // `NSCameraUsageDescription` string resource per language: Android
    // needs no purpose string for the camera.
    for (const language of appLanguages) {
      expect(Object.keys(localeFile(language))).toEqual(["ios"]);
    }
  });

  it("has a file for every App language, and for no other", () => {
    expect(Object.keys(declaredLocales).toSorted()).toEqual(
      [...appLanguages].toSorted()
    );

    // Each one where `expo.locales` says it is, so prebuild finds it.
    for (const language of appLanguages) {
      expect(declaredLocales[language]).toBe(`./locales/${language}.json`);
    }
  });

  it("asks for the camera in every App language", () => {
    for (const language of appLanguages) {
      const purpose = localeFile(language).ios?.NSCameraUsageDescription;

      // A missing or blank string is worse than none: iOS kills the app when
      // it reaches for the camera without one.
      expect(purpose?.trim()).toBeTruthy();
      // Every one of them says what Fitme is asking for, by name.
      expect(purpose).toContain("Arnold");
    }
  });

  it("is the English one in the Info.plist itself", () => {
    // The base string every locale's own overrides, so a device in a
    // language iOS has no `.lproj` for still reads a purpose, and the two
    // can't drift apart.
    expect(imagePickerOptions?.cameraPermission).toBe(
      localeFile("en").ios?.NSCameraUsageDescription
    );
  });
});
