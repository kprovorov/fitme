import { z } from "zod";

/**
 * A form number between `min` and `max`, coerced from what the field holds.
 * Its input type is `number` too: zod 4 types a coerced input as `unknown`,
 * which react-hook-form can't type the fields from. The range messages are
 * zod 3's defaults, which the forms showed until zod 4. A function as the
 * required message is read when the form validates, so a translated one is
 * in the App language of that moment.
 */
export const numberInRange = (
  min: number,
  max: number,
  requiredMessage: string | (() => string)
) =>
  z.coerce
    .number<number>({ error: requiredMessage })
    .min(min, { error: `Number must be greater than or equal to ${min}` })
    .max(max, { error: `Number must be less than or equal to ${max}` });
