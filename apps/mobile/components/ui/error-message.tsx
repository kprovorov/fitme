import * as Slot from "@rn-primitives/slot";
import type { SlottableTextProps, TextRef } from "@rn-primitives/types";
import * as React from "react";
import { Text as RNText } from "react-native";
import { cn } from "~/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

const ErrorMessage = ({
  className,
  asChild = false,
  ref,
  ...props
}: SlottableTextProps & { ref?: React.RefObject<TextRef | null> }) => {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(
        "web:select-text font-nunito-sans-regular text-destructive text-subhead",
        textClass,
        className
      )}
      ref={ref}
      {...props}
    />
  );
};
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage, TextClassContext };
