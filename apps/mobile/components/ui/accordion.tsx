import type {
  ContentProps,
  ContentRef,
  ItemProps,
  ItemRef,
  RootProps,
  RootRef,
  TriggerProps,
  TriggerRef,
} from "@rn-primitives/accordion";
import {
  Content,
  Header,
  Item,
  Root,
  Trigger as PrimitiveTrigger,
  useItemContext,
} from "@rn-primitives/accordion";
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

import { SymbolImage } from "~/components/symbol-image";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * Collapsible rows divided by `border`: a Body Emphasized trigger with an SF
 * Symbol chevron that turns as the row opens, and Body content in
 * `muted-foreground`.
 */
const Accordion = ({
  children,
  ref,
  ...props
}: RootProps & {
  ref?: React.RefObject<RootRef | null>;
}) => (
  <LayoutAnimationConfig skipEntering>
    <Root ref={ref} {...props} asChild={Platform.OS !== "web"}>
      <Animated.View layout={LinearTransition.duration(200)}>
        {children}
      </Animated.View>
    </Root>
  </LayoutAnimationConfig>
);

Accordion.displayName = Root.displayName;

const AccordionItem = ({
  className,
  value,
  ref,
  ...props
}: ItemProps & {
  ref?: React.RefObject<ItemRef | null>;
}) => (
  <Animated.View
    className="overflow-hidden"
    layout={LinearTransition.duration(200)}
  >
    <Item
      className={cn("border-border border-b", className)}
      ref={ref}
      value={value}
      {...props}
    />
  </Animated.View>
);

AccordionItem.displayName = Item.displayName;

const Trigger = Platform.OS === "web" ? View : Pressable;

const AccordionTrigger = ({
  className,
  children,
  ref,
  ...props
}: Omit<TriggerProps, "children"> & {
  // Rendered next to the chevron, so render-function children are not supported.
  children?: React.ReactNode;
  ref?: React.RefObject<TriggerRef | null>;
}) => {
  const { isExpanded } = useItemContext();

  const progress = useDerivedValue(() =>
    isExpanded
      ? withTiming(1, { duration: 250 })
      : withTiming(0, { duration: 200 })
  );

  const chevronStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [1, 0.8], Extrapolation.CLAMP),
    transform: [{ rotate: `${progress.get() * 180}deg` }],
  }));

  return (
    <TextClassContext.Provider value="text-body-emphasized text-foreground">
      <Header className="flex">
        <PrimitiveTrigger ref={ref} {...props} asChild>
          <Trigger
            className={cn(
              "flex-row items-center justify-between gap-2 py-3",
              className
            )}
          >
            {children}
            <Animated.View style={chevronStyle}>
              <SymbolImage
                className="text-muted-foreground shrink-0"
                name="chevron.down"
                size={16}
              />
            </Animated.View>
          </Trigger>
        </PrimitiveTrigger>
      </Header>
    </TextClassContext.Provider>
  );
};

AccordionTrigger.displayName = PrimitiveTrigger.displayName;

const InnerContent = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  if (Platform.OS === "web") {
    return <View className={cn("pb-3", className)}>{children}</View>;
  }

  return (
    <Animated.View
      className={cn("pb-3", className)}
      entering={FadeIn}
      exiting={FadeOutUp.duration(200)}
    >
      {children}
    </Animated.View>
  );
};

const AccordionContent = ({
  className,
  children,
  ref,
  ...props
}: ContentProps & {
  ref?: React.RefObject<ContentRef | null>;
}) => (
  <TextClassContext.Provider value="text-body text-muted-foreground">
    <Content className="overflow-hidden" ref={ref} {...props}>
      <InnerContent className={className}>{children}</InnerContent>
    </Content>
  </TextClassContext.Provider>
);

AccordionContent.displayName = Content.displayName;

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
