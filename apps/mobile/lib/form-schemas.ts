import { z } from "zod";
import { i18n } from "~/lib/i18n";

/** A message zod reads when the form validates, so it's in the App language of that moment. */
type Message = string | (() => string);

/**
 * A form number between `min` and `max`, coerced from what the field holds.
 * Its input type is `number` too: zod 4 types a coerced input as `unknown`,
 * which react-hook-form can't type the fields from. The range messages come
 * from the catalogs (zod 3's defaults in English, which the forms showed
 * until zod 4). Every message is read when the form validates, so a
 * translated one is in the App language of that moment.
 */
export const numberInRange = (
  min: number,
  max: number,
  requiredMessage: Message
) =>
  z.coerce
    .number<number>({ error: requiredMessage })
    .min(min, { error: () => i18n.t("forms.numberMin", { min }) })
    .max(max, { error: () => i18n.t("forms.numberMax", { max }) });
