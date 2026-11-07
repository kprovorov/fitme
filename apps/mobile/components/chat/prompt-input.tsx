import { BlurView } from "expo-blur";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextInputInstance } from "react-native";
import Animated, {
  createAnimatedComponent,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { ScopedVariables, useCSSVariable, withUniwind } from "uniwind";

import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "@/components/touchable-glass";
import { Image } from "@/components/tw";
import { cn } from "~/lib/utils";

import { useChatContext } from "./chat-context";
import type { ChatAttachment } from "./chat-context";
import { useConversationContext } from "./conversation";

const AnimatedGlassContainer = withUniwind(
  createAnimatedComponent(GlassContainer)
);

const StyledGlassView = withUniwind(GlassView);
const StyledBlurView = withUniwind(BlurView);

const PromptInputError = ({ message }: { message: string }) => (
  <Animated.View className="px-3 pb-2" entering={FadeIn.duration(200)}>
    <View className="border-continuous bg-card flex-row items-center gap-2 rounded-xl px-3 py-2.5">
      <View className="bg-destructive h-2 w-2 rounded-full" />
      <Text
        className="text-footnote text-muted-foreground flex-1"
        numberOfLines={2}
      >
        {message}
      </Text>
    </View>
  </Animated.View>
);

/**
 * One picked Attachment: its thumbnail, read from the file on this device,
 * with an × on its corner. The × is a button of its own, so VoiceOver reads
 * the photo and then the way to drop it.
 */
const PickedAttachment = ({
  attachment,
  onRemove,
  position,
  total,
}: {
  attachment: ChatAttachment;
  onRemove?: (id: string) => void;
  position: number;
  total: number;
}) => {
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
        // `accessible`, or the label is set on a view VoiceOver never stops
        // at: expo-image's `isAccessibilityElement` is `accessible ?? false`,
        // which would leave the User only the × buttons.
        accessible
        className="border-continuous bg-secondary h-16 w-16 rounded-xl"
        contentFit="cover"
        source={{ uri: attachment.uri }}
      />
      <Pressable
        // Named with its photo's place, so the four buttons are told apart
        // in the VoiceOver rotor, where the thumbnails aren't read with them.
        accessibilityLabel={t("arnold.attachments.removePhoto", {
          position,
          total,
        })}
        accessibilityRole="button"
        // `secondary` with a hairline, not `background`: the badge has to
        // read both on a photo and on the Conversation behind the composer,
        // which is black.
        className="border-border bg-secondary absolute top-1 right-1 h-6 w-6 items-center justify-center rounded-full border active:opacity-70"
        hitSlop={10}
        onPress={remove}
      >
        <SymbolImage
          className="text-caption-1-emphasized text-foreground"
          name="xmark"
        />
      </Pressable>
    </View>
  );
};

/** The material the composer is made of: glass, or a blur where there's none. */
const ComposerSurface = ({
  children,
  className,
  isInteractive,
}: {
  children: ReactNode;
  className: string;
  isInteractive?: boolean;
}) => (
  <ScopedVariables variables={{ "--composer-radius": 22 }}>
    {isLiquidGlassAvailable() ? (
      <StyledGlassView
        className={cn(
          "border-continuous rounded-(--composer-radius)",
          className
        )}
        glassEffectStyle="regular"
        isInteractive={isInteractive}
      >
        {children}
      </StyledGlassView>
    ) : (
      // The blur needs clipping to keep inside the rounded corners; the glass
      // view draws its own.
      <StyledBlurView
        className={cn(
          "border-continuous overflow-hidden rounded-(--composer-radius)",
          className
        )}
        tint="systemChromeMaterial"
      >
        {children}
      </StyledBlurView>
    )}
  </ScopedVariables>
);

/**
 * The Attachments picked for the next message, in a row above the text
 * field, oldest first (ADR 0018). The tray hugs them, so one photo doesn't
 * draw a bar across the Conversation, and nothing picked renders nothing, so
 * the composer keeps its own height.
 */
