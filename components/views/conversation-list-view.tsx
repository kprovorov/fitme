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
  visible: boolean;
  onClose: () => void;
  activeConversationId: string | undefined;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
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
    <Pressable onPress={onPress} className="active:bg-card/50 px-4 py-3">
      <HStack className="items-center gap-3">
        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </View>
        <VStack className="flex-1 gap-0.5 items-start justify-start">
          <Text className="text-sm font-nunito-sans-semibold">
            {format(new Date(conversation.created_at), "MMM d, yyyy")}
          </Text>
          <Muted className="text-xs" numberOfLines={1}>
            {conversation.preview ?? "New conversation"}
          </Muted>
        </VStack>
        {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
      </HStack>
    </Pressable>
  );
}

function SkeletonRow() {
  return (
    <View className="px-4 py-3">
      <HStack className="items-center gap-3">
        <View className="w-8 h-8 rounded-full bg-muted opacity-30" />
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
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <HStack className="items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
          <H3>Conversations</H3>
          <Button variant="ghost" size="icon-sm" shape="pill" onPress={onClose}>
            <X size={18} className="text-foreground" />
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
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConversationListItem
                conversation={item}
                isActive={item.id === activeConversationId}
                onPress={() => onSelectConversation(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <Separator className="opacity-50" />}
            ListEmptyComponent={
              <View className="items-center py-12 px-6">
                <Muted className="text-center">No conversations yet</Muted>
              </View>
            }
          />
        )}

        {/* Footer */}
        <View className="px-4 py-4 border-t border-white/10">
          <Button variant="outline" onPress={onNewConversation}>
            <HStack className="items-center gap-2">
              <Plus size={16} className="text-foreground" />
              <Text>New conversation</Text>
            </HStack>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
