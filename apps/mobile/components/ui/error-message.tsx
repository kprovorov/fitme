import * as Slot from "@rn-primitives/slot";
import type { SlottableTextProps, TextRef } from "@rn-primitives/types";
import * as React from "react";
import { Text as RNText } from "react-native";
import { cn } from "~/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

/**
 * What went wrong with a field or a form, in `destructive` Subhead. It has
 * the alert role (and is a polite live region on Android); Input also reads
 * its message as the field's hint, so VoiceOver says it on the field itself.
 */
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
      accessibilityLiveRegion="polite"
      className={cn("text-destructive text-subhead", textClass, className)}
      ref={ref}
      role="alert"
      {...props}
    />
  );
};
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage, TextClassContext };
