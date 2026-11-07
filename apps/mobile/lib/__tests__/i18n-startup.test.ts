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

describe("app language at startup", () => {
  it("is English on an English device", () => {
    expect(languageAtStartup(["en-US"])).toBe("en");
  });

  it("is Ukrainian on a Ukrainian device", () => {
    expect(languageAtStartup(["uk-UA"])).toBe("uk");
  });

  it.each([
    ["es-ES", "es"],
    ["es-MX", "es"],
    ["ca-ES", "ca"],
    ["fr-FR", "fr"],
    ["de-DE", "de"],
    ["it-IT", "it"],
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-PT"],
    ["pl-PL", "pl"],
    ["zh-Hans-CN", "zh-Hans"],
    ["zh-Hant-TW", "zh-Hant"],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["zh-SG", "zh-Hans"],
    ["zh-Hans-TW", "zh-Hans"],
    ["zh-Hant-CN", "zh-Hant"],
    ["pt", "pt-BR"],
    ["PT_pt", "pt-PT"],
    ["pt-Latn-PT", "pt-PT"],
    ["zh", "zh-Hans"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["nl-NL", "nl"],
  ])("is %s at startup", (tag, language) => {
    expect(languageAtStartup([tag])).toBe(language);
  });

  it("uses Catalan before Spanish when preferred", () => {
    expect(languageAtStartup(["ru-RU", "ca-ES", "es-ES"])).toBe("ca");
  });

  it("is the first device language the app speaks", () => {
    expect(languageAtStartup(["ru-RU", "uk-UA"])).toBe("uk");
  });

  it("is English on a device in a language the app doesn't speak", () => {
    expect(languageAtStartup(["ru-RU"])).toBe("en");
  });
});