export const PromptInputAttachments = () => {
  const { attachments, onRemoveAttachment } = useChatContext();

  if (!attachments?.length) {
    return null;
  }

  return (
    <Animated.View
      className="mx-3 mb-2 self-start"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {/* The composer's own material, so a message scrolling past behind
          the thumbnails is blurred rather than showing through the gaps. */}
      <ComposerSurface className="flex-row gap-2 p-1.5">
        {attachments.map((attachment, index) => (
          <PickedAttachment
            attachment={attachment}
            key={attachment.id}
            onRemove={onRemoveAttachment}
            position={index + 1}
            total={attachments.length}
          />
        ))}
      </ComposerSurface>
    </Animated.View>
  );
};

/**
 * Root container for the message composer. Positions itself at the bottom of
 * the `<Conversation />` using the shared conversation context. Children are
 * laid out in a horizontal row inside a glass container.
 */
export const PromptInput = ({ children }: { children: ReactNode }) => {
  const { promptInputStyle, onPromptInputLayout } = useConversationContext();
  const { errorMessage } = useChatContext();

  return (
    <Animated.View
      onLayout={onPromptInputLayout}
      className="absolute right-0 left-0"
      style={promptInputStyle}
    >
      {errorMessage ? <PromptInputError message={errorMessage} /> : null}
      <PromptInputAttachments />
      <AnimatedGlassContainer
        spacing={8}
        className="flex-1 flex-row items-end gap-2.5 p-3"
      >
        {children}
      </AnimatedGlassContainer>
    </Animated.View>
  );
};

/**
 * A circular glass button for actions (e.g. attachments, camera).
 */
export const PromptInputAction = (props: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
}) => (
  <TouchableGlass
    accessibilityRole="button"
    accessible
    hitSlop={4}
    {...props}
    className="h-11 w-11 items-center justify-center rounded-full"
  />
);

/**
 * Glass-wrapped container for the textarea and submit button.
 */
export const PromptInputBody = ({ children }: { children: ReactNode }) => (
  <ComposerSurface className="flex-1 flex-row" isInteractive>
    {children}
  </ComposerSurface>
);

/**
 * Auto-growing text input for composing messages. Reads/writes the current
 * input value from `ChatContext`.
 */
export const PromptInputTextarea = ({
  placeholder,
  maxLength = 1000,
}: {
  placeholder: string;
  maxLength?: number;
}) => {
  const { input, setInput } = useChatContext();
  const inputRef = useRef<TextInputInstance>(null);
  // SAFETY: The foreground theme token is a CSS color string in every theme.
  const foreground = useCSSVariable("--color-foreground") as string;

  useEffect(() => {
    if (input === "") {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: the ref is null until the TextInput mounts
      inputRef.current?.clear();
    }
  }, [input]);

  return (
    <TextInput
      className="text-callout text-foreground dark:text-foreground max-h-25 flex-1 py-3 pr-2 pl-4"
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
};

/**
 * Submit button that sends the current input. Shows a spinner while the model
 * is generating. Reads state from `ChatContext`.
 */
export const PromptInputSubmit = () => {
  const { input, isGenerating, isLoading, onSend } = useChatContext();
  const { t } = useTranslation();
  // SAFETY: The foreground theme token is a CSS color string in every theme.
  const foreground = useCSSVariable("--color-foreground") as string;
  const disabled = !input.trim() || isGenerating || isLoading;

  return (
    <Pressable
      accessibilityLabel={t("arnold.composer.send")}
      accessibilityRole="button"
      className={cn(
        "border-continuous m-1.25 h-8.5 w-8.5 items-center justify-center rounded-full active:opacity-70",
        disabled ? "bg-secondary" : "bg-foreground"
      )}
      disabled={disabled}
      onPress={onSend}
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
};
