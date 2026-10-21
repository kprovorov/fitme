import type * as React from "react";
import { useCallback, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { ErrorMessage } from "~/components/ui/error-message";
import { cn } from "~/lib/utils";

type FieldState = "default" | "focused" | "error";

type FieldProps = TextInputProps & {
  /**
   * Lays out the field and its error message together (`flex-1` in a row).
   * `className` goes on the field itself.
   */
  containerClassName?: string;
  /**
   * A message shows under the field in `destructive` and is read after the
   * field's label. `true` only marks the field, for a form that shows the
   * message somewhere else (a set row's errors go under the whole row).
   */
  error?: string | boolean;
  ref?: React.RefObject<React.ElementRef<typeof TextInput> | null>;
};

type FocusEvent = Parameters<NonNullable<TextInputProps["onFocus"]>>[0];
type BlurEvent = Parameters<NonNullable<TextInputProps["onBlur"]>>[0];

const fieldStateClasses: Record<FieldState, string> = {
  default: "border-input",
  error: "border-destructive",
  focused: "border-ring",
};

/**
 * The field Input and Textarea share: an `input` stroke on whatever surface
 * it sits on (`background` or `card`), `ring` while focused and `destructive`
 * with an error, which wins over focus. A field that isn't `editable` is
 * dimmed. The caret and selection are `primary`, not the system blue.
 */
const Field = ({
  accessibilityHint,
  className,
  containerClassName,
  error,
  onBlur,
  onFocus,
  placeholderTextColorClassName,
  ref,
  selectionColorClassName,
  ...props
}: FieldProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const message = typeof error === "string" && error ? error : undefined;
  let state: FieldState = "default";
  if (error) {
    state = "error";
  } else if (isFocused) {
    state = "focused";
  }
  const disabled = props.editable === false || props.readOnly === true;

  const handleFocus = useCallback(
    (event: FocusEvent) => {
      setIsFocused(true);
      onFocus?.(event);
    },
    [onFocus]
  );
  const handleBlur = useCallback(
    (event: BlurEvent) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur]
  );

  return (
    <View className={cn("gap-xs", containerClassName)}>
      <TextInput
        accessibilityHint={
          [message, accessibilityHint].filter(Boolean).join(". ") || undefined
        }
        className={cn(
          "rounded-lg border border-continuous bg-transparent px-sm text-body text-foreground",
          fieldStateClasses[state],
          disabled && "opacity-50",
          className
        )}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholderTextColorClassName={cn(
          "accent-muted-foreground",
          placeholderTextColorClassName
        )}
        ref={ref}
        selectionColorClassName={cn("accent-primary", selectionColorClassName)}
        {...props}
      />
      {message ? <ErrorMessage>{message}</ErrorMessage> : null}
    </View>
  );
};

/**
 * A single-line text field, at least 48 pt tall (it grows with large text),
 * with an optional `error`.
 */
const Input = ({ className, ...props }: FieldProps) => (
  <Field className={cn("min-h-12", className)} {...props} />
);
Input.displayName = "Input";

export type { FieldProps as InputProps };
export { Field, Input };
