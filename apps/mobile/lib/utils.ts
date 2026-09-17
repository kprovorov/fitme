import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doesn't know about our custom HIG-named font-size scale
// (defined in global.css) and misclassifies it as text-color, which
// collides with and strips text-foreground/text-primary/etc. Registering
// the scale here keeps both utilities.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
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
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
