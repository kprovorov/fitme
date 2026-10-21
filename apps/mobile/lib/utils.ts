import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doesn't know about our custom HIG-named font-size scale
// (defined in @fitme/design-tokens) and misclassifies it as text-color, which
// collides with and strips text-foreground/text-primary/etc. Registering
// the scale as the `text` theme keeps both utilities. The spacing and `card`
// radius tokens are registered too, so a later `p-sm` or `rounded-card`
// replaces an earlier `p-0` or `rounded-none` instead of keeping both.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card"],
      spacing: ["xs", "sm", "md", "lg"],
      text: [
        "caption-2",
        "caption-1",
        "footnote",
        "subhead",
        "callout",
        "body",
        "headline",
        "title-3",
        "title-2",
        "title-1",
        "large-title",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
