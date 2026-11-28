import { Text, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "@/components/symbol-image";

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
