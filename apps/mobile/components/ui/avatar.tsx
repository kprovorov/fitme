import * as AvatarPrimitive from "@rn-primitives/avatar";
import type * as React from "react";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const Avatar = ({
  className,
  ref,
  ...props
}: AvatarPrimitive.RootProps & {
  ref?: React.RefObject<AvatarPrimitive.RootRef | null>;
}) => (
  <AvatarPrimitive.Root
    className={cn(
      "relative flex size-12 shrink-0 overflow-hidden rounded-full",
      className
    )}
    ref={ref}
    {...props}
  />
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = ({
  className,
  ref,
  ...props
}: AvatarPrimitive.ImageProps & {
  ref?: React.RefObject<AvatarPrimitive.ImageRef | null>;
}) => (
  <AvatarPrimitive.Image
    className={cn("aspect-square size-full", className)}
    ref={ref}
    {...props}
  />
);
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

/**
 * Shown until the image loads, or instead of it: a `muted` circle whose `Text`
 * is Headline in `muted-foreground` (an initial, usually).
 */
const AvatarFallback = ({
  className,
  ref,
  ...props
}: AvatarPrimitive.FallbackProps & {
  ref?: React.RefObject<AvatarPrimitive.FallbackRef | null>;
}) => (
  <TextClassContext.Provider value="text-headline text-muted-foreground">
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted",
        className
      )}
      ref={ref}
      {...props}
    />
  </TextClassContext.Provider>
);
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarFallback, AvatarImage };
