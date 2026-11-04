import { useHeaderHeight } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { AndroidGrabber } from "@/components/grabber";
import { SymbolImage } from "@/components/symbol-image";
import { GLASS_ENABLED } from "~/components/ui/swift-ui";

function AttachmentButton({ icon, label }: { icon: SFSymbol; label: string }) {
  return (
    // `secondary` and `muted` are a shade apart, so a pressed fill would be
    // invisible on this one: the tile dims instead. No side padding: at the
    // largest text size it breaks "Camera" mid-word, and a whole label close
    // to the edge reads better than a broken one.
    <Pressable
      accessibilityRole="button"
      className="flex-1 items-center gap-2 rounded-xl border-continuous bg-secondary py-3 active:opacity-80"
    >
      <SymbolImage className="text-foreground text-title-3" name={icon} />
      <Text className="text-footnote text-foreground">{label}</Text>
    </Pressable>
  );
}

/**
 * What a User can add to a message to Arnold: a photo from the camera or
 * from their library (ADR 0018). Both buttons are still inert; the tickets
 * after this one wire them up.
 *
 * The sheet is short enough to fit its contents, and nothing here scrolls, so
 * it clears the header itself: a glass header floats over the content (the
 * stack sets `headerTransparent` for it), and only then.
 */
export default function AddToChatSheet() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      style={{
        // iOS floats the sheet above the home indicator itself.
        paddingBottom:
          process.env.EXPO_OS === "android" ? insets.bottom : undefined,
        paddingTop: GLASS_ENABLED ? headerHeight : undefined,
      }}
    >
      <AndroidGrabber />
      <View className="flex-row gap-3 px-5 pt-2 pb-4">
        <AttachmentButton
          icon="camera"
          label={t("arnold.attachments.camera")}
        />
        <AttachmentButton icon="photo" label={t("arnold.attachments.photos")} />
      </View>
    </View>
  );
}
