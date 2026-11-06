/**
 * Hermes has no `Intl.PluralRules`, so the app brings its own. Jest runs on
 * Node, whose full `Intl` would hide a missing polyfill, so this test takes
 * Node's away first, as on Hermes, then loads the app's i18n.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const nodePluralRules = Intl.PluralRules;

const loadI18n = (deviceLanguages: readonly string[] = ["en-US"]) => {
  let module: typeof import("~/lib/i18n") | undefined;
  jest.isolateModules(() => {
    jest
      .requireActual<typeof import("~/test-utils/device-locales")>(
        "~/test-utils/device-locales"
      )
      .setDeviceLanguages(deviceLanguages);
    module = jest.requireActual<typeof import("~/lib/i18n")>("~/lib/i18n");
  });

  if (!module) {
    throw new Error("~/lib/i18n didn't load");
  }

  return module;
};

describe("plural rules", () => {
  beforeEach(() => {
    // Hermes has no Intl.PluralRules.
    Reflect.deleteProperty(Intl, "PluralRules");
  });

  afterEach(() => {
    Object.defineProperty(Intl, "PluralRules", {
      configurable: true,
      value: nodePluralRules,
      writable: true,
    });
  });

  it("come from the polyfill the app loads, not Node's Intl", () => {
    loadI18n();

    expect(Intl.PluralRules).not.toBe(nodePluralRules);
    expect(
      (Intl.PluralRules as unknown as { polyfilled?: boolean }).polyfilled
    ).toBe(true);
    expect(
      Intl.PluralRules.supportedLocalesOf(["en", "uk", "es", "ca"])
    ).toEqual(["en", "uk", "es", "ca"]);
  });

  it("give Ukrainian counts their one, few and many forms", async () => {
    const { i18n } = loadI18n();
    await i18n.changeLanguage("uk");

    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 підхід");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 підходи");
    expect(i18n.t("counts.sets", { count: 5 })).toBe("5 підходів");
    expect(i18n.t("counts.sets", { count: 21 })).toBe("21 підхід");
  });

  it.each([
    ["es", "1 serie", "2 series", "1,5 series"],
    ["ca", "1 sèrie", "2 sèries", "1,5 sèries"],
  ])(
    "give %s counts their localized forms without Node's Intl",
    (language, one, other, fraction) => {
      const { i18n } = loadI18n([`${language}-ES`]);

      expect(i18n.t("counts.sets", { count: 1 })).toBe(one);
      expect(i18n.t("counts.sets", { count: 2 })).toBe(other);
      expect(i18n.t("counts.sets", { count: 1.5 })).toBe(fraction);
      expect(new Intl.PluralRules(language).select(1_000_000)).toBe("many");
      i18n.addResource(
        language,
        "translation",
        "counts.sets_many",
        "million form"
      );
      expect(i18n.t("counts.sets", { count: 1_000_000 })).toBe("million form");
    }
  );

  it("give English counts their one and other forms", () => {
    const { i18n } = loadI18n();

    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 set");
    expect(i18n.t("counts.sets", { count: 2 })).toBe("2 sets");
  });
});
