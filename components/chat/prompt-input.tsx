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
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "@/components/touchable-glass";
import { cn } from "@/utils/tailwind";
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
      style={[{ position: "absolute", left: 0, right: 0 }, promptInputStyle]}
    >
      {error && <PromptInputError message={error.message} />}
      <AnimatedGlassContainer
        spacing={8}
        style={{
          flex: 1,
          flexDirection: "row",
          padding: 12,
          gap: 10,
          alignItems: "flex-end",
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
          className="flex-1 text-muted-foreground text-xs"
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
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
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
          flex: 1,
          flexDirection: "row",

          borderRadius: 22,
          borderCurve: "continuous",
        }}
      >
        {children}
      </GlassView>
    );
  }

  // TODO: Android version...
  return (
    <BlurView
      style={{
        flex: 1,
        flexDirection: "row",

        overflow: "hidden",
        borderRadius: 22,
        borderCurve: "continuous",
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
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (input === "") {
      inputRef.current?.clear();
    }
  }, [input]);

  return (
    <TextInput
      className="max-h-25 flex-1 py-3 pr-2 pl-4 text-foreground dark:text-foreground"
      cursorColorClassName="tint-foreground"
      maxLength={maxLength}
      multiline
      nativeID="composer"
      onChangeText={setInput}
      placeholder={placeholder}
      ref={inputRef}
      selectionColorClassName="tint-foreground"
      style={{ fontSize: 16 }}
      value={input}
    />
  );
}

/**
 * Submit button that sends the current input. Shows a spinner while the model
 * is generating. Reads state from `ChatContext`.
 */
export function PromptInputSubmit() {
  const { input, isGenerating, onSend } = useChatContext();
  const disabled = !input.trim() || isGenerating;

  return (
    <Pressable
      className={disabled ? "bg-secondary" : "bg-foreground"}
      disabled={disabled}
      onPress={onSend}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        borderCurve: "continuous",
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.7 : 1,
        margin: 5,
      })}
    >
      {isGenerating ? (
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          <ActivityIndicator
            className="text-foreground"
            colorClassName="tint-foreground"
            size="small"
          />
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
