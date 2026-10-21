import { Field, type InputProps } from "~/components/ui/input";
import { cn } from "~/lib/utils";

/**
 * A multi-line text field, at least 80 pt tall: Input's field, states and
 * `error`, with the text starting at the top.
 */
const Textarea = ({
  className,
  multiline = true,
  numberOfLines = 4,
  ...props
}: InputProps) => (
  <Field
    className={cn("min-h-20 py-xs", className)}
    multiline={multiline}
    numberOfLines={numberOfLines}
    textAlignVertical="top"
    {...props}
  />
);

Textarea.displayName = "Textarea";

export { Textarea };
