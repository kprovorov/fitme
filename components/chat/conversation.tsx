import type { UIMessage } from "@ai-sdk/react";
import { LegendList, type LegendListRef } from "@legendapp/list";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  createContext,
  type ReactElement,
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

export function Conversation({
  renderMessage,
  emptyState,
  children,
}: {
  /** Render callback for each message – passed to the underlying list. */
  renderMessage: (info: { item: UIMessage }) => ReactElement;
  /** Element shown when the message list is empty. */
  emptyState?: ReactElement;
  /** Compound children: <ConversationScrollButton />, <PromptInput />, etc. */
  children?: ReactNode;
}) {
  const { messages, isGenerating } = useChatContext();
  const listRef = useRef<LegendListRef>(null);
  const insets = useSafeAreaInsets();

  // -- Keyboard tracking --------------------------------------------------

  // biome-ignore lint/suspicious/noEmptyBlockStatements: initial no-op replaced via ref assignment on mount
  const scrollToBottomRef = useRef<() => void>(() => {});
  const keyboardHeight = useSharedValue(0);
  // Separate value for contentInset that freezes during interactive dismiss
  // to prevent the scroll view from snapping when the user is overscrolled.
  const keyboardHeightForInset = useSharedValue(0);
  // Tracks whether the current keyboard transition originated from an
  // interactive dismiss gesture (vs a programmatic tap-to-open).
  const wasInteractive = useSharedValue(false);
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
          runOnJS(scrollToBottomRef.current)();
        }
      },
    },
    []
  );

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
      bottomInset.value,
      currentFooterHeight.value,
      isAtBottom.value,
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
  }, [bottomInset.value]);
  scrollToBottomRef.current = scrollToBottom;

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
                {!messages.length && emptyState}
              </Animated.View>
            }
            maintainVisibleContentPosition
            onContentSizeChange={onContentSizeChange}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            ref={listRef}
            // biome-ignore lint/suspicious/noExplicitAny: LegendList renderItem type doesn't match UIMessage callback
            renderItem={renderMessage as any}
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
          className="mt-1 text-muted-foreground text-xs dark:text-muted-foreground"
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
      <Text className="font-semibold text-foreground text-xl dark:text-foreground">
        {title}
      </Text>
      {description && (
        <Text className="text-muted-foreground text-sm dark:text-muted-foreground">
          {description}
        </Text>
      )}
    </View>
  );
}
