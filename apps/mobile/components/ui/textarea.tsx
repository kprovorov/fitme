import type * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "~/lib/utils";

const Textarea = ({
  className,
  multiline = true,
  numberOfLines = 4,
  placeholderClassName,
  ref,
  ...props
}: TextInputProps & {
  ref?: React.RefObject<React.ElementRef<typeof TextInput> | null>;
}) => (
  <TextInput
    className={cn(
      "web:flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 native:text-title-3 text-body text-foreground native:leading-[1.25] web:ring-offset-background placeholder:text-muted-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 lg:text-subhead",
      props.editable === false && "web:cursor-not-allowed opacity-50",
      className
    )}
    multiline={multiline}
    numberOfLines={numberOfLines}
    placeholderClassName={cn("text-muted-foreground", placeholderClassName)}
    ref={ref}
    textAlignVertical="top"
    {...props}
  />
);

Textarea.displayName = "Textarea";

export { Textarea };
