import * as Slot from "@rn-primitives/slot";
import type { SlottableTextProps, TextRef } from "@rn-primitives/types";
import * as React from "react";
import { Text as RNText } from "react-native";
import { cn } from "~/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

const ErrorMessage = React.forwardRef<TextRef, SlottableTextProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const textClass = React.useContext(TextClassContext);
    const Component = asChild ? Slot.Text : RNText;
    return (
      <Component
        className={cn(
          "text-sm text-destructive font-nunito-sans-regular web:select-text",
          textClass,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage, TextClassContext };
