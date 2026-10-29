import { MAX_REPS, MAX_WEIGHT, MAX_WEIGHT_DECIMALS } from "@fitme/core/limits";
import { formatCount, formatNumber, type Translator } from "@fitme/i18n";
import { z } from "zod";
import { i18n } from "~/lib/i18n";

// A plain decimal, `,` or `.` as the separator; nothing else is a number here
// (`Number()` would also take `1e3`, `0x10` or `Infinity`).
const DECIMAL_NUMBER = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const SEPARATOR = /[.,]/;

/** A set field's messages, read in the App language when the field is parsed. */
interface FieldMessages {
  negative: () => string;
  notNumber: () => string;
  tooHigh: () => string;
}

/**
 * A set field's text as a number from 0 to `max`, or `null` when it's empty
 * (the set then logs the recommended value). `precisionIssue` adds the
 * field's own rule (decimals, whole numbers).
 */
const setNumberField = (
  messages: FieldMessages,
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
      rangeIssue(messages, max, text, value) ?? precisionIssue(value, text);
    if (issue) {
      ctx.addIssue({ code: "custom", message: issue });
      return z.NEVER;
    }
    return value;
  });

const rangeIssue = (
  messages: FieldMessages,
  max: number,
  text: string,
  value: number
) => {
  if (!DECIMAL_NUMBER.test(text)) {
    return messages.notNumber();
  }
  if (value < 0) {
    return messages.negative();
  }
  if (value > max) {
    return messages.tooHigh();
  }
  return null;
};

const decimalsOf = (text: string) => text.split(SEPARATOR)[1]?.length ?? 0;

// The bounds go into the messages ungrouped (`10000`, not `10,000`): the
// field reads `10,000` as 10.
/**
 * The weight field (in the User's unit): 0 to `MAX_WEIGHT`, at most 2
 * decimals (numeric(8,2)).
 */
export const setWeightField = setNumberField(
  {
    negative: () => i18n.t("sets.form.weightNegative"),
    notNumber: () => i18n.t("sets.form.weightNotNumber"),
    tooHigh: () => i18n.t("sets.form.weightTooHigh", { max: MAX_WEIGHT }),
  },
  MAX_WEIGHT,
  (_, text) =>
    decimalsOf(text) > MAX_WEIGHT_DECIMALS
      ? i18n.t("sets.form.weightDecimals", { count: MAX_WEIGHT_DECIMALS })
      : null
);

/** The reps field: a whole number from 0 (still a tracked set) to `MAX_REPS`. */
export const setRepsField = setNumberField(
  {
    negative: () => i18n.t("sets.form.repsNegative"),
    notNumber: () => i18n.t("sets.form.repsNotNumber"),
    tooHigh: () => i18n.t("sets.form.repsTooHigh", { max: MAX_REPS }),
  },
  MAX_REPS,
  (value) => (Number.isInteger(value) ? null : i18n.t("sets.form.repsNotWhole"))
);

/** A stored weight as the weight field shows it: `,` separator, no trailing zeros. */
export const formatSetWeight = (weight: number) =>
  String(Math.round(weight * 100) / 100).replace(".", ",");

/**
 * A set's recommendation as its table's target cell, reps × weight: `12×45kg`,
 * `12` without a weight, `45kg` without reps, `–` without either. No space
 * before the unit, so the cell fits its column at body size.
 */
export const formatSetTarget = (
  {
    reps_recommended: reps,
    weight_recommended: weight,
  }: { reps_recommended: number | null; weight_recommended: number | null },
  weightLabel: string | undefined
) => {
  const weightText = weight
    ? `${formatSetWeight(weight)}${weightLabel ?? ""}`
    : null;
  if (reps && weightText) {
    return `${reps}×${weightText}`;
  }
  return reps ? `${reps}` : (weightText ?? "–");
};

/**
 * A set's recommendation as VoiceOver reads it, in the App language:
 * `12 reps at 45 kg`, `12 reps` or `45 kg` with one of them, `no target`
 * without either.
 */
export const describeSetTarget = (
  {
    reps_recommended: reps,
    weight_recommended: weight,
  }: { reps_recommended: number | null; weight_recommended: number | null },
  weightLabel: string | undefined,
  translator: Translator = i18n
) => {
  const repsText = reps ? formatCount(translator, "reps", reps) : null;
  // A spoken decimal takes the language's separator: "50.5" / "50,5".
  const weightText = weight
    ? [formatNumber(translator, weight), weightLabel].filter(Boolean).join(" ")
    : null;
  if (repsText && weightText) {
    return translator.t("sets.repsAtWeight", {
      reps: repsText,
      weight: weightText,
    });
  }
  return repsText ?? weightText ?? translator.t("sets.noTarget");
};
