import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import type { UIMessage } from "ai";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useRef,
  useState,
} from "react";
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
import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "../touchable-glass";
import { KeyboardGestureArea } from "../tw";
import { useChatContext } from "./chat-context";
import { Message, MessageResponse } from "./message";
import { StreamingMessage } from "./streaming-message";
import { type WorkoutPlan, WorkoutPlanCard } from "./workout-plan-card";

const IS_GLASS = isLiquidGlassAvailable();

const AnimatedLegendList = Animated.createAnimatedComponent(LegendList);

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

export function Conversation({ children }: { children?: ReactNode }) {
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
      onStart: (e) => {
        "worklet";
        // Track if keyboard is opening from a tap (not from interactive dismiss)
        if (e.height > 0 && !wasInteractive.value) {
          wasInteractive.value = false;
        }
      },
      onMove: (e) => {
        "worklet";
        keyboardHeight.value = e.height;
        keyboardHeightForInset.value = e.height;
      },
      onInteractive: (e) => {
        "worklet";
        // Only update prompt input position, not contentInset.
        // Changing contentInset during an active gesture causes a jump
        // when the user has overscrolled past the bottom.
        keyboardHeight.value = e.height;
        wasInteractive.value = true;
      },
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
    bottom:
      composerHeight.value +
      Math.max(insets.bottom, Math.abs(keyboardHeight.value)) +
      12,
  }));

  const listAnimatedProps = useAnimatedProps(() => {
    const keyboard = Math.abs(keyboardHeightForInset.value);
    const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
    return {
      contentInset: { top: topPadding, left: 0, right: 0, bottom },
      scrollIndicatorInsets: { top: 0, left: 0, right: 0, bottom },
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
    ({ item }: { item: UIMessage }) => {
      if (item.role === "user") {
        const text = item.parts
          .filter(
            (p): p is { type: "text"; text: string } =>
              p.type === "text" && "text" in p
          )
          .map((p) => p.text)
          .join("");
        return <Message from="user">{text}</Message>;
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
          {item.parts
            .filter(
              (p): p is { type: "text"; text: string } =>
                p.type === "text" &&
                "text" in p &&
                !!(p as { type: "text"; text: string }).text
            )
            .map((part, i) => {
              // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no stable ID
              return <MessageResponse key={i}>{part.text}</MessageResponse>;
            })}
          {item.parts
            .filter((p) => p.type === "tool-display_workout_plan")
            .map((part) => {
              const tool = part as {
                toolCallId: string;
                state: string;
                output: unknown;
              };
              if (tool.state !== "output-available") {
                return null;
              }
              return (
                <WorkoutPlanCard
                  key={tool.toolCallId}
                  plan={tool.output as WorkoutPlan}
                />
              );
            })}
        </Message>
      );
    },
    [isGenerating, messages, streamingStore]
  );

  // -- Context value -------------------------------------------------------

  const contextValue: ConversationContextValue = {
    scrollToBottom,
    promptInputStyle,
    onPromptInputLayout,
    scrollButtonStyle,
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
            keyExtractor={(item) => (item as UIMessage).id}
            ListFooterComponent={
              <Animated.View style={footerSpacerStyle}>
                {!messages.length && (
                  <ConversationEmptyState
                    description="Send a message to get started"
                    title="Chat"
                  />
                )}
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

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", right: 16 }, scrollButtonStyle]}
    >
      <TouchableGlass
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
  title = "Ready",
  description,
  icon = "bubble.left.and.bubble.right",
}: {
  title?: string;
  description?: string;
  icon?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <SymbolImage
        className="text-muted-foreground dark:text-muted-foreground"
        name={icon}
        size={48}
      />
      <Text className="font-semibold text-foreground text-title-2 dark:text-foreground">
        {title}
      </Text>
      {description && (
        <Text className="text-muted-foreground text-subhead dark:text-muted-foreground">
          {description}
        </Text>
      )}
    </View>
  );
}
