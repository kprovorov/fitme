import { describe, expect, it } from "vitest";
import {
  arnoldErrorCodes,
  isArnoldRefusal,
  legacyArnoldErrorCodes,
} from "../models";

describe("isArnoldRefusal", () => {
  it.each(["arnold_pro_required", "coach_pro_required"])(
    "recognises %s as the Pro refusal",
    (code) => {
      expect(isArnoldRefusal(code, "proRequired")).toBe(true);
      expect(isArnoldRefusal(code, "proCheckUnavailable")).toBe(false);
    }
  );

  it.each(["arnold_pro_check_unavailable", "coach_pro_check_unavailable"])(
    "recognises %s as the Pro check outage",
    (code) => {
      expect(isArnoldRefusal(code, "proCheckUnavailable")).toBe(true);
      expect(isArnoldRefusal(code, "proRequired")).toBe(false);
    }
  );

  it("recognises nothing else", () => {
    for (const code of [undefined, null, "", 403, "pro_required"]) {
      expect(isArnoldRefusal(code, "proRequired")).toBe(false);
      expect(isArnoldRefusal(code, "proCheckUnavailable")).toBe(false);
    }
  });

  it("keeps the codes old builds know", () => {
    expect(legacyArnoldErrorCodes).toEqual({
      proCheckUnavailable: "coach_pro_check_unavailable",
      proRequired: "coach_pro_required",
    });
    expect(arnoldErrorCodes).toEqual({
      proCheckUnavailable: "arnold_pro_check_unavailable",
      proRequired: "arnold_pro_required",
    });
  });
});
