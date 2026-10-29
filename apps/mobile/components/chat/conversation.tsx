import type {
  TextMessagePart,
  ThreadMessage,
  ToolCallMessagePart,
} from "@assistant-ui/react-native";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "../touchable-glass";
import { KeyboardGestureArea } from "../tw";
import { useChatContext } from "./chat-context";
import { Message, MessageResponse } from "./message";
import { messageText } from "./message-text";
import { StreamingMessage } from "./streaming-message";
import { type WorkoutPlan, WorkoutPlanCard } from "./workout-plan-card";

const IS_GLASS = isLiquidGlassAvailable();

type AnimatableLegendListProps = React.ComponentProps<typeof LegendList> & {
  ref?: React.Ref<LegendListRef>;
};

/**
 * LegendList exposes a plain methods object through its ref, which Reanimated
 * (4.5+) cannot resolve to a host view. Expose `getAnimatableRef` so the
 * animated wrapper targets the underlying ScrollView instead.
 */
function AnimatableLegendList({ ref, ...props }: AnimatableLegendListProps) {
  const listRef = useRef<LegendListRef>(null);

  useImperativeHandle(ref, () => {
    const list = listRef.current as LegendListRef;
    return {
      ...list,
      getAnimatableRef: () => list.getNativeScrollRef(),
    };
  }, []);

  return <LegendList {...props} ref={listRef} />;
}

const AnimatedLegendList =
  Animated.createAnimatedComponent(AnimatableLegendList);

const messageKeyExtractor = (item: unknown) => (item as ThreadMessage).id;

// biome-ignore lint/suspicious/noExplicitAny: Reanimated animated styles are opaque worklet objects with no exported type
type AnimatedStyle = any;

interface ConversationContextValue {
  /** Prompt input reports its measured height through this callback. */
  onPromptInputLayout: (e: LayoutChangeEvent) => void;
  /** Animated style that positions the prompt input above the keyboard. */
  promptInputStyle: AnimatedStyle;
  /** Animated style for the scroll-to-bottom button. */
  scrollButtonStyle: AnimatedStyle;
  scrollToBottom: () => void;
}

const ConversationCtx = createContext<ConversationContextValue | null>(null);

export function useConversationContext() {
  const ctx = use(ConversationCtx);
  if (!ctx) {
    throw new Error(
      "useConversationContext must be used within <Conversation>"
    );
  }
  return ctx;
}

