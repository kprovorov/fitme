import type { LucideIcon } from "lucide-react-native";
import {
  Archive,
  Camera,
  ChevronRight,
  File,
  Globe,
  Image as ImageIcon,
  Paintbrush,
  Sparkles,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import { Switch } from "~/components/ui/switch";

function AttachmentButton({
  icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Pressable
      className="flex-1 items-center gap-2 rounded-xl bg-secondary py-3 active:bg-muted dark:bg-secondary"
      style={{ borderCurve: "continuous" }}
    >
      <Icon
        className="h-6 w-6 text-foreground dark:text-foreground"
        icon={icon}
      />
      <Text className="text-[13px] text-foreground dark:text-foreground">
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
  icon: LucideIcon;
  label: string;
  badge?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3.5 px-5 py-3">
      <Icon
        className="h-5 w-5 text-foreground dark:text-foreground"
        icon={icon}
      />
      <Text className="flex-1 text-[17px] text-foreground dark:text-foreground">
        {label}
      </Text>
      {badge && (
        <View className="rounded bg-muted px-1.5 py-0.5 dark:bg-muted">
          <Text className="font-medium text-[11px] text-muted-foreground dark:text-muted-foreground">
            {badge}
          </Text>
        </View>
      )}
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
  icon: LucideIcon;
  label: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-muted"
      onPress={onPress}
    >
      <Icon
        className="h-5 w-5 text-foreground dark:text-foreground"
        icon={icon}
      />
      <Text className="flex-1 text-[17px] text-foreground dark:text-foreground">
        {label}
      </Text>
      <Text className="text-[15px] text-muted-foreground dark:text-muted-foreground">
        {detail}
      </Text>
      <Icon
        className="h-3 w-3 text-muted-foreground dark:text-muted-foreground"
        icon={ChevronRight}
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
        <AttachmentButton icon={Camera} label="Camera" />
        <AttachmentButton icon={ImageIcon} label="Photos" />
        <AttachmentButton icon={File} label="Files" />
      </View>

      {/* Toggles */}
      <ToggleRow
        icon={Sparkles}
        label="Research"
        onValueChange={setResearch}
        value={research}
      />
      <ToggleRow
        badge="Beta"
        icon={Globe}
        label="Web search"
        onValueChange={setWebSearch}
        value={webSearch}
      />

      {/* Divider */}
      <View className="mx-5 my-1 h-px bg-border dark:bg-border" />

      {/* Disclosure rows */}
      <DisclosureRow detail="None" icon={Archive} label="Add to project" />
      <DisclosureRow detail="Normal" icon={Paintbrush} label="Choose style" />
      <DisclosureRow detail="Auto" icon={Wrench} label="Tool access" />
    </ScrollView>
  );
}
