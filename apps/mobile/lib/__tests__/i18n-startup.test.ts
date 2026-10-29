/**
 * The App language at launch: importing `~/lib/i18n` starts the translations
 * in the language the device asks for, before anything renders, so the first
 * frame is never in the wrong language. Each test loads the module afresh
 * on its device.
 */
import { describe, expect, it, jest } from "@jest/globals";

/** The App language `~/lib/i18n` starts in, loaded on a device in these languages. */
const languageAtStartup = (deviceLanguages: readonly string[]) => {
  let language: string | undefined;
  // A fresh module registry has its own mocked device, so set it in there.
  jest.isolateModules(() => {
    jest
      .requireActual<typeof import("~/test-utils/device-locales")>(
        "~/test-utils/device-locales"
      )
      .setDeviceLanguages(deviceLanguages);
    const { i18n } =
      jest.requireActual<typeof import("~/lib/i18n")>("~/lib/i18n");
    ({ language } = i18n);
  });
  return language;
};

describe("App language at startup", () => {
  it("is English on an English device", () => {
    expect(languageAtStartup(["en-US"])).toBe("en");
  });

  it("is Ukrainian on a Ukrainian device", () => {
    expect(languageAtStartup(["uk-UA"])).toBe("uk");
  });

  it("is the first device language the app speaks", () => {
    expect(languageAtStartup(["ru-RU", "uk-UA"])).toBe("uk");
  });

  it("is English on a device in a language the app doesn't speak", () => {
    expect(languageAtStartup(["ru-RU"])).toBe("en");
  });
});
