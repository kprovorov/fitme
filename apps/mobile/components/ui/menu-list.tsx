import type React from "react";
import { Pressable } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { SquareArrowOutUpRight } from "~/lib/icons/SquareArrowOutUpRight";
import { cn } from "~/lib/utils";
import { Card } from "./card";

const MenuList = ({
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof Card> & {
  ref?: React.RefObject<React.ComponentRef<typeof Card> | null>;
}) => (
  <Card
    className={cn("flex-col overflow-hidden", props.className)}
    ref={ref}
    {...props}
  >
    {children}
  </Card>
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
    <TextClassContext.Provider value="web:pointer-events-none font-nunito-sans-regular">
      <Pressable
        className={cn(
          "flex-1 flex-row items-center justify-between gap-2 p-4 active:bg-card/50",
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
