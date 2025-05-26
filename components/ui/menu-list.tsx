import React from "react";
import { Card } from "./card";
import { Pressable, View } from "react-native";
import { cn } from "~/lib/utils";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { HStack } from "~/components/ui/hstack";
import { TextClassContext, Text } from "~/components/ui/text";
import { SquareArrowOutUpRight } from "~/lib/icons/SquareArrowOutUpRight";
import { Heart } from "~/lib/icons/Heart";

const MenuList = React.forwardRef<
  React.ElementRef<typeof Card>,
  React.ComponentPropsWithoutRef<typeof Card>
>(({ children, ...props }, ref) => {
  return (
    <Card
      ref={ref}
      className={cn("flex-col bg-card/30 overflow-hidden", props.className)}
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
          "flex-1 flex-row items-center justify-between p-4 active:bg-card/50 gap-2",
          props.disabled && "opacity-50 web:pointer-events-none",
          className,
        )}
        ref={ref}
        role="button"
        {...props}
      >
        {children}
        {Icon && <Icon className="text-muted-foreground shrink-0" size={20} />}
      </Pressable>
    </TextClassContext.Provider>
  );
});
MenuListItem.displayName = "MenuListItem";

export { MenuList, MenuListItem };
