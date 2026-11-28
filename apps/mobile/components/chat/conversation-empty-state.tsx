import { Pressable, ScrollView, Text, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "@/components/symbol-image";
import { H3 } from "~/components/ui/typography";
import { cn } from "~/lib/utils";

/** What the Conversation shows while it has no messages. */
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

/**
 * The Arnold redesign's empty Conversation (Figma, the Arnold page's `Empty
 * state` frame): a greeting, then the starter prompts as pills. Tapping one
 * sends its text as the User's own message, so each is a button named by
 * that text.
 */
export const ConversationStarters = ({
  description,
  disabled = false,
  onStart,
  starters,
  title,
}: {
  description: string;
  disabled?: boolean;
  onStart: (text: string) => void;
  starters: readonly string[];
  title: string;
}) => (
  // The Conversation gives the empty state the screen's free space and no
  // more, so at the largest text sizes, where it outgrows that, it scrolls
  // within it rather than spilling under the header.
  <ScrollView
    className="flex-1"
    contentContainerClassName="gap-md grow justify-center"
    keyboardShouldPersistTaps="handled"
  >
    <View className="gap-xs">
      <H3>{title}</H3>
      <Text className="text-muted-foreground text-subhead">{description}</Text>
    </View>
    <View className="gap-xs flex-row flex-wrap">
      {starters.map((starter) => (
        <Pressable
          accessibilityLabel={starter}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          // A pill while it fits one line; at the largest text sizes it wraps,
          // and a full radius would clip a taller pill's text.
          className={cn(
            "border-continuous bg-secondary px-sm min-h-11 justify-center rounded-4xl py-2.5 active:opacity-70",
            disabled && "opacity-50"
          )}
          disabled={disabled}
          key={starter}
          onPress={() => onStart(starter)}
        >
          <Text className="text-foreground text-body">{starter}</Text>
        </Pressable>
      ))}
    </View>
  </ScrollView>
);
