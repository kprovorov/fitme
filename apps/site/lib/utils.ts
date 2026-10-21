import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const HIG_STYLES = [
  "large-title",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "callout",
  "subhead",
  "footnote",
  "caption-1",
  "caption-2",
];

const MONO_STYLES = ["title-2", "body", "subhead", "footnote", "caption-1"];

/** The text style utilities from `@fitme/design-tokens`, minus `text-`. */
const TEXT_STYLES = [
  ...HIG_STYLES.flatMap((style) => [style, `${style}-emphasized`]),
  ...MONO_STYLES.flatMap((style) => [
    `mono-${style}`,
    `mono-${style}-semibold`,
  ]),
];

// tailwind-merge doesn't know the text styles (`text-body`,
// `text-body-emphasized`, from @fitme/design-tokens) or the site's display
// sizes (app/globals.css) and would take them for text colors, stripping
// `text-foreground` and friends. A text style sets the font, weight, size and
// line height, so it gets its own group: a later style replaces an earlier one
// and any font, weight, size, leading or tracking class before it, and a later
// size replaces it. The display sizes are plain font sizes.
const twMerge = extendTailwindMerge<"text-style">({
  extend: {
    classGroups: {
      "text-style": [{ text: TEXT_STYLES }],
    },
    conflictingClassGroups: {
      "font-size": ["text-style"],
      "text-style": [
        "font-family",
        "font-size",
        "font-weight",
        "leading",
        "tracking",
      ],
    },
    theme: {
      text: ["display-2", "display-1"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
