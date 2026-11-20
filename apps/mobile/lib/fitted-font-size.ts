/**
 * How wide a character of the mono font is, in em: IBM Plex Mono's advance
 * is 600 units of its 1000, the same for every character, so a number's
 * width follows from its length alone.
 */
export const MONO_ADVANCE = 0.6;

/** Below this a number stops being readable at a glance (caption 2's size). */
export const MIN_FITTED_FONT_SIZE = 11;

/** Room kept beside the text for the caret, in characters. */
const CARET_ROOM = 1;

/**
 * The font size a single-line mono `text` fits `width` at, never above
 * `fontSize`, with a character's room for the caret unless `hasCaret` is
 * false (a placeholder). `fontScale` is the text scale the field is drawn at
 * (the system's, capped by the field's `maxFontSizeMultiplier`), which
 * multiplies whatever size is set. Before the field has a width, or with
 * nothing in it, it keeps `fontSize`. It never goes below
 * `MIN_FITTED_FONT_SIZE`, even when the text doesn't fit there: past that a
 * number is too small to read, so it runs past the field instead.
 */
export const fittedFontSize = ({
  fontScale = 1,
  fontSize,
  hasCaret = true,
  text,
  width,
}: {
  fontScale?: number;
  fontSize: number;
  hasCaret?: boolean;
  text: string;
  width: number;
}) => {
  if (width <= 0 || text.length === 0) {
    return fontSize;
  }

  const fitting =
    width /
    ((text.length + (hasCaret ? CARET_ROOM : 0)) * MONO_ADVANCE * fontScale);

  // Rounded down to a quarter point, so the text never overruns by a hair.
  const rounded = Math.floor(fitting * 4) / 4;

  return Math.max(MIN_FITTED_FONT_SIZE, Math.min(fontSize, rounded));
};
