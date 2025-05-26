import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import * as React from "react";
import { View } from "react-native";
import { cn } from "~/lib/utils";
import { Text } from "~/components/ui/text";
import { VStack } from "./vstack";
import { Check } from "~/lib/icons/Check";

const RadioGroup = React.forwardRef<
  RadioGroupPrimitive.RootRef,
  RadioGroupPrimitive.RootProps
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("web:grid gap-2", className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  RadioGroupPrimitive.ItemRef,
  RadioGroupPrimitive.ItemProps
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 native:h-5 native:w-5 rounded-full justify-center items-center border-2 border-primary text-primary web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
        props.disabled && "web:cursor-not-allowed border-muted",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <View className="aspect-square h-[9px] w-[9px] native:h-[10] native:w-[10] bg-primary rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

const RadioGroupItemWithLabel = React.forwardRef<
  RadioGroupPrimitive.ItemRef,
  RadioGroupPrimitive.ItemProps & { label: string }
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "flex-row gap-2 bg-card rounded-lg p-4 flex-1 justify-start items-center border-2",
        props.disabled && "web:cursor-not-allowed border-muted",
        className,
      )}
      {...props}
    >
      <View
        className={cn(
          "aspect-square h-4 w-4 native:h-5 native:w-5 rounded-full justify-center items-center border-2 border-primary text-primary web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
          props.disabled && "web:cursor-not-allowed border-muted",
        )}
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <View className="aspect-square h-[9px] w-[9px] native:h-[10] native:w-[10] bg-primary rounded-full" />
        </RadioGroupPrimitive.Indicator>
      </View>
      <Text>{props.label}</Text>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItemWithLabel.displayName = "RadioGroupItemWithLabel";

const RadioGroupMenuListItem = React.forwardRef<
  RadioGroupPrimitive.ItemRef,
  RadioGroupPrimitive.ItemProps & { label: string; disclaimer?: string }
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "flex-1 flex-row items-center justify-between p-4 active:bg-card/50",
        props.disabled && "web:cursor-not-allowed border-muted",
        className,
      )}
      {...props}
    >
      <VStack className="flex-1 items-start gap-0">
        <Text>{props.label}</Text>
        {props.disclaimer && (
          <Text className="text-xs text-muted-foreground">
            {props.disclaimer}
          </Text>
        )}
      </VStack>
      <View
        className={cn(
          "aspect-square h-4 w-4 native:h-5 native:w-5 justify-center items-center text-primary",
          props.disabled && "web:cursor-not-allowed border-muted",
        )}
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <Check className="text-primary" size={18} />
        </RadioGroupPrimitive.Indicator>
      </View>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupMenuListItem.displayName = "RadioGroupMenuListItem";

export {
  RadioGroup,
  RadioGroupItem,
  RadioGroupItemWithLabel,
  RadioGroupMenuListItem,
};
