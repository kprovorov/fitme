import { describe, expect, it } from "vitest";
import { formatHeight, formatWeight } from "../formatters";

describe("formatWeight", () => {
  it("metric: appends kg", () => {
    expect(formatWeight(70, "metric")).toBe("70 kg");
  });

  it("us: appends lbs", () => {
    expect(formatWeight(155, "us")).toBe("155 lbs");
  });

  it("uk: appends lbs", () => {
    expect(formatWeight(155, "uk")).toBe("155 lbs");
  });
});

describe("formatHeight", () => {
  it("metric: appends cm", () => {
    expect(formatHeight(180, "metric")).toBe("180 cm");
  });

  it("us: converts inches to feet and inches", () => {
    expect(formatHeight(71, "us")).toBe("5′ 11″");
  });

  it("us: handles zero inches", () => {
    expect(formatHeight(60, "us")).toBe("5′ 0″");
  });

  it("uk: converts inches to feet and inches", () => {
    expect(formatHeight(72, "uk")).toBe("6′ 0″");
  });
});
