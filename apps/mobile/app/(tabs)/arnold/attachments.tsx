import { captureException } from "@sentry/react-native";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { ScopedVariables } from "uniwind";

import { AndroidGrabber } from "@/components/grabber";
import { SymbolImage } from "@/components/symbol-image";
import { GLASS_ENABLED } from "~/components/ui/swift-ui";
import {
  addArnoldAttachments,
  arnoldAttachmentsOwner,
  MAX_ATTACHMENTS_PER_MESSAGE,
  useRemainingAttachmentSlots,
} from "~/hooks/arnold-attachments";
import { pickLibraryPhotos } from "~/lib/arnold-attachment-picker";
import { cn } from "~/lib/utils";

const AttachmentButton = ({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
}) => (
  // `secondary` and `muted` are a shade apart, so a pressed fill would be
  // invisible on this one: the tile dims instead. No side padding: at the
  // largest text size it breaks "Camera" mid-word, and a whole label close
  // to the edge reads better than a broken one.
  <Pressable
    accessibilityRole="button"
    className={cn(
      "border-continuous bg-secondary flex-1 items-center gap-2 rounded-xl py-3 active:opacity-80",
      disabled && "opacity-50"
    )}
    disabled={disabled}
    onPress={onPress}
  >
    <SymbolImage className="text-foreground text-title-3" name={icon} />
    <Text className="text-footnote text-foreground">{label}</Text>
  </Pressable>
);

/**
 * What a User can add to a message to Arnold: a photo from the camera or
 * from their library (ADR 0018). Camera is still inert; the ticket after
 * this one wires it up.
 *
 * The sheet is short enough to fit its contents, and nothing here scrolls, so
 * it clears the header itself: a glass header floats over the content (the
 * stack sets `headerTransparent` for it), and only then.
 */
const AddToChatSheet = () => {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const remaining = useRemainingAttachmentSlots();
  // The message takes no more: Photos is disabled and says why, so the cap
  // is met here rather than when the send fails, and no tap goes nowhere.
  const isFull = remaining <= 0;
  // While the system picker is up and the photos are being re-encoded: the
  // picker covers the sheet, but a second tap landing either side of it
  // would open a second one.
  const [isPicking, setIsPicking] = useState(false);
  // Shown when nothing the User picked could be read: the sheet stays open,
  // so they can try another photo rather than wonder what happened.
  const [hasFailed, setHasFailed] = useState(false);

  const pickPhotos = useCallback(async () => {
    // The picker reads 0 as "no limit", so it is never opened without room.
    if (remaining <= 0) {
      return;
    }

    setIsPicking(true);
    setHasFailed(false);
    // Read before the await: the picker and the re-encoding take a while,
    // and the store drops what comes back for a User who has signed out.
    const startedFor = arnoldAttachmentsOwner();

    try {
      const picked = await pickLibraryPhotos(remaining);

      // Cancelled: nothing picked, nothing to show, the sheet stays open.
      if (picked) {
        if (picked.images.length > 0) {
          addArnoldAttachments(picked.images, startedFor);
          router.back();
        } else {
          setHasFailed(picked.failed > 0);
        }
      }
    } catch (error) {
      // The picker itself failed, which is rarer than a photo failing.
      captureException(error);
      setHasFailed(true);
    }

    setIsPicking(false);
  }, [remaining, router]);

  return (
    <ScopedVariables
      variables={{
        "--attachment-bottom": insets.bottom,
        "--attachment-top": headerHeight,
      }}
    >
      <View
        className={cn(
          // iOS floats the sheet above the home indicator itself.
          process.env.EXPO_OS === "android" && "pb-(--attachment-bottom)",
          GLASS_ENABLED && "pt-(--attachment-top)"
        )}
      >
        <AndroidGrabber />
        <View className="px-md pb-md gap-3 pt-2">
          <View className="flex-row gap-3">
            <AttachmentButton
              icon="camera"
              label={t("arnold.attachments.camera")}
            />
            <AttachmentButton
              disabled={isPicking || isFull}
              icon="photo"
              label={t("arnold.attachments.photos")}
              onPress={pickPhotos}
            />
          </View>
          {isFull || hasFailed ? (
            <View className="border-continuous bg-card rounded-xl px-3 py-2.5">
              <Text className="text-footnote text-muted-foreground">
                {isFull
                  ? t("arnold.attachments.perMessageLimit", {
                      count: MAX_ATTACHMENTS_PER_MESSAGE,
                    })
                  : t("arnold.attachments.pickFailed")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScopedVariables>
  );
};

export default AddToChatSheet;
