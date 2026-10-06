import type * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "~/lib/utils";

const Input = ({
  className,
  placeholderTextColorClassName,
  ref,
  ...props
}: TextInputProps & {
  ref?: React.RefObject<React.ElementRef<typeof TextInput> | null>;
}) => (
  <TextInput
    className={cn(
      "web:flex h-12 native:h-12 web:w-full rounded-md bg-black/30 px-3 web:py-2 font-nunito-sans-bold text-foreground text-subhead native:leading-[1.25] web:ring-offset-background file:border-0 file:bg-transparent file:font-medium placeholder:text-muted-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
      props.editable === false && "web:cursor-not-allowed opacity-50",
      className
    )}
    placeholderTextColorClassName={cn(
      "accent-muted-foreground",
      placeholderTextColorClassName
    )}
    ref={ref}
    {...props}
  />
);

Input.displayName = "Input";

export { Input };
