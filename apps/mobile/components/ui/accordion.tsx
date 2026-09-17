import * as AccordionPrimitive from "@rn-primitives/accordion";
import type * as React from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOutUp,
  interpolate,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { TextClassContext } from "~/components/ui/text";
import { ChevronDown } from "~/lib/icons/ChevronDown";
import { cn } from "~/lib/utils";

const Accordion = ({
  children,
  ref,
  ...props
}: AccordionPrimitive.RootProps & {
  ref?: React.RefObject<AccordionPrimitive.RootRef | null>;
}) => (
  <LayoutAnimationConfig skipEntering>
    <AccordionPrimitive.Root
      ref={ref}
      {...props}
      asChild={Platform.OS !== "web"}
    >
      <Animated.View layout={LinearTransition.duration(200)}>
        {children}
      </Animated.View>
    </AccordionPrimitive.Root>
  </LayoutAnimationConfig>
);

Accordion.displayName = AccordionPrimitive.Root.displayName;

const AccordionItem = ({
  className,
  value,
  ref,
  ...props
}: AccordionPrimitive.ItemProps & {
  ref?: React.RefObject<AccordionPrimitive.ItemRef | null>;
}) => (
  <Animated.View
    className={"overflow-hidden"}
    layout={LinearTransition.duration(200)}
  >
    <AccordionPrimitive.Item
      className={cn("border-border border-b", className)}
      ref={ref}
      value={value}
      {...props}
    />
  </Animated.View>
);
AccordionItem.displayName = AccordionPrimitive.Item.displayName;

const Trigger = Platform.OS === "web" ? View : Pressable;

const AccordionTrigger = ({
  className,
  children,
  ref,
  ...props
}: AccordionPrimitive.TriggerProps & {
  ref?: React.RefObject<AccordionPrimitive.TriggerRef | null>;
}) => {
  const { isExpanded } = AccordionPrimitive.useItemContext();

  const progress = useDerivedValue(() =>
    isExpanded
      ? withTiming(1, { duration: 250 })
      : withTiming(0, { duration: 200 })
  );
  const chevronStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.8], Extrapolation.CLAMP),
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <TextClassContext.Provider value="native:text-title-3 font-medium web:group-hover:underline">
      <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger ref={ref} {...props} asChild>
          <Trigger
            className={cn(
              "group flex web:flex-1 flex-row items-center justify-between py-4 web:transition-all web:focus-visible:outline-none web:focus-visible:ring-1 web:focus-visible:ring-muted-foreground",
              className
            )}
          >
            {children}
            <Animated.View style={chevronStyle}>
              <ChevronDown className={"shrink-0 text-foreground"} size={18} />
            </Animated.View>
          </Trigger>
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
    </TextClassContext.Provider>
  );
};
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = ({
  className,
  children,
  ref,
  ...props
}: AccordionPrimitive.ContentProps & {
  ref?: React.RefObject<AccordionPrimitive.ContentRef | null>;
}) => {
  const { isExpanded } = AccordionPrimitive.useItemContext();
  return (
    <TextClassContext.Provider value="native:text-title-3">
      <AccordionPrimitive.Content
        className={cn(
          "overflow-hidden text-subhead web:transition-all",
          isExpanded ? "web:animate-accordion-down" : "web:animate-accordion-up"
        )}
        ref={ref}
        {...props}
      >
        <InnerContent className={cn("pb-4", className)}>
          {children}
        </InnerContent>
      </AccordionPrimitive.Content>
    </TextClassContext.Provider>
  );
};

function InnerContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (Platform.OS === "web") {
    return <View className={cn("pb-4", className)}>{children}</View>;
  }
  return (
    <Animated.View
      className={cn("pb-4", className)}
      entering={FadeIn}
      exiting={FadeOutUp.duration(200)}
    >
      {children}
    </Animated.View>
  );
}

AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
