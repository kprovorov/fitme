import type {
  TextMessagePart,
  ThreadMessage,
  ToolCallMessagePart,
} from "@assistant-ui/react-native";
import { LegendList } from "@legendapp/list/react-native";
import type {
  LegendListProps,
  LegendListRef,
} from "@legendapp/list/react-native";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  createContext,
  use,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  createAnimatedComponent,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { AnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "@/components/symbol-image";

import { TouchableGlass } from "../touchable-glass";
import { KeyboardGestureArea } from "../tw";
import { useChatContext } from "./chat-context";
import type { ChatContextValue } from "./chat-context";
import { Message, MessageResponse, UserMessageBody } from "./message";
import { messageText } from "./message-text";
import { StreamingMessage } from "./streaming-message";
import type { StreamingStore } from "./streaming-store";
import { WorkoutPlanCard } from "./workout-plan-card";
import type { WorkoutPlan } from "./workout-plan-card";

const IS_GLASS = isLiquidGlassAvailable();

type AnimatableLegendListProps = LegendListProps<ThreadMessage> & {
  ref?: React.Ref<LegendListRef>;
};

/**
 * LegendList exposes a plain methods object through its ref, which Reanimated
 * (4.5+) cannot resolve to a host view. Expose `getAnimatableRef` so the
 * animated wrapper targets the underlying ScrollView instead.
 */
const AnimatableLegendList = ({ ref, ...props }: AnimatableLegendListProps) => {
  const listRef = useRef<LegendListRef>(null);

  useImperativeHandle<LegendListRef | null, LegendListRef | null>(ref, () => {
    const list = listRef.current;

    if (!list) {
      return null;
    }

    return {
      ...list,
      // oxlint-disable-next-line typescript/no-unsafe-return -- LegendList's typed native ref is forwarded unchanged; tsc validates its contract.
      getAnimatableRef: () => list.getNativeScrollRef(),
    };
  }, []);

  return <LegendList {...props} ref={listRef} />;
};

const AnimatedLegendList = createAnimatedComponent(AnimatableLegendList);

const messageKeyExtractor = (item: ThreadMessage) => item.id;

interface ConversationContextValue {
  /** Prompt input reports its measured height through this callback. */
  onPromptInputLayout: (e: LayoutChangeEvent) => void;
  /** Animated style that positions the prompt input above the keyboard. */
  promptInputStyle: AnimatedStyle<ViewStyle>;
  /** Animated style for the scroll-to-bottom button. */
  scrollButtonStyle: AnimatedStyle<ViewStyle>;
  scrollToBottom: () => void;
}

const ConversationCtx = createContext<ConversationContextValue | null>(null);

export const useConversationContext = () => {
  const ctx = use(ConversationCtx);

  if (!ctx) {
    throw new Error(
      "useConversationContext must be used within <Conversation>"
    );
  }

  return ctx;
};

const ConversationMessage = ({
  item,
  isStreaming,
  onOpenAttachment,
  streamingStore,
  userMessage,
}: {
  item: ThreadMessage;
  isStreaming: boolean;
  onOpenAttachment?: ChatContextValue["onOpenAttachment"];
  streamingStore: StreamingStore;
  userMessage?: ChatContextValue["userMessage"];
}) => {
  if (item.role === "user") {
    return (
      <Message from="user">
        <UserMessageBody
          {...(userMessage?.(item) ?? {
            attachments: [],
            text: messageText(item),
          })}
          onOpenAttachment={onOpenAttachment}
        />
      </Message>
    );
  }

  if (item.role !== "assistant") {
    return null;
  }

  if (isStreaming) {
    return (
      <Message from="assistant">
        <StreamingMessage store={streamingStore} />
      </Message>
    );
  }

  // Content-based keys survive reordering; counts distinguish identical text.
  const occurrences = new Map<string, number>();

  const textParts = item.content
    .filter(
      (part): part is TextMessagePart => part.type === "text" && !!part.text
    )
    .map((part) => {
      const occurrence = occurrences.get(part.text) ?? 0;
      occurrences.set(part.text, occurrence + 1);

      return { id: JSON.stringify([part.text, occurrence]), text: part.text };
    });

  return (
    <Message from="assistant">
      {textParts.map((part) => (
        <MessageResponse key={part.id}>{part.text}</MessageResponse>
      ))}
      {item.content
        .filter(
          (part): part is ToolCallMessagePart =>
            part.type === "tool-call" &&
            part.toolName === "display_workout_plan" &&
            part.result !== undefined &&
            !part.isError
        )
        .map((tool) => {
          // SAFETY: A successful display_workout_plan returns the server's
          // schema-validated WorkoutPlan input unchanged.
          const plan = tool.result as WorkoutPlan;

          return <WorkoutPlanCard key={tool.toolCallId} plan={plan} />;
        })}
    </Message>
  );
};

export const Conversation = ({
  children,
  emptyState,
}: {
  children?: ReactNode;
  /** Shown while there are no messages. */
  emptyState: ReactNode;
}) => {
  const {
    messages,
    isGenerating,
    onOpenAttachment,
    streamingStore,
    userMessage,
  } = useChatContext();

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
      scrollViewHeight.set(e.nativeEvent.layout.height);
    },
    [scrollViewHeight]
  );

  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.set(event.nativeEvent.contentOffset.y);
    },
    [scrollY]
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const wasAtBottom = isAtBottom.value;
      const heightIncreased = height > lastContentHeight.value;

      totalContentHeight.set(height);
      lastContentHeight.set(height);
      // Derive message-only height by subtracting the last known footer height.
      // This is stable: when the footer resizes, totalContent changes but
      // messagesOnly stays the same, breaking the feedback loop.
      messagesOnlyHeight.set(height - currentFooterHeight.value);

      if (wasAtBottom && heightIncreased && listRef.current) {
        requestAnimationFrame(() => {
          void listRef.current?.scrollToEnd({
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
      lastContentHeight,
      messagesOnlyHeight,
      totalContentHeight,
    ]
  );

  const scrollToBottom = useCallback(() => {
    void listRef.current?.scrollToEnd({
      animated: true,
      viewOffset: -bottomInset.value,
    });
  }, [bottomInset]);

  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        const shouldScroll = e.height > 0 && !wasInteractive.value;
        keyboardHeight.set(e.height);
        keyboardHeightForInset.set(withTiming(e.height, { duration: 250 }));
        wasInteractive.set(false);

        if (shouldScroll) {
          scheduleOnRN(scrollToBottom);
        }
      },
      onInteractive: (e) => {
        "worklet";
        // Only update prompt input position, not contentInset.
        // Changing contentInset during an active gesture causes a jump
        // when the user has overscrolled past the bottom.
        keyboardHeight.set(e.height);
        wasInteractive.set(true);
      },
      onMove: (e) => {
        "worklet";
        keyboardHeight.set(e.height);
        keyboardHeightForInset.set(e.height);
      },
      onStart: (e) => {
        "worklet";

        // Track if keyboard is opening from a tap (not from interactive dismiss)
        if (e.height > 0 && !wasInteractive.value) {
          wasInteractive.set(false);
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

    currentFooterHeight.set(footerHeight);

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
      composerHeight.set(h);
      setComposerOffsetHeight(h);
    },
    [composerHeight]
  );

  // -- Message rendering ---------------------------------------------------

  const renderItem = useCallback(
    ({ item }: { item: ThreadMessage }) => (
      <ConversationMessage
        isStreaming={isGenerating && item === messages.at(-1)}
        item={item}
        onOpenAttachment={onOpenAttachment}
        streamingStore={streamingStore}
        userMessage={userMessage}
      />
    ),
    [isGenerating, messages, onOpenAttachment, streamingStore, userMessage]
  );

  // -- Context value -------------------------------------------------------

  const contextValue = useMemo<ConversationContextValue>(
    () => ({
      onPromptInputLayout,
      promptInputStyle,
      scrollButtonStyle,
      scrollToBottom,
    }),
    [onPromptInputLayout, promptInputStyle, scrollButtonStyle, scrollToBottom]
  );

  // -- Render --------------------------------------------------------------

  return (
    <ConversationCtx value={contextValue}>
      <View className="bg-background flex-1">
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
            renderItem={renderItem}
            scrollEventThrottle={16}
          />
        </KeyboardGestureArea>

        {children}
      </View>
    </ConversationCtx>
  );
};

export const ConversationScrollButton = () => {
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
          className="text-footnote text-muted-foreground dark:text-muted-foreground mt-1"
          name="chevron.down"
          sfEffect={{ effect: "wiggle", repeat: -1 }}
        />
      </TouchableGlass>
    </Animated.View>
  );
};

export const ConversationEmptyState = ({
  title,
  description,
  icon = "bubble.left.and.bubble.right",
}: {
  title: string;
  description?: string;
  icon?: SFSymbol;
}) => (
  <View className="flex-1 items-center justify-center gap-2">
    <SymbolImage
      className="text-large-title text-muted-foreground"
      name={icon}
    />
    <Text className="text-foreground text-title-2-emphasized dark:text-foreground text-center">
      {title}
    </Text>
    {description ? (
      <Text className="text-muted-foreground text-subhead dark:text-muted-foreground text-center">
        {description}
      </Text>
    ) : null}
  </View>
);
