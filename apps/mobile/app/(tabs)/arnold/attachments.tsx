import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { AndroidGrabber } from "@/components/grabber";
import { SymbolImage } from "@/components/symbol-image";
import { Switch } from "~/components/ui/switch";

function AttachmentButton({ icon, label }: { icon: SFSymbol; label: string }) {
  return (
    <Pressable
      className="flex-1 items-center gap-2 rounded-xl bg-secondary py-3 active:bg-muted dark:bg-secondary"
      style={{ borderCurve: "continuous" }}
    >
      <SymbolImage className="text-foreground text-title-3" name={icon} />
      <Text className="text-footnote text-foreground dark:text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  badge,
  value,
  onValueChange,
}: {
  icon: SFSymbol;
  label: string;
  badge?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3.5 px-5 py-3">
      <SymbolImage className="text-body text-foreground" name={icon} />
      <Text className="flex-1 text-body text-foreground dark:text-foreground">
        {label}
      </Text>
      {badge ? (
        <View className="rounded bg-muted px-1.5 py-0.5 dark:bg-muted">
          <Text className="text-caption-2-emphasized text-muted-foreground dark:text-muted-foreground">
            {badge}
          </Text>
        </View>
      ) : null}
      <Switch onValueChange={onValueChange} value={value} />
    </View>
  );
}

function DisclosureRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-muted"
      onPress={onPress}
    >
      <SymbolImage className="text-body text-foreground" name={icon} />
      <Text className="flex-1 text-body text-foreground dark:text-foreground">
        {label}
      </Text>
      <Text className="text-muted-foreground text-subhead dark:text-muted-foreground">
        {detail}
      </Text>
      <SymbolImage
        className="text-muted-foreground text-subhead"
        name="chevron.right"
      />
    </Pressable>
  );
}

export default function AddToChatSheet() {
  const [research, setResearch] = useState(false);
  const [webSearch, setWebSearch] = useState(true);

  return (
    <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic">
      <AndroidGrabber />
      {/* Attachment buttons */}
      <View className="flex-row gap-3 px-5 pt-2 pb-4">
        <AttachmentButton icon="camera" label="Camera" />
        <AttachmentButton icon="photo" label="Photos" />
        <AttachmentButton icon="doc" label="Files" />
      </View>

      {/* Toggles */}
      <ToggleRow
        icon="sparkles"
        label="Research"
        onValueChange={setResearch}
        value={research}
      />
      <ToggleRow
        badge="Beta"
        icon="globe"
        label="Web search"
        onValueChange={setWebSearch}
        value={webSearch}
      />

      {/* Divider */}
      <View className="mx-5 my-1 h-px bg-border dark:bg-border" />

      {/* Disclosure rows */}
      <DisclosureRow detail="None" icon="archivebox" label="Add to project" />
      <DisclosureRow detail="Normal" icon="paintbrush" label="Choose style" />
      <DisclosureRow detail="Auto" icon="wrench" label="Tool access" />
    </ScrollView>
  );
}
