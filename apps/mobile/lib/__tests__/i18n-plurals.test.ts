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

const loadI18n = () => {
  let module: typeof import("~/lib/i18n") | undefined;
  jest.isolateModules(() => {
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
    expect(Intl.PluralRules.supportedLocalesOf(["en", "uk"])).toEqual([
      "en",
      "uk",
    ]);
  });

  it("give Ukrainian counts their one, few and many forms", async () => {
    const { i18n } = loadI18n();
    await i18n.changeLanguage("uk");

    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 підхід");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 підходи");
    expect(i18n.t("counts.sets", { count: 5 })).toBe("5 підходів");
    expect(i18n.t("counts.sets", { count: 21 })).toBe("21 підхід");
  });

  it("give English counts their one and other forms", () => {
    const { i18n } = loadI18n();

    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 set");
    expect(i18n.t("counts.sets", { count: 2 })).toBe("2 sets");
  });
});