export function Conversation({
  children,
  emptyState,
}: {
  children?: ReactNode;
  /** Shown while there are no messages. */
  emptyState: ReactNode;
}) {
  const { messages, isGenerating, streamingStore } = useChatContext();
  const listRef = useRef<LegendListRef>(null);
  const insets = useSafeAreaInsets();

  // -- Keyboard tracking --------------------------------------------------

  const keyboardHeight = useSharedValue(0);
  // Separate value for contentInset that freezes during interactive dismiss
  // to prevent the scroll view from snapping when the user is overscrolled.
  const keyboardHeightForInset = useSharedValue(0);
  // Tracks whether the current keyboard transition originated from an
  // interactive dismiss gesture (vs a programmatic tap-to-open).
  const wasInteractive = useSharedValue(false);

  // -- Layout bookkeeping --------------------------------------------------

  const [composerOffsetHeight, setComposerOffsetHeight] = useState(68);
  const composerHeight = useSharedValue(68);
  const scrollViewHeight = useSharedValue(0);
  const totalContentHeight = useSharedValue(0);
  const currentFooterHeight = useSharedValue(0);
  const messagesOnlyHeight = useSharedValue(0);

  // -- Auto-scroll ---------------------------------------------------------

  const scrollY = useSharedValue(0);
  const lastContentHeight = useSharedValue(0);
  const SCROLL_THRESHOLD = 50;

  const bottomInset = useDerivedValue(() => {
    const keyboard = Math.abs(keyboardHeight.value);
    return composerHeight.value + Math.max(insets.bottom, keyboard);
  });

  const isAtBottom = useDerivedValue(() => {
    const maxScrollY =
      totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
    if (maxScrollY <= 0) {
      return true;
    }
    return maxScrollY - scrollY.value <= SCROLL_THRESHOLD;
  });

  const shouldShowScrollButton = useDerivedValue(() => {
    const maxScrollY =
      totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
    if (maxScrollY <= 50) {
      return false;
    }
    return !isAtBottom.value;
  });

  // -- Callbacks -----------------------------------------------------------

  const onScrollViewLayout = useCallback(
    (e: LayoutChangeEvent) => {
      scrollViewHeight.value = e.nativeEvent.layout.height;
    },
    [scrollViewHeight]
  );

  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY]
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const wasAtBottom = isAtBottom.value;
      const heightIncreased = height > lastContentHeight.value;

      totalContentHeight.value = height;
      lastContentHeight.value = height;
      // Derive message-only height by subtracting the last known footer height.
      // This is stable: when the footer resizes, totalContent changes but
      // messagesOnly stays the same, breaking the feedback loop.
      messagesOnlyHeight.value = height - currentFooterHeight.value;

      if (wasAtBottom && heightIncreased && listRef.current) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({
            animated: true,
            viewOffset: -bottomInset.value,
          });
        });
      }
    },
    [
      bottomInset,
      currentFooterHeight,
      isAtBottom,
      lastContentHeight, // Derive message-only height by subtracting the last known footer height.
      // This is stable: when the footer resizes, totalContent changes but
      // messagesOnly stays the same, breaking the feedback loop.
      messagesOnlyHeight,
      totalContentHeight,
    ]
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({
      animated: true,
      viewOffset: -bottomInset.value,
    });
  }, [bottomInset]);

  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        const shouldScroll = e.height > 0 && !wasInteractive.value;
        keyboardHeight.value = e.height;
        keyboardHeightForInset.value = withTiming(e.height, { duration: 250 });
        wasInteractive.value = false;
        if (shouldScroll) {
          runOnJS(scrollToBottom)();
        }
      },
      onInteractive: (e) => {
        "worklet";
        // Only update prompt input position, not contentInset.
        // Changing contentInset during an active gesture causes a jump
        // when the user has overscrolled past the bottom.
        keyboardHeight.value = e.height;
        wasInteractive.value = true;
      },
      onMove: (e) => {
        "worklet";
        keyboardHeight.value = e.height;
        keyboardHeightForInset.value = e.height;
      },
      onStart: (e) => {
        "worklet";
        // Track if keyboard is opening from a tap (not from interactive dismiss)
        if (e.height > 0 && !wasInteractive.value) {
          wasInteractive.value = false;
        }
      },
    },
    [scrollToBottom]
  );

  // -- Animated styles -----------------------------------------------------
  const topPadding = IS_GLASS ? 128 : 16;

  const footerSpacerStyle = useAnimatedStyle(() => {
    const scrollHeight = scrollViewHeight.value;
    if (scrollHeight <= 0) {
      return { height: 0 };
    }

    const keyboard = Math.abs(keyboardHeight.value);
    const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
    const blankSpace = scrollHeight - messagesOnlyHeight.value - bottom;
    const footerHeight = Math.max(0, blankSpace - topPadding);

    currentFooterHeight.value = footerHeight;
    return { height: footerHeight };
  });

  const promptInputStyle = useAnimatedStyle(() => ({
    bottom: Math.max(insets.bottom, Math.abs(keyboardHeight.value)),
  }));

  const scrollButtonStyle = useAnimatedStyle(() => ({
    bottom:
      composerHeight.value +
      Math.max(insets.bottom, Math.abs(keyboardHeight.value)) +
      12,
    opacity: withTiming(shouldShowScrollButton.value ? 1 : 0, {
      duration: 200,
    }),
    transform: [
      {
        scale: withTiming(shouldShowScrollButton.value ? 1 : 0.8, {
          duration: 200,
        }),
      },
    ],
  }));

  const listAnimatedProps = useAnimatedProps(() => {
    const keyboard = Math.abs(keyboardHeightForInset.value);
    const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
    return {
      contentInset: { bottom, left: 0, right: 0, top: topPadding },
      scrollIndicatorInsets: { bottom, left: 0, right: 0, top: 0 },
    };
  });

  const onPromptInputLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      composerHeight.value = h;
      setComposerOffsetHeight(h);
    },
    [composerHeight]
  );

  // -- Message rendering ---------------------------------------------------

  const renderItem = useCallback(
    ({ item }: { item: ThreadMessage }) => {
      if (item.role === "user") {
        return <Message from="user">{messageText(item)}</Message>;
      }

      if (item.role !== "assistant") {
        return null;
      }

      if (isGenerating && item === messages.at(-1)) {
        return (
          <Message from="assistant">
            <StreamingMessage store={streamingStore} />
          </Message>
        );
      }

      return (
        <Message from="assistant">
          {item.content
            .filter((p): p is TextMessagePart => p.type === "text" && !!p.text)
            .map((part, i) => {
              // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no stable ID
              return <MessageResponse key={i}>{part.text}</MessageResponse>;
            })}
          {item.content
            .filter(
              (p): p is ToolCallMessagePart =>
                p.type === "tool-call" &&
                p.toolName === "display_workout_plan" &&
                p.result !== undefined &&
                !p.isError
            )
            .map((tool) => (
              <WorkoutPlanCard
                key={tool.toolCallId}
                plan={tool.result as WorkoutPlan}
              />
            ))}
        </Message>
      );
    },
    [isGenerating, messages, streamingStore]
  );

  // -- Context value -------------------------------------------------------

  const contextValue: ConversationContextValue = {
    onPromptInputLayout,
    promptInputStyle,
    scrollButtonStyle,
    scrollToBottom,
  };

  // -- Render --------------------------------------------------------------

  return (
    <ConversationCtx value={contextValue}>
      <View className="flex-1 bg-background">
        <KeyboardGestureArea
          className="flex-1"
          interpolator="ios"
          offset={composerOffsetHeight}
          showOnSwipeUp
        >
          <AnimatedLegendList
            animatedProps={listAnimatedProps}
            automaticallyAdjustsScrollIndicatorInsets={false}
            contentContainerStyle={{
              padding: 16,
              // transparent header spacing.
              paddingBottom: 8,
            }}
            data={messages}
            estimatedItemSize={80}
            extraData={isGenerating}
            keyboardDismissMode="interactive"
            keyExtractor={messageKeyExtractor}
            ListFooterComponent={
              <Animated.View style={footerSpacerStyle}>
                {!messages.length && emptyState}
              </Animated.View>
            }
            maintainVisibleContentPosition
            onContentSizeChange={onContentSizeChange}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            recycleItems={false}
            ref={listRef}
            // biome-ignore lint/suspicious/noExplicitAny: LegendList renderItem type doesn't match UIMessage callback
            renderItem={renderItem as any}
            scrollEventThrottle={16}
          />
        </KeyboardGestureArea>

        {children}
      </View>
    </ConversationCtx>
  );
}

export function ConversationScrollButton() {
  const { scrollToBottom, scrollButtonStyle } = useConversationContext();
  const { t } = useTranslation();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", right: 16 }, scrollButtonStyle]}
    >
      <TouchableGlass
        accessibilityLabel={t("arnold.scrollToLatest")}
        accessibilityRole="button"
        accessible
        className="h-10 w-10 items-center justify-center rounded-full"
        hitSlop={8}
        onPress={scrollToBottom}
      >
        <SymbolImage
          className="mt-1 text-footnote text-muted-foreground dark:text-muted-foreground"
          name="chevron.down"
          sfEffect={{ effect: "wiggle", repeat: -1 }}
        />
      </TouchableGlass>
    </Animated.View>
  );
}

export function ConversationEmptyState({
  title,
  description,
  icon = "bubble.left.and.bubble.right",
}: {
  title: string;
  description?: string;
  icon?: SFSymbol;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <SymbolImage
        className="text-large-title text-muted-foreground"
        name={icon}
      />
      <Text className="text-center text-foreground text-title-2-emphasized dark:text-foreground">
        {title}
      </Text>
      {description ? (
        <Text className="text-center text-muted-foreground text-subhead dark:text-muted-foreground">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
