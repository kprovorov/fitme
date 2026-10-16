import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Color, Link, Stack, useRouter } from "expo-router";
import { ChevronRight, Menu, Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SearchBarTextEventData } from "react-native-screens";
import { useDrawer } from "@/components/drawer-content";
import { Icon } from "@/components/icon";
import { Image } from "@/components/tw";
import { MOCK_CHATS, type MockChat } from "@/utils/mock-chats";

type Filter = "all" | "starred";

function formatTimeAgo(daysAgo: number): string {
  if (daysAgo < 7) {
    return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
  }
  const weeks = Math.round(daysAgo / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

type Chat = MockChat;

const keyExtractor = (item: Chat) => item.id;

function ChatRow({
  item,
  onRename,
  onDelete,
  onStar,
}: {
  item: Chat;
  onRename: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
  onStar: (chat: Chat) => void;
}) {
  const handleRename = useCallback(() => onRename(item), [item, onRename]);
  const handleDelete = useCallback(() => onDelete(item), [item, onDelete]);
  const handleStar = useCallback(() => onStar(item), [item, onStar]);

  return (
    <Link asChild href="/">
      <Link.Trigger>
        <Pressable className="flex-row items-center px-5 py-4 active:bg-card">
          <View className="mr-3 flex-1 gap-0.5">
            <Text
              className="text-[17px] text-foreground dark:text-foreground"
              numberOfLines={1}
              selectable
            >
              {item.title}
            </Text>
            <Text className="text-[13px] text-muted-foreground dark:text-muted-foreground">
              {formatTimeAgo(item.daysAgo)}
            </Text>
          </View>
          {process.env.EXPO_OS === "ios" ? (
            <Image
              className="h-4 w-2.5 font-medium text-muted-foreground dark:text-muted-foreground"
              source="sf:chevron.right"
            />
          ) : (
            <Icon
              className="h-4 w-2.5 text-muted-foreground dark:text-muted-foreground"
              icon={ChevronRight}
            />
          )}
        </Pressable>
      </Link.Trigger>

      <Link.Menu>
        <Link.MenuAction
          icon={item.starred ? "star.fill" : "star"}
          onPress={handleStar}
          title={item.starred ? "Unstar" : "Star"}
        />
        <Link.MenuAction icon="pencil" onPress={handleRename} title="Rename" />
        <Link.MenuAction
          destructive
          icon="trash"
          onPress={handleDelete}
          title="Delete"
        />
      </Link.Menu>
    </Link>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 pt-32">
      <Icon className="h-10 w-10 text-muted-foreground" icon={Search} />
      <Text className="px-10 text-center text-[17px] text-muted-foreground">
        No results found for &ldquo;{query}&rdquo;
      </Text>
    </View>
  );
}

export default function ChatsScreen() {
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState(MOCK_CHATS);
  const [filter, setFilter] = useState<Filter>("all");
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    let results = chats;
    if (filter === "starred") {
      results = results.filter((c) => c.starred);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter((c) => c.title.toLowerCase().includes(q));
    }
    return results;
  }, [search, chats, filter]);

  const handleRename = useCallback((chat: Chat) => {
    Alert.prompt(
      "Rename Chat",
      undefined,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: (newTitle?: string) => {
            if (newTitle?.trim()) {
              setChats((prev) =>
                prev.map((c) =>
                  c.id === chat.id ? { ...c, title: newTitle.trim() } : c
                )
              );
            }
          },
          text: "OK",
        },
      ],
      "plain-text",
      chat.title
    );
  }, []);

  const handleDelete = useCallback((chat: Chat) => {
    Alert.alert("Delete Chat", `Delete "${chat.title}"?`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          setChats((prev) => prev.filter((c) => c.id !== chat.id));
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }, []);

  const handleStar = useCallback((chat: Chat) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, starred: !c.starred } : c))
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Chat>) => (
      <ChatRow
        item={item}
        onDelete={handleDelete}
        onRename={handleRename}
        onStar={handleStar}
      />
    ),
    [handleDelete, handleRename, handleStar]
  );

  const handleSearchCancel = useCallback(() => setSearch(""), []);

  const handleSearchChange = useCallback(
    (e: NativeSyntheticEvent<SearchBarTextEventData>) =>
      setSearch(e.nativeEvent.text),
    []
  );

  return (
    <>
      <FlatList
        automaticallyAdjustContentInsets
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustsScrollIndicatorInsets
        contentContainerStyle={{
          paddingBottom: process.env.EXPO_OS === "android" ? insets.bottom : 0,
        }}
        contentInsetAdjustmentBehavior="automatic"
        data={filtered}
        keyExtractor={keyExtractor}
        ListEmptyComponent={search ? <EmptySearch query={search} /> : undefined}
        renderItem={renderItem}
      />

      <Stack.SearchBar
        hideWhenScrolling={false}
        onCancelButtonPress={handleSearchCancel}
        onChangeText={handleSearchChange}
        placeholder="Search"
      />

      <LeftToolbar />
      <RightToolbar filter={filter} setFilter={setFilter} />
      <BottomToolbar />
    </>
  );
}

function LeftToolbar() {
  const { openDrawer } = useDrawer();

  if (process.env.EXPO_OS === "android") {
    return (
      <Stack.Toolbar asChild placement="left">
        <Pressable
          accessibilityLabel="Open drawer"
          accessibilityRole="button"
          className="-ml-1 p-2 active:opacity-60"
          onPress={openDrawer}
        >
          <Icon className="h-6 w-6 text-foreground" icon={Menu} />
        </Pressable>
      </Stack.Toolbar>
    );
  }
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
    </Stack.Toolbar>
  );
}

function RightToolbar({
  filter,
  setFilter,
}: {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}) {
  const showAll = useCallback(() => setFilter("all"), [setFilter]);
  const showStarred = useCallback(() => setFilter("starred"), [setFilter]);

  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="line.horizontal.3.decrease">
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            icon="bubble.left.and.bubble.right"
            isOn={filter === "all"}
            onPress={showAll}
          >
            All chats
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="star"
            isOn={filter === "starred"}
            onPress={showStarred}
          >
            Starred
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

function BottomToolbar() {
  const router = useRouter();
  const handleNewChat = useCallback(() => router.navigate("/"), [router]);

  return (
    <Stack.Toolbar placement="bottom">
      {isLiquidGlassAvailable() && (
        <Stack.Toolbar.SearchBarSlot separateBackground />
      )}
      <Stack.Toolbar.Button
        icon="square.and.pencil"
        onPress={handleNewChat}
        separateBackground
        tintColor={Color.ios.label}
      />
    </Stack.Toolbar>
  );
}
