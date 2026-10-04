import "@/global.css";

import type { Href } from "expo-router";
import { Plus } from "lucide-react-native";
import type React from "react";
import { createContext, use, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { SafeAreaView } from "@/components/tw";
import { MOCK_CHATS } from "@/utils/mock-chats";
import { cn } from "~/lib/utils";

interface DrawerContextValue {
  closeDrawer: () => void;
  isOpen: boolean;
  openDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  return (
    <DrawerContext value={{ closeDrawer, isOpen, openDrawer }}>
      {children}
    </DrawerContext>
  );
}

export function useDrawer() {
  const context = use(DrawerContext);
  if (!context) {
    throw new Error("useDrawer must be used within a DrawerProvider");
  }
  return context;
}

function DrawerNavItem({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className="mx-2 rounded-[10px] px-4 py-3 active:bg-muted"
      onPress={onPress}
    >
      <Text className="text-body text-foreground dark:text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function DrawerChatItem({
  title,
  onPress,
  active,
}: {
  title: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      className={cn(
        "mx-2 rounded-[10px] px-4 py-2.5 active:bg-accent",
        active && "bg-muted dark:bg-muted"
      )}
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-[15px]",
          active
            ? "text-foreground dark:text-foreground"
            : "text-muted-foreground dark:text-muted-foreground"
        )}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function DrawerContent({
  onNavigate,
  onOpenModal,
}: {
  onNavigate: (path: Href) => void;
  onOpenModal: (path: Href) => void;
}) {
  const navigateToChats = useCallback(() => onNavigate("/chats"), [onNavigate]);
  const navigateHome = useCallback(() => onNavigate("/"), [onNavigate]);
  const openSettingsModal = useCallback(
    () => onOpenModal("/(settings)/settings"),
    [onOpenModal]
  );
  const openSettings = useCallback(() => {
    if (process.env.EXPO_OS === "android") {
      onNavigate("/(settings)/settings");
    }
    onOpenModal("/(settings)/settings");
  }, [onNavigate, onOpenModal]);

  return (
    <SafeAreaView
      // NOTE: Some issue with uniwind that prevents updates for this component.
      className="flex-1"
      edges={["top", "bottom", "left"]}
    >
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="font-bold text-[28px] text-foreground dark:text-foreground">
          Chat
        </Text>
      </View>

      {/* Nav + Chat history */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        <DrawerNavItem label="Chats" onPress={navigateToChats} />
        <DrawerNavItem label="Settings" onPress={openSettings} />

        {/* Recents */}
        <Text className="px-6 pt-5 pb-1.5 font-semibold text-[13px] text-muted-foreground dark:text-muted-foreground">
          Recents
        </Text>
        {MOCK_CHATS.map((chat) => (
          <DrawerChatItem
            active={chat.id === "1"}
            key={chat.id}
            onPress={navigateHome}
            title={chat.title}
          />
        ))}
      </ScrollView>

      {/* Footer */}
      <View
        className="flex-row items-center border-border border-t px-4 py-3 dark:border-border"
        style={{ borderTopWidth: StyleSheet.hairlineWidth }}
      >
        <TouchableGlass
          className="flex-row items-center gap-2.5 rounded-full p-2 active:opacity-60"
          onPress={openSettingsModal}
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-muted dark:bg-muted">
            <Text className="font-semibold text-[13px] text-foreground dark:text-foreground">
              EB
            </Text>
          </View>
          <Text className="text-foreground text-subhead dark:text-foreground">
            Evan Bacon
          </Text>
        </TouchableGlass>
        <View className="flex-1" />
        <TouchableGlass
          className="h-10 w-10 items-center justify-center rounded-full bg-foreground active:bg-muted dark:bg-foreground"
          onPress={navigateHome}
        >
          <Icon
            className="h-6 w-6 text-background dark:text-background"
            icon={Plus}
          />
        </TouchableGlass>
      </View>
    </SafeAreaView>
  );
}
