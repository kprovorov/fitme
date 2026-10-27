import { MAX_REPS, MAX_WEIGHT, MAX_WEIGHT_DECIMALS } from "@fitme/core/limits";
import { z } from "zod";

// A plain decimal, `,` or `.` as the separator; nothing else is a number here
// (`Number()` would also take `1e3`, `0x10` or `Infinity`).
const DECIMAL_NUMBER = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const SEPARATOR = /[.,]/;

/**
 * A set field's text as a number from 0 to `max`, or `null` when it's empty
 * (the set then logs the recommended value). `precisionIssue` adds the
 * field's own rule (decimals, whole numbers).
 */
const setNumberField = (
  label: string,
  max: number,
  precisionIssue: (value: number, text: string) => string | null
) =>
  z.string().transform((input, ctx): number | null => {
    const text = input.trim();
    if (!text) {
      return null;
    }
    const value = Number(text.replace(",", "."));
    const issue =
      rangeIssue(label, max, text, value) ?? precisionIssue(value, text);
    if (issue) {
      ctx.addIssue({ code: "custom", message: issue });
      return z.NEVER;
    }
    return value;
  });

const rangeIssue = (
  label: string,
  max: number,
  text: string,
  value: number
) => {
  if (!DECIMAL_NUMBER.test(text)) {
    return `${label} must be a number`;
  }
  if (value < 0) {
    return `${label} can't be negative`;
  }
  if (value > max) {
    return `${label} must be at most ${max}`;
  }
  return null;
};

const decimalsOf = (text: string) => text.split(SEPARATOR)[1]?.length ?? 0;

/**
 * The weight field (in the User's unit): 0 to `MAX_WEIGHT`, at most 2
 * decimals (numeric(8,2)).
 */
export const setWeightField = setNumberField("Weight", MAX_WEIGHT, (_, text) =>
  decimalsOf(text) > MAX_WEIGHT_DECIMALS
    ? `Weight can have at most ${MAX_WEIGHT_DECIMALS} decimals`
    : null
);

/** The reps field: a whole number from 0 (still a tracked set) to `MAX_REPS`. */
export const setRepsField = setNumberField("Reps", MAX_REPS, (value) =>
  Number.isInteger(value) ? null : "Reps must be a whole number"
);

/** A stored weight as the weight field shows it: `,` separator, no trailing zeros. */
export const formatSetWeight = (weight: number) =>
  String(Math.round(weight * 100) / 100).replace(".", ",");

/**
 * A set's recommendation as its table's target cell, reps × weight: `12×45 kg`,
 * `12` without a weight, `45 kg` without reps, `–` without either.
 */
export const formatSetTarget = (
  {
    reps_recommended: reps,
    weight_recommended: weight,
  }: { reps_recommended: number | null; weight_recommended: number | null },
  weightLabel: string | undefined
) => {
  const weightText = weight
    ? [formatSetWeight(weight), weightLabel].filter(Boolean).join(" ")
    : null;
  if (reps && weightText) {
    return `${reps}×${weightText}`;
  }
  return reps ? `${reps}` : (weightText ?? "–");
};
