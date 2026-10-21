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
export const TEXT_STYLES = [
  ...HIG_STYLES.flatMap((style) => [style, `${style}-emphasized`]),
  ...MONO_STYLES.flatMap((style) => [
    `mono-${style}`,
    `mono-${style}-semibold`,
  ]),
];

// tailwind-merge doesn't know the text styles (`text-body`,
// `text-body-emphasized`, `text-mono-footnote`) and would take them for text
// colors, stripping `text-foreground` and friends. Each one sets the font,
// weight, size and line height, so it gets its own group: a later style
// replaces an earlier one and any font, weight, size, leading or tracking
// class before it, and a later stock size replaces it. The spacing and
// `card` radius tokens are registered too, so a later `p-sm` or
// `rounded-card` replaces an earlier `p-0` or `rounded-none` instead of
// keeping both. uniwind's `border-continuous` / `border-circular` (smooth or
// circular iOS corners) aren't border colors, so they get their own group
// too: otherwise `border-border border-continuous` keeps only the last one
// and the border turns black.
const twMerge = extendTailwindMerge<"text-style" | "border-curve">({
  extend: {
    classGroups: {
      "border-curve": [{ border: ["continuous", "circular"] }],
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
      radius: ["card"],
      spacing: ["xs", "sm", "md", "lg"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
