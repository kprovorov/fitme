import { BlurView } from "expo-blur";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { type ReactNode, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableStateCallbackType,
  type StyleProp,
  Text,
  TextInput,
  type TextInputInstance,
  View,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useCSSVariable } from "uniwind";
import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "@/components/touchable-glass";
import { cn } from "~/lib/utils";
import { useChatContext } from "./chat-context";
import { useConversationContext } from "./conversation";

const AnimatedGlassContainer = Animated.createAnimatedComponent(GlassContainer);

/**
 * Root container for the message composer. Positions itself at the bottom of
 * the `<Conversation />` using the shared conversation context. Children are
 * laid out in a horizontal row inside a glass container.
 */
export function PromptInput({ children }: { children: ReactNode }) {
  const { promptInputStyle, onPromptInputLayout } = useConversationContext();
  const { error } = useChatContext();

  return (
    <Animated.View
      onLayout={onPromptInputLayout}
      style={[{ left: 0, position: "absolute", right: 0 }, promptInputStyle]}
    >
      {error ? <PromptInputError message={error.message} /> : null}
      <AnimatedGlassContainer
        spacing={8}
        style={{
          alignItems: "flex-end",
          flex: 1,
          flexDirection: "row",
          gap: 10,
          padding: 12,
        }}
      >
        {children}
      </AnimatedGlassContainer>
    </Animated.View>
  );
}

function PromptInputError({ message }: { message?: string }) {
  return (
    <Animated.View className="px-3 pb-2" entering={FadeIn.duration(200)}>
      <View
        className="flex-row items-center gap-2 rounded-xl bg-card px-3 py-2.5"
        style={{ borderCurve: "continuous" }}
      >
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: "#EF4444" }}
        />
        <Text
          className="flex-1 text-footnote text-muted-foreground"
          numberOfLines={2}
        >
          {message || "Something went wrong"}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * A circular glass button for actions (e.g. attachments, camera).
 */
export function PromptInputAction(props: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableGlass
      hitSlop={4}
      {...props}
      style={{
        alignItems: "center",
        borderRadius: 22,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    />
  );
}

/**
 * Glass-wrapped container for the textarea and submit button.
 */
export function PromptInputBody({ children }: { children: ReactNode }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={{
          borderCurve: "continuous",

          borderRadius: 22,
          flex: 1,
          flexDirection: "row",
        }}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      style={{
        borderCurve: "continuous",
        borderRadius: 22,
        flex: 1,
        flexDirection: "row",

        overflow: "hidden",
      }}
      tint="systemChromeMaterial"
    >
      {children}
    </BlurView>
  );
}

/**
 * Auto-growing text input for composing messages. Reads/writes the current
 * input value from `ChatContext`.
 */
export function PromptInputTextarea({
  placeholder = "Chat with Agent...",
  maxLength = 1000,
}: {
  placeholder?: string;
  maxLength?: number;
}) {
  const { input, setInput } = useChatContext();
  const inputRef = useRef<TextInputInstance>(null);
  const foreground = useCSSVariable("--color-foreground") as string;

  useEffect(() => {
    if (input === "") {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: the ref is null until the TextInput mounts
      inputRef.current?.clear();
    }
  }, [input]);

  return (
    <TextInput
      className="max-h-25 flex-1 py-3 pr-2 pl-4 text-callout text-foreground dark:text-foreground"
      cursorColor={foreground}
      maxLength={maxLength}
      multiline
      nativeID="composer"
      onChangeText={setInput}
      placeholder={placeholder}
      ref={inputRef}
      selectionColor={foreground}
      value={input}
    />
  );
}

const submitButtonStyle = ({
  pressed,
}: PressableStateCallbackType): StyleProp<ViewStyle> => ({
  alignItems: "center",
  borderCurve: "continuous",
  borderRadius: 17,
  height: 34,
  justifyContent: "center",
  margin: 5,
  opacity: pressed ? 0.7 : 1,
  width: 34,
});

/**
 * Submit button that sends the current input. Shows a spinner while the model
 * is generating. Reads state from `ChatContext`.
 */
export function PromptInputSubmit() {
  const { input, isGenerating, isLoading, onSend } = useChatContext();
  const foreground = useCSSVariable("--color-foreground") as string;
  const disabled = !input.trim() || isGenerating || isLoading;

  return (
    <Pressable
      className={disabled ? "bg-secondary" : "bg-foreground"}
      disabled={disabled}
      onPress={onSend}
      style={submitButtonStyle}
    >
      {isGenerating ? (
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          <ActivityIndicator color={foreground} size="small" />
        </Animated.View>
      ) : (
        <SymbolImage
          className={cn(
            "font-semibold",
            disabled
              ? "text-muted-foreground"
              : "text-background dark:text-background"
          )}
          name="arrow.up"
          sfEffect="scale/up"
          size={16}
        />
      )}
    </Pressable>
  );
}
