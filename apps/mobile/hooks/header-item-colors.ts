import { useMemo } from "react";
import { useCSSVariable } from "uniwind";

/**
 * The colors a native header item (`unstable_headerLeftItems` /
 * `unstable_headerRightItems`) takes from the tokens, spread into the item.
 * Without them iOS draws a prominent item in system blue, whatever the
 * navigation theme says (FIT-765).
 *
 * - `prominent`: the Screen's one action (Save, Continue): a lime fill with a
 *   `primary-foreground` label, as Figma's Plan editor shows it. The system
 *   still greys it out while it's `disabled`.
 * - `plain`: every other text item (Cancel, Back): a `foreground` label on
 *   the bar's glass.
 */
export const useHeaderItemColors = () => {
  // SAFETY: tokens.css, imported by global.css, defines this token as a hex color string.
  const primary = useCSSVariable("--color-primary") as string;

  // SAFETY: tokens.css, imported by global.css, defines this token as a hex color string.
  const primaryForeground = useCSSVariable(
    "--color-primary-foreground"
  ) as string;

  // SAFETY: tokens.css, imported by global.css, defines this token as a hex color string.
  const foreground = useCSSVariable("--color-foreground") as string;

  return useMemo(
    () => ({
      plain: { labelStyle: { color: foreground }, tintColor: foreground },
      prominent: {
        labelStyle: { color: primaryForeground },
        tintColor: primary,
        variant: "prominent" as const,
      },
    }),
    [foreground, primary, primaryForeground]
  );
};
