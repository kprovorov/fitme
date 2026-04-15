import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import * as React from "react";
import { View } from "react-native";
import { Text } from "~/components/ui/text";
import { Check } from "~/lib/icons/Check";
import { cn } from "~/lib/utils";
import { VStack } from "./vstack";

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
      className={cn(
        "aspect-square h-4 native:h-5 native:w-5 w-4 items-center justify-center rounded-full border-2 border-primary text-primary web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
        props.disabled && "web:cursor-not-allowed border-muted",
        className
      )}
      ref={ref}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <View className="aspect-square h-[9px] native:h-[10] native:w-[10] w-[9px] rounded-full bg-primary" />
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
      className={cn(
        "flex-1 flex-row items-center justify-start gap-2 rounded-lg border-2 bg-card p-4",
        props.disabled && "web:cursor-not-allowed border-muted",
        className
      )}
      ref={ref}
      {...props}
    >
      <View
        className={cn(
          "aspect-square h-4 native:h-5 native:w-5 w-4 items-center justify-center rounded-full border-2 border-primary text-primary web:ring-offset-background web:focus:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2",
          props.disabled && "web:cursor-not-allowed border-muted"
        )}
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <View className="aspect-square h-[9px] native:h-[10] native:w-[10] w-[9px] rounded-full bg-primary" />
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
      className={cn(
        "flex-1 flex-row items-center justify-between p-4 active:bg-card/50",
        props.disabled && "web:cursor-not-allowed border-muted",
        className
      )}
      ref={ref}
      {...props}
    >
      <VStack className="flex-1 items-start gap-0">
        <Text>{props.label}</Text>
        {props.disclaimer && (
          <Text className="text-muted-foreground text-xs">
            {props.disclaimer}
          </Text>
        )}
      </VStack>
      <View
        className={cn(
          "aspect-square h-4 native:h-5 native:w-5 w-4 items-center justify-center text-primary",
          props.disabled && "web:cursor-not-allowed border-muted"
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
