import type { ReactElement } from "react";

import { ContextMenu } from "~/components/ui/context-menu";
import type { PlanMenuAction } from "~/hooks/plan-actions";

/**
 * A Plan card or row inside the long-press menu offering its actions, with
 * no icons (Figma's Row Menu and Active Card Menu). It spans its parent's
 * width, so a full-width row stays full width.
 */
export const PlanActionsMenu = ({
  actions,
  children,
  testID,
}: {
  actions: PlanMenuAction[];
  children: ReactElement;
  testID?: string;
}) => (
  <ContextMenu
    className="self-stretch"
    items={actions.map(({ destructive, disabled, label, onPress }) => ({
      destructive,
      disabled,
      label,
      onPress,
    }))}
    testID={testID}
  >
    {children}
  </ContextMenu>
);
