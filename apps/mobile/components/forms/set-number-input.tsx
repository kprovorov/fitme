import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useWindowDimensions } from "react-native";
import { useCSSVariable } from "uniwind";

import { Input } from "~/components/ui/input";
import type { InputProps } from "~/components/ui/input";
import { fittedFontSize } from "~/lib/fitted-font-size";

/** A set table's number field: Input's field, sized and set for numbers. */
const SET_INPUT_CLASS = "min-h-10 px-1 text-center text-mono-body";

/** `text-mono-body`'s size when the `--text-body` token can't be read. */
const FALLBACK_BODY_SIZE = 17;

/** `--text-body` in points, the size the field shrinks from. */
const useBodySize = () => {
  const size = Number(useCSSVariable("--text-body"));

  return Number.isFinite(size) && size > 0 ? size : FALLBACK_BODY_SIZE;
};

/**
 * What the field's own box takes from its width: `px-1` (4 pt) and the 1 pt
 * stroke, on each side.
 */
const FIELD_INSET = 10;

type SetNumberInputProps = Omit<
  InputProps,
  "className" | "maxFontSizeMultiplier" | "style"
> & {
  /** The text scale the table stops growing at. */
  maxFontSizeMultiplier: number;
};

/**
 * A set table's number field (reps, weight, rest). It shrinks its text to
 * fit its width, so the largest weight the field can hold (`MAX_WEIGHT` with
 * two decimals, plus one more typed digit) reads in full on the narrowest
 * iPhone at the default text size; a short number keeps the body size. It
 * stops shrinking at `MIN_FITTED_FONT_SIZE`, so at the largest text sizes an
 * extreme value can still run past the field. It takes no `className`: the
 * fit counts on its own padding (`FIELD_INSET`).
 */
const SetNumberInput = ({
  maxFontSizeMultiplier,
  onLayout,
  placeholder,
  value,
  ...props
}: SetNumberInputProps) => {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const bodySize = useBodySize();

  const layout = useCallback(
    (event: LayoutChangeEvent) => {
      setWidth(event.nativeEvent.layout.width);
      onLayout?.(event);
    },
    [onLayout]
  );

  const fontSize = fittedFontSize({
    fontScale: Math.min(fontScale, maxFontSizeMultiplier),
    fontSize: bodySize,
    // A placeholder has no caret to leave room for.
    hasCaret: Boolean(value),
    text: value || placeholder || "",
    width: Math.max(0, width - FIELD_INSET),
  });

  return (
    <Input
      className={SET_INPUT_CLASS}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      onLayout={layout}
      placeholder={placeholder}
      style={fontSize < bodySize ? { fontSize } : undefined}
      value={value}
      {...props}
    />
  );
};

export { SetNumberInput };
