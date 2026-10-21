import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Long-form copy (blog posts, legal pages): the typography plugin with its
// colors from the tokens (`prose-fitme` in app/globals.css) and its headings
// on the shared type scale.
const proseClassName =
  "prose prose-base prose-fitme prose-h1:font-bold prose-h1:text-display-1 prose-h1:text-primary prose-h2:text-title-1 prose-h3:text-title-3 prose-h4:text-headline prose-lead:text-title-3";

function Prose({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(proseClassName, className)} {...props} />;
}

function ProseArticle({ className, ...props }: ComponentProps<"article">) {
  return <article className={cn(proseClassName, className)} {...props} />;
}

export { Prose, ProseArticle };
