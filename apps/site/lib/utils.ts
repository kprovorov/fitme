import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doesn't know about the HIG-named font-size scale (from
// @fitme/design-tokens) or the site's display sizes (app/globals.css) and
// misclassifies them as text-color, which collides with and strips
// text-foreground/text-primary/etc. Registering them as the `text` theme
// keeps both utilities.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
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
        "display-2",
        "display-1",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
