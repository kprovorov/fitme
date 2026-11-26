import { describe, expect, it } from "vitest";

import { MAX_NOTE_LENGTH } from "../limits";
import { cleanNote, noteLength } from "../notes";

describe("cleaning a note", () => {
  it("trims the text at both ends", () => {
    expect(cleanNote("  Seat on hole 4 \n")).toStrictEqual({
      ok: true,
      note: "Seat on hole 4",
    });
  });

  it("keeps the line breaks inside", () => {
    expect(cleanNote("\nSeat on 4\nFeet high\r\n\nSlow down\t")).toStrictEqual({
      ok: true,
      note: "Seat on 4\nFeet high\r\n\nSlow down",
    });
  });

  it("answers empty or whitespace-only text as no note", () => {
    expect(cleanNote("")).toStrictEqual({ ok: true, note: null });
    expect(cleanNote("   ")).toStrictEqual({ ok: true, note: null });
    expect(cleanNote(" \n\t\r\n ")).toStrictEqual({ ok: true, note: null });
  });

  it("takes exactly the limit and refuses one character more", () => {
    const atLimit = "a".repeat(MAX_NOTE_LENGTH);

    expect(MAX_NOTE_LENGTH).toBe(500);
    expect(cleanNote(atLimit)).toStrictEqual({ ok: true, note: atLimit });
    expect(cleanNote(`${atLimit}b`)).toStrictEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("counts the limit after trimming", () => {
    const atLimit = "a".repeat(MAX_NOTE_LENGTH);

    expect(cleanNote(`   ${atLimit}   \n`)).toStrictEqual({
      ok: true,
      note: atLimit,
    });
  });

  it("counts an emoji as Postgres does, one character per code point", () => {
    const emojiAtLimit = "💪".repeat(MAX_NOTE_LENGTH);

    expect(emojiAtLimit).toHaveLength(MAX_NOTE_LENGTH * 2);
    expect(noteLength(emojiAtLimit)).toBe(MAX_NOTE_LENGTH);
    expect(cleanNote(emojiAtLimit)).toStrictEqual({
      ok: true,
      note: emojiAtLimit,
    });
    expect(cleanNote(`${emojiAtLimit}💪`)).toStrictEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("counts each code point of a combined emoji", () => {
    // Woman lifting weights: U+1F3CB U+FE0F U+200D U+2640 U+FE0F.
    expect(noteLength("🏋️‍♀️")).toBe(5);
  });

  it("refuses a NUL character anywhere", () => {
    expect(cleanNote("Seat\u0000 on 4")).toStrictEqual({
      ok: false,
      reason: "nul",
    });
    expect(cleanNote("\u0000")).toStrictEqual({ ok: false, reason: "nul" });
  });
});
