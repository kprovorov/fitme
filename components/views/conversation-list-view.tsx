import { format } from "date-fns";
import { FlatList, Modal, Pressable, View } from "react-native";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useConversationsQuery } from "~/hooks/queries/agent";
import { Check } from "~/lib/icons/Check";
import { Plus } from "~/lib/icons/Plus";
import { Sparkles } from "~/lib/icons/Sparkles";
import { X } from "~/lib/icons/X";
import type { ConversationWithPreview } from "~/lib/models";

interface ConversationListViewProps {
  activeConversationId: string | undefined;
  onClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  visible: boolean;
}

function ConversationListItem({
  conversation,
  isActive,
  onPress,
}: {
  conversation: ConversationWithPreview;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable className="px-4 py-3 active:bg-card/50" onPress={onPress}>
      <HStack className="items-center gap-3">
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </View>
        <VStack className="flex-1 items-start justify-start gap-0.5">
          <Text className="font-nunito-sans-semibold text-sm">
            {format(new Date(conversation.created_at), "MMM d, yyyy")}
          </Text>
          <Muted className="text-xs" numberOfLines={1}>
            {conversation.preview ?? "New conversation"}
          </Muted>
        </VStack>
        {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </HStack>
    </Pressable>
  );
}

function SkeletonRow() {
  return (
    <View className="px-4 py-3">
      <HStack className="items-center gap-3">
        <View className="h-8 w-8 rounded-full bg-muted opacity-30" />
        <VStack className="flex-1 gap-1.5">
          <View className="h-3.5 w-24 rounded bg-muted opacity-30" />
          <View className="h-3 w-40 rounded bg-muted opacity-20" />
        </VStack>
      </HStack>
    </View>
  );
}

export default function ConversationListView({
  visible,
  onClose,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationListViewProps) {
  const { data: conversations, isLoading } = useConversationsQuery({
    enabled: visible,
  });

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <HStack className="items-center justify-between border-white/10 border-b px-4 pt-4 pb-3">
          <H3>Conversations</H3>
          <Button onPress={onClose} shape="pill" size="icon-sm" variant="ghost">
            <X className="text-foreground" size={18} />
          </Button>
        </HStack>

        {/* List */}
        {isLoading ? (
          <View>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <FlatList
            data={conversations ?? []}
            ItemSeparatorComponent={() => <Separator className="opacity-50" />}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View className="items-center px-6 py-12">
                <Muted className="text-center">No conversations yet</Muted>
              </View>
            }
            renderItem={({ item }) => (
              <ConversationListItem
                conversation={item}
                isActive={item.id === activeConversationId}
                onPress={() => onSelectConversation(item.id)}
              />
            )}
          />
        )}

        {/* Footer */}
        <View className="border-white/10 border-t px-4 py-4">
          <Button onPress={onNewConversation} variant="outline">
            <HStack className="items-center gap-2">
              <Plus className="text-foreground" size={16} />
              <Text>New conversation</Text>
            </HStack>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
