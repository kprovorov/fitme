import type {
  FallbackProps,
  FallbackRef,
  ImageProps,
  ImageRef,
  RootProps,
  RootRef,
} from "@rn-primitives/avatar";
import { Fallback, Image, Root } from "@rn-primitives/avatar";
import type * as React from "react";

import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const Avatar = ({
  className,
  ref,
  ...props
}: RootProps & {
  ref?: React.RefObject<RootRef | null>;
}) => (
  <Root
    className={cn(
      "relative flex size-12 shrink-0 overflow-hidden rounded-full",
      className
    )}
    ref={ref}
    {...props}
  />
);

Avatar.displayName = Root.displayName;

const AvatarImage = ({
  className,
  ref,
  ...props
}: ImageProps & {
  ref?: React.RefObject<ImageRef | null>;
}) => (
  <Image
    className={cn("aspect-square size-full", className)}
    ref={ref}
    {...props}
  />
);

AvatarImage.displayName = Image.displayName;

/**
 * Shown until the image loads, or instead of it: a `muted` circle whose `Text`
 * is Headline in `muted-foreground` (an initial, usually).
 */
const AvatarFallback = ({
  className,
  ref,
  ...props
}: FallbackProps & {
  ref?: React.RefObject<FallbackRef | null>;
}) => (
  <TextClassContext.Provider value="text-headline text-muted-foreground">
    <Fallback
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      ref={ref}
      {...props}
    />
  </TextClassContext.Provider>
);

AvatarFallback.displayName = Fallback.displayName;

export { Avatar, AvatarFallback, AvatarImage };
