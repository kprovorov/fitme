import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { AndroidGrabber } from "@/components/grabber";
import { SymbolImage } from "@/components/symbol-image";
import { GLASS_ENABLED } from "~/components/ui/swift-ui";
import {
  addArnoldAttachments,
  MAX_ATTACHMENTS_PER_MESSAGE,
  useRemainingAttachmentSlots,
} from "~/hooks/arnold-attachments";
import { pickLibraryPhotos } from "~/lib/arnold-attachment-picker";

function AttachmentButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
}) {
  return (
    // `secondary` and `muted` are a shade apart, so a pressed fill would be
    // invisible on this one: the tile dims instead. No side padding: at the
    // largest text size it breaks "Camera" mid-word, and a whole label close
    // to the edge reads better than a broken one.
    <Pressable
      accessibilityRole="button"
      className="flex-1 items-center gap-2 rounded-xl border-continuous bg-secondary py-3 active:opacity-80"
      disabled={disabled}
      onPress={onPress}
    >
      <SymbolImage className="text-foreground text-title-3" name={icon} />
      <Text className="text-footnote text-foreground">{label}</Text>
    </Pressable>
  );
}

/**
 * What a User can add to a message to Arnold: a photo from the camera or
 * from their library (ADR 0018). Camera is still inert; the ticket after
 * this one wires it up.
 *
 * The sheet is short enough to fit its contents, and nothing here scrolls, so
 * it clears the header itself: a glass header floats over the content (the
 * stack sets `headerTransparent` for it), and only then.
 */
export default function AddToChatSheet() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const remaining = useRemainingAttachmentSlots();
  // Shown once the User asks for a photo the message has no room for, so
  // they learn the cap where they met it rather than when the send fails.
  const [isFull, setIsFull] = useState(false);
  // While the system picker is up and the photos are being re-encoded: the
  // picker covers the sheet, but a second tap landing either side of it
  // would open a second one.
  const [isPicking, setIsPicking] = useState(false);

  const pickPhotos = useCallback(async () => {
    if (remaining <= 0) {
      setIsFull(true);
      return;
    }
    setIsPicking(true);
    try {
      const picked = await pickLibraryPhotos(remaining);
      // Cancelled: nothing picked, nothing to show, the sheet stays open.
      if (picked) {
        addArnoldAttachments(picked);
        router.back();
      }
    } finally {
      setIsPicking(false);
    }
  }, [remaining, router]);

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
      <View className="gap-2 px-5 pt-2 pb-4">
        <View className="flex-row gap-3">
          <AttachmentButton
            icon="camera"
            label={t("arnold.attachments.camera")}
          />
          <AttachmentButton
            disabled={isPicking}
            icon="photo"
            label={t("arnold.attachments.photos")}
            onPress={pickPhotos}
          />
        </View>
        {isFull ? (
          <Text className="text-footnote text-muted-foreground">
            {t("arnold.attachments.perMessageLimit", {
              count: MAX_ATTACHMENTS_PER_MESSAGE,
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
