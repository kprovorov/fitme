import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Long-form copy (blog posts, legal pages): the typography plugin with its
// colors from the tokens (`prose-fitme` in app/globals.css) and its text on
// the shared type scale. The plugin still sets the measure and the spacing
// between blocks.
const proseClassName =
  "prose prose-base prose-fitme wrap-anywhere prose-h1:font-bold prose-h1:text-display-1 prose-h1:text-primary prose-h2:text-title-1-emphasized prose-h3:text-title-3-emphasized prose-h4:text-headline prose-lead:text-title-2 prose-li:text-body prose-p:text-body";

function Prose({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(proseClassName, className)} {...props} />;
}

function ProseArticle({ className, ...props }: ComponentProps<"article">) {
  return <article className={cn(proseClassName, className)} {...props} />;
}

export { Prose, ProseArticle };
