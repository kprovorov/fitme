import { MAX_REPS, MAX_WEIGHT, MAX_WEIGHT_DECIMALS } from "@fitme/core/limits";
import { z } from "zod";

// A plain decimal, `,` or `.` as the separator; nothing else is a number here
// (`Number()` would also take `1e3`, `0x10` or `Infinity`).
const DECIMAL = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const SEPARATOR = /[.,]/;

/**
 * A set field's text as a number, or `null` when it's empty (the set then
 * logs the recommended value). Anything else is an issue with `label`.
 */
const setNumberField = (
  label: string,
  check: (value: number, text: string) => string | null
) =>
  z.string().transform((input, ctx): number | null => {
    const text = input.trim();
    if (!text) {
      return null;
    }
    const value = Number(text.replace(",", "."));
    const error = DECIMAL.test(text)
      ? check(value, text)
      : `${label} must be a number`;
    if (error) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return value;
  });

const decimalsOf = (text: string) => text.split(SEPARATOR)[1]?.length ?? 0;

/** The KG field: 0 to `MAX_WEIGHT`, at most 2 decimals (numeric(8,2)). */
export const setWeightField = setNumberField("Weight", (value, text) => {
  if (value < 0) {
    return "Weight can't be negative";
  }
  if (value > MAX_WEIGHT) {
    return `Weight must be at most ${MAX_WEIGHT}`;
  }
  if (decimalsOf(text) > MAX_WEIGHT_DECIMALS) {
    return `Weight can have at most ${MAX_WEIGHT_DECIMALS} decimals`;
  }
  return null;
});

/** The REPS field: a whole number from 0 (still a tracked set) to `MAX_REPS`. */
export const setRepsField = setNumberField("Reps", (value) => {
  if (!Number.isInteger(value)) {
    return "Reps must be a whole number";
  }
  if (value < 0) {
    return "Reps can't be negative";
  }
  if (value > MAX_REPS) {
    return `Reps must be at most ${MAX_REPS}`;
  }
  return null;
});

/** A stored weight as the KG field shows it: `,` separator, no trailing zeros. */
export const formatSetWeight = (weight: number) =>
  String(Math.round(weight * 100) / 100).replace(".", ",");
