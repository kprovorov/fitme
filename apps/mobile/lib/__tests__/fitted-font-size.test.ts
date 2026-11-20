import { describe, expect, it } from "@jest/globals";

import {
  fittedFontSize,
  MIN_FITTED_FONT_SIZE,
  MONO_ADVANCE,
} from "~/lib/fitted-font-size";

/** The width `text` takes in the mono font at `fontSize`, scaled. */
const drawnWidth = (text: string, fontSize: number, fontScale = 1) =>
  text.length * fontSize * MONO_ADVANCE * fontScale;

describe("fittedFontSize", () => {
  it("keeps the full size while the text fits", () => {
    expect(fittedFontSize({ text: "12", width: 60, fontSize: 17 })).toBe(17);
  });

  it("keeps the full size before the field has been laid out", () => {
    expect(fittedFontSize({ text: "10000.555", width: 0, fontSize: 17 })).toBe(
      17
    );
  });

  it("keeps the full size for an empty field", () => {
    expect(fittedFontSize({ text: "", width: 20, fontSize: 17 })).toBe(17);
  });

  it("shrinks a value that would overflow until it fits, with room for the caret", () => {
    const width = 90;
    const size = fittedFontSize({ text: "10000.555", width, fontSize: 17 });

    expect(size).toBeLessThan(17);
    expect(drawnWidth("10000.555 ", size)).toBeLessThanOrEqual(width);
  });

  it("counts the text scale the field is drawn at", () => {
    const width = 90;

    const size = fittedFontSize({
      fontScale: 1.4,
      fontSize: 17,
      text: "55.555",
      width,
    });

    expect(drawnWidth("55.555 ", size, 1.4)).toBeLessThanOrEqual(width);
    expect(
      fittedFontSize({ fontSize: 17, text: "55.555", width })
    ).toBeGreaterThan(size);
  });

  it("leaves no caret room for a placeholder", () => {
    const fitted = { fontSize: 17, text: "1000.5", width: 60 };

    expect(fittedFontSize({ ...fitted, hasCaret: false })).toBeGreaterThan(
      fittedFontSize(fitted)
    );
    expect(
      drawnWidth("1000.5", fittedFontSize({ ...fitted, hasCaret: false }))
    ).toBeLessThanOrEqual(60);
  });

  it("never goes below the smallest readable size", () => {
    expect(fittedFontSize({ text: "10000.555", width: 10, fontSize: 17 })).toBe(
      MIN_FITTED_FONT_SIZE
    );
  });
});
