import {
  Alert,
  RNHostView,
  Spacer,
  Button as SwiftUIButton,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import * as Slot from "@rn-primitives/slot";
import type * as React from "react";
import { useCallback, useState } from "react";
import { isStretchClassName, SwiftUIHost } from "~/components/ui/swift-ui";

type AlertDialogActionRole = "default" | "cancel" | "destructive";

interface AlertDialogAction {
  label: string;
  onPress?: () => void;
  role?: AlertDialogActionRole;
}

interface AlertDialogProps {
  actions: AlertDialogAction[];
  /**
   * A pressable React Native element (e.g. a `MenuListItem`) that opens the
   * dialog when pressed: its `onPress` is set, not wrapped in another
   * Pressable, which would never get the press. Leave empty for a dialog
   * driven entirely by `isPresented`.
   */
  children?: React.ReactElement;
  className?: string;
  /** Omit to let the dialog manage its own open state. */
  isPresented?: boolean;
  message?: string;
  onIsPresentedChange?: (isPresented: boolean) => void;
  title: string;
}

const AlertDialog = ({
  title,
  message,
  actions,
  isPresented,
  onIsPresentedChange,
  children,
  className,
}: AlertDialogProps) => {
  const [uncontrolledPresented, setUncontrolledPresented] = useState(false);

  const presented = isPresented ?? uncontrolledPresented;

  const setPresented = useCallback(
    (next: boolean) => {
      setUncontrolledPresented(next);
      onIsPresentedChange?.(next);
    },
    [onIsPresentedChange]
  );

  const present = useCallback(() => setPresented(true), [setPresented]);

  return (
    <SwiftUIHost
      className={className}
      matchContents={isStretchClassName(className) ? { vertical: true } : true}
    >
      <Alert
        isPresented={presented}
        onIsPresentedChange={setPresented}
        title={title}
      >
        <Alert.Trigger>
          {children ? (
            <RNHostView matchContents>
              <Slot.Pressable onPress={present}>{children}</Slot.Pressable>
            </RNHostView>
          ) : (
            <Spacer modifiers={[frame({ height: 0, width: 0 })]} />
          )}
        </Alert.Trigger>
        <Alert.Actions>
          {actions.map((action) => (
            <SwiftUIButton
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              role={action.role ?? "default"}
            />
          ))}
        </Alert.Actions>
        {message ? (
          <Alert.Message>
            <SwiftUIText>{message}</SwiftUIText>
          </Alert.Message>
        ) : null}
      </Alert>
    </SwiftUIHost>
  );
};

AlertDialog.displayName = "AlertDialog";

export type { AlertDialogAction, AlertDialogActionRole, AlertDialogProps };
export { AlertDialog };
