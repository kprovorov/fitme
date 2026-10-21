import type { ViewRef } from "@rn-primitives/types";
import type React from "react";
import { Pressable, View, type ViewProps } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "~/components/symbol-image";
import { TextClassContext } from "~/components/ui/text";
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

type MenuListItemIcon = "chevron-right" | "square-arrow-out-up-right";

/** The trailing SF Symbol: a disclosure chevron, or a link out of the app. */
const ICON_SYMBOLS: Record<MenuListItemIcon, SFSymbol> = {
  "chevron-right": "chevron.right",
  "square-arrow-out-up-right": "arrow.up.right.square",
};

const MenuListItem = ({
  className,
  children,
  icon,
  ref,
  ...props
}: (Omit<MenuListItemProps, "children"> & {
  // Rendered next to the icon, so render-function children are not supported.
  children?: React.ReactNode;
  icon?: MenuListItemIcon;
}) & { ref?: React.RefObject<React.ElementRef<typeof Pressable> | null> }) => (
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
      {icon ? (
        <SymbolImage
          className="shrink-0 text-body text-muted-foreground"
          name={ICON_SYMBOLS[icon]}
        />
      ) : null}
    </Pressable>
  </TextClassContext.Provider>
);
MenuListItem.displayName = "MenuListItem";

export { MenuList, MenuListItem };
