import { BlurView } from "expo-blur";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { Image } from "@/components/tw";
import { cn } from "~/lib/utils";
import { type ChatAttachment, useChatContext } from "./chat-context";
import { useConversationContext } from "./conversation";

const AnimatedGlassContainer = Animated.createAnimatedComponent(GlassContainer);

/**
 * Root container for the message composer. Positions itself at the bottom of
 * the `<Conversation />` using the shared conversation context. Children are
 * laid out in a horizontal row inside a glass container.
 */
export function PromptInput({ children }: { children: ReactNode }) {
  const { promptInputStyle, onPromptInputLayout } = useConversationContext();
  const { errorMessage } = useChatContext();

  return (
    <Animated.View
      onLayout={onPromptInputLayout}
      style={[{ left: 0, position: "absolute", right: 0 }, promptInputStyle]}
    >
      {errorMessage ? <PromptInputError message={errorMessage} /> : null}
      <PromptInputAttachments />
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

function PromptInputError({ message }: { message: string }) {
  return (
    <Animated.View className="px-3 pb-2" entering={FadeIn.duration(200)}>
      <View
        className="flex-row items-center gap-2 rounded-xl bg-card px-3 py-2.5"
        style={{ borderCurve: "continuous" }}
      >
        <View className="h-2 w-2 rounded-full bg-destructive" />
        <Text
          className="flex-1 text-footnote text-muted-foreground"
          numberOfLines={2}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * One picked Attachment: its thumbnail, read from the file on this device,
 * with an × on its corner. The × is a button of its own, so VoiceOver reads
 * the photo and then the way to drop it.
 */
function PickedAttachment({
  attachment,
  onRemove,
  position,
  total,
}: {
  attachment: ChatAttachment;
  onRemove?: (id: string) => void;
  position: number;
  total: number;
}) {
  const { t } = useTranslation();
  const remove = useCallback(
    () => onRemove?.(attachment.id),
    [attachment.id, onRemove]
  );

  return (
    <View>
      <Image
        accessibilityLabel={t("arnold.attachments.pickedPhoto", {
          position,
          total,
        })}
        className="h-16 w-16 rounded-xl border-continuous bg-secondary"
        contentFit="cover"
        source={{ uri: attachment.uri }}
      />
      <Pressable
        accessibilityLabel={t("arnold.attachments.removePhoto")}
        accessibilityRole="button"
        className="absolute -top-1.5 -right-1.5 h-6 w-6 items-center justify-center rounded-full bg-background active:opacity-70"
        hitSlop={10}
        onPress={remove}
      >
        <SymbolImage className="text-caption-1 text-foreground" name="xmark" />
      </Pressable>
    </View>
  );
}

/**
 * The Attachments picked for the next message, in a row above the text
 * field, oldest first (ADR 0018). Nothing picked renders nothing, so the
 * composer keeps its own height.
 */
export function PromptInputAttachments() {
  const { attachments, onRemoveAttachment } = useChatContext();
  if (!attachments?.length) {
    return null;
  }

  return (
    <View className="flex-row gap-3 px-3 pb-2">
      {attachments.map((attachment, index) => (
        <PickedAttachment
          attachment={attachment}
          key={attachment.id}
          onRemove={onRemoveAttachment}
          position={index + 1}
          total={attachments.length}
        />
      ))}
    </View>
  );
}

/**
 * A circular glass button for actions (e.g. attachments, camera).
 */
export function PromptInputAction(props: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableGlass
      accessibilityRole="button"
      accessible
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
  placeholder,
  maxLength = 1000,
}: {
  placeholder: string;
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
  const { t } = useTranslation();
  const foreground = useCSSVariable("--color-foreground") as string;
  const disabled = !input.trim() || isGenerating || isLoading;

  return (
    <Pressable
      accessibilityLabel={t("arnold.composer.send")}
      accessibilityRole="button"
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
            "text-body-emphasized",
            disabled
              ? "text-muted-foreground"
              : "text-background dark:text-background"
          )}
          name="arrow.up"
          sfEffect="scale/up"
        />
      )}
    </Pressable>
  );
}
