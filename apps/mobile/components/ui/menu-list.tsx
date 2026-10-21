import type { ViewRef } from "@rn-primitives/types";
import type React from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { SquareArrowOutUpRight } from "~/lib/icons/SquareArrowOutUpRight";
import { cn } from "~/lib/utils";

/**
 * A grouped list: rows that run edge to edge on a `card` surface, divided by
 * `Separator`s. It isn't a `Card`, whose padding would inset the rows and
 * their pressed highlight; its fill and radius are Card's.
 */
const MenuList = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn(
      "overflow-hidden rounded-card border-continuous bg-card",
      className
    )}
    ref={ref}
    {...props}
  />
);

MenuList.displayName = "MenuList";

type MenuListItemProps = React.ComponentPropsWithoutRef<typeof Pressable>;

const MenuListItem = ({
  className,
  children,
  icon,
  ref,
  ...props
}: (Omit<MenuListItemProps, "children"> & {
  // Rendered next to the icon, so render-function children are not supported.
  children?: React.ReactNode;
  icon?: "chevron-right" | "square-arrow-out-up-right";
}) & { ref?: React.RefObject<React.ElementRef<typeof Pressable> | null> }) => {
  const Icon =
    icon === "chevron-right"
      ? ChevronRight
      : icon === "square-arrow-out-up-right"
        ? SquareArrowOutUpRight
        : null;

  return (
    <TextClassContext.Provider value="web:pointer-events-none">
      <Pressable
        className={cn(
          "flex-1 flex-row items-center justify-between gap-2 p-4 active:bg-accent",
          props.disabled && "web:pointer-events-none opacity-50",
          className
        )}
        ref={ref}
        role="button"
        {...props}
      >
        {children}
        {Icon ? (
          <Icon className="shrink-0 text-muted-foreground" size={20} />
        ) : null}
      </Pressable>
    </TextClassContext.Provider>
  );
};
MenuListItem.displayName = "MenuListItem";

export { MenuList, MenuListItem };
