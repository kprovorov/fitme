import React from "react";
import { Pressable } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { SquareArrowOutUpRight } from "~/lib/icons/SquareArrowOutUpRight";
import { cn } from "~/lib/utils";
import { Card } from "./card";

const MenuList = React.forwardRef<
  React.ElementRef<typeof Card>,
  React.ComponentPropsWithoutRef<typeof Card>
>(({ children, ...props }, ref) => {
  return (
    <Card
      className={cn("flex-col overflow-hidden bg-card/30", props.className)}
      ref={ref}
      {...props}
    >
      {children}
    </Card>
  );
});

MenuList.displayName = "MenuList";

type MenuListItemProps = React.ComponentPropsWithoutRef<typeof Pressable>;

const MenuListItem = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  MenuListItemProps & {
    icon?: "chevron-right" | "square-arrow-out-up-right";
  }
>(({ className, children, icon, ...props }, ref) => {
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
        {Icon && <Icon className="shrink-0 text-muted-foreground" size={20} />}
      </Pressable>
    </TextClassContext.Provider>
  );
});
MenuListItem.displayName = "MenuListItem";

export { MenuList, MenuListItem };
